"""Password hashing, access tokens and refresh-token primitives.

Password hashes use the standard library's scrypt so the only moving parts are
reviewed, widely deployed code. Access tokens are short-lived HS256 JWTs; the
long-lived refresh token is an opaque random string whose SHA-256 digest is the
only thing stored. That means a leaked database cannot be replayed as a login.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings

SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16
KEY_BYTES = 32

PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 128

# A very small denylist of passwords that appear in every breach corpus. It is
# intentionally short: length is the stronger defence here.
COMMON_PASSWORDS = {
    "1234567890",
    "12345678901",
    "123456789012",
    "password123",
    "password1234",
    "qwertyuiop",
    "qwerty12345",
    "letmein123",
    "iloveyou123",
    "admin12345",
    "welcome12345",
    "changeme123",
    "foctrack123",
}

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"


class AuthError(Exception):
    """An authentication failure with an HTTP status and safe message."""

    def __init__(self, detail: str, status_code: int = 401) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=KEY_BYTES,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64encode(salt)}${_b64encode(derived)}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        scheme, n_raw, r_raw, p_raw, salt_raw, hash_raw = encoded.split("$")
        if scheme != "scrypt":
            return False
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_b64decode(salt_raw),
            n=int(n_raw),
            r=int(r_raw),
            p=int(p_raw),
            dklen=len(_b64decode(hash_raw)),
        )
        return hmac.compare_digest(derived, _b64decode(hash_raw))
    except (ValueError, TypeError):
        return False


# Verifying against a real hash when the account does not exist keeps the
# response time for "unknown email" close to "wrong password".
_DUMMY_HASH = hash_password("focustrack-dummy-password")


def burn_password_check(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


def password_problem(password: str) -> str | None:
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Use at least {PASSWORD_MIN_LENGTH} characters."
    if len(password) > PASSWORD_MAX_LENGTH:
        return f"Use at most {PASSWORD_MAX_LENGTH} characters."
    if password.strip().lower() in COMMON_PASSWORDS:
        return "That password is too common. Choose something less predictable."
    return None


def normalise_email(email: str) -> str:
    return email.strip().lower()


def valid_email(email: str) -> bool:
    return bool(EMAIL_PATTERN.match(email)) and len(email) <= 255


def create_access_token(user_id: int, token_version: int) -> tuple[str, int]:
    """Return a signed access token and its lifetime in seconds."""
    now = datetime.now(timezone.utc)
    expires_in = settings.access_token_minutes * 60
    payload = {
        "sub": str(user_id),
        "tv": token_version,
        "type": ACCESS_TOKEN_TYPE,
        # A unique id keeps two tokens issued in the same second distinct.
        "jti": secrets.token_urlsafe(9),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in)).timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)
    return token, expires_in


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Your session has expired. Sign in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Invalid authentication token.") from exc

    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise AuthError("Invalid authentication token.")
    try:
        payload["user_id"] = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise AuthError("Invalid authentication token.") from exc
    return payload


def new_refresh_token() -> tuple[str, str, datetime]:
    """Return (raw token, sha256 digest, expiry). Only the digest is stored."""
    raw = secrets.token_urlsafe(48)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days)
    return raw, digest, expires_at


def refresh_token_digest(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise AuthError("Authentication required.")
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        raise AuthError("Authentication required.")
    return value.strip()
