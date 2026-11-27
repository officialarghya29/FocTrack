"""Account lifecycle and session issuance.

Every function here is intentionally small and explicit: registration creates
the user plus the same default settings and categories the local-profile
bootstrap used to create, and session issuance is the only place that mints
tokens.
"""

from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from urllib.parse import quote

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.google_auth import verify_google_id_token
from app.core.security import (
    AuthError,
    create_access_token,
    create_action_token,
    decode_action_token,
    hash_password,
    new_refresh_token,
    normalise_email,
    password_problem,
    refresh_token_digest,
    valid_email,
    verify_password,
)
from app.models import Category, RefreshToken, User, UserSettings
from app.services import email_service
from app.services.profile_service import DEFAULT_CATEGORIES, DEFAULT_PROFILE_NAME

logger = logging.getLogger("foctrack")

PASSWORD_RESET_MINUTES = 30
EMAIL_VERIFY_MINUTES = 24 * 60
INVALID_LINK = "This link is invalid or has expired. Request a new one."


def create_user_with_defaults(
    db: Session,
    *,
    username: str,
    email: str | None,
    password_hash: str | None = None,
    google_sub: str | None = None,
    email_verified: bool = False,
) -> User:
    user = User(
        username=username.strip() or DEFAULT_PROFILE_NAME,
        email=email,
        password_hash=password_hash,
        google_sub=google_sub,
        email_verified=1 if email_verified else 0,
    )
    db.add(user)
    try:
        db.flush()
        db.add(UserSettings(user_id=user.id))
        for name, color in DEFAULT_CATEGORIES:
            db.add(Category(user_id=user.id, name=name, color=color, is_default=True))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AuthError("An account with that email already exists.", 409) from exc
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalise_email(email)))


def register(db: Session, *, email: str, password: str, username: str) -> User:
    normalised = normalise_email(email)
    if not valid_email(normalised):
        raise AuthError("Enter a valid email address.", 422)
    problem = password_problem(password)
    if problem:
        raise AuthError(problem, 422)
    if get_user_by_email(db, normalised) is not None:
        # Neutral wording: registration must not confirm which addresses exist.
        raise AuthError(
            "That email cannot be used. Try signing in or use another address.", 409
        )
    return create_user_with_defaults(
        db,
        username=username,
        email=normalised,
        password_hash=hash_password(password),
        email_verified=False,
    )


def _action_link(path: str, token: str) -> str:
    return f"{settings.app_url.rstrip('/')}/{path}?token={quote(token)}"


def send_verification_email(user: User) -> bool:
    """Send (or log) an address-verification link for a password account."""
    if not user.email or not user.password_hash or user.email_verified:
        return False
    token = create_action_token(
        user.id,
        "email_verify",
        minutes=EMAIL_VERIFY_MINUTES,
        email=user.email,
    )
    link = _action_link("verify-email", token)
    name = html.escape(user.username or "there")
    text = (
        f"Hi {user.username or 'there'},\n\n"
        "Confirm this address to finish setting up your FocTrack account:\n"
        f"{link}\n\nThis link works once and expires in 24 hours. "
        "If you did not create the account, ignore this message."
    )
    body = (
        f"<p>Hi {name},</p>"
        "<p>Confirm this address to finish setting up your FocTrack account.</p>"
        f'<p><a href="{html.escape(link)}">Verify my email</a></p>'
        "<p>This link works once and expires in 24 hours. "
        "If you did not create the account, ignore this message.</p>"
    )
    return email_service.send_email(
        to=user.email,
        subject="Verify your FocTrack email",
        text=text,
        html=body,
    )


def send_verification_best_effort(user: User) -> None:
    """Registration must succeed even when the mail provider misbehaves."""
    try:
        send_verification_email(user)
    except AuthError as exc:
        logger.warning("Verification email not sent for user %s: %s", user.id, exc.detail)


def request_password_reset(db: Session, email: str) -> None:
    """Start a reset without revealing whether the address has an account."""
    email_service.require_configured()
    user = get_user_by_email(db, email)
    if user is None or not user.password_hash or not user.email:
        return
    token = create_action_token(
        user.id,
        "password_reset",
        minutes=PASSWORD_RESET_MINUTES,
        token_version=user.token_version,
    )
    link = _action_link("reset-password", token)
    text = (
        f"Hi {user.username or 'there'},\n\n"
        "Use this link to choose a new FocTrack password:\n"
        f"{link}\n\nThis link works once, expires in 30 minutes, and signs out "
        "every other session. If you did not ask for this, ignore the message."
    )
    body = (
        f"<p>Hi {html.escape(user.username or 'there')},</p>"
        "<p>Use the link below to choose a new FocTrack password.</p>"
        f'<p><a href="{html.escape(link)}">Choose a new password</a></p>'
        "<p>This link works once, expires in 30 minutes, and signs out every "
        "other session. If you did not ask for this, ignore the message.</p>"
    )
    email_service.send_email(
        to=user.email,
        subject="Reset your FocTrack password",
        text=text,
        html=body,
    )


def reset_password(db: Session, token: str, new_password: str) -> None:
    claims = decode_action_token(token, "password_reset")
    user = db.get(User, claims["user_id"])
    if (
        user is None
        or not user.password_hash
        or claims.get("tv") != user.token_version
    ):
        raise AuthError(INVALID_LINK, 400)
    problem = password_problem(new_password)
    if problem:
        raise AuthError(problem, 422)
    user.password_hash = hash_password(new_password)
    # Rotating the token version makes this link single-use and ends every
    # existing session, which is the safe outcome after a reset.
    revoke_all(db, user.id)
    db.commit()


def verify_email(db: Session, token: str) -> User:
    claims = decode_action_token(token, "email_verify")
    user = db.get(User, claims["user_id"])
    if (
        user is None
        or not user.email
        or claims.get("email") != user.email
        or not valid_email(user.email)
    ):
        raise AuthError(INVALID_LINK, 400)
    if not user.email_verified:
        user.email_verified = 1
        db.commit()
    return user


def request_email_verification(db: Session, email: str) -> None:
    email_service.require_configured()
    user = get_user_by_email(db, email)
    if user is None:
        return
    send_verification_email(user)


def authenticate(db: Session, *, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    if user is None:
        from app.core.security import burn_password_check

        burn_password_check(password)
        raise AuthError("Email or password is incorrect.")
    if not verify_password(password, user.password_hash):
        raise AuthError("Email or password is incorrect.")
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return user


def google_sign_in_with_token(db: Session, id_token: str) -> User:
    claims = verify_google_id_token(id_token, settings.google_client_id)
    return google_sign_in(db, claims=claims)


def google_sign_in(db: Session, *, claims: dict) -> User:
    subject = str(claims.get("sub") or "").strip()
    email = normalise_email(str(claims.get("email") or ""))
    if not subject or not email or not valid_email(email):
        raise AuthError("Google sign-in did not return a usable account.", 401)
    if not claims.get("email_verified"):
        raise AuthError("Your Google email address is not verified.", 403)

    user = db.scalar(select(User).where(User.google_sub == subject))
    if user is None:
        user = get_user_by_email(db, email)
        if user is not None:
            if user.google_sub and user.google_sub != subject:
                raise AuthError("This email is already linked to another sign-in method.", 409)
            if not user.email_verified:
                # Linking by an address that was never proven would let whoever
                # registered first capture the real owner's Google identity.
                raise AuthError(
                    "This email already has an account. Sign in with its password first.",
                    409,
                )
            user.google_sub = subject
            db.commit()
        else:
            user = create_user_with_defaults(
                db,
                username=str(claims.get("name") or email.split("@")[0]),
                email=email,
                google_sub=subject,
                email_verified=True,
            )
    user.last_login_at = datetime.now(timezone.utc)
    if not user.email_verified:
        user.email_verified = 1
    db.commit()
    db.refresh(user)
    return user


def issue_session(db: Session, user: User) -> dict:
    access_token, expires_in = create_access_token(user.id, user.token_version)
    raw_refresh, digest, expires_at = new_refresh_token()
    db.add(
        RefreshToken(user_id=user.id, token_hash=digest, expires_at=expires_at)
    )
    db.commit()
    return {
        "access_token": access_token,
        "refresh_token": raw_refresh,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": user,
    }


def _live_token(db: Session, raw: str) -> RefreshToken:
    digest = refresh_token_digest(raw)
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == digest))
    if token is None:
        raise AuthError("Your session is no longer valid. Sign in again.")
    if token.revoked_at is not None:
        # A rotated token was replayed: assume theft and end every session.
        revoke_all(db, token.user_id)
        db.commit()
        raise AuthError("Your session is no longer valid. Sign in again.")
    if token.expires_at <= datetime.now(timezone.utc):
        token.revoked_at = datetime.now(timezone.utc)
        db.commit()
        raise AuthError("Your session has expired. Sign in again.")
    return token


def refresh_session(db: Session, raw_refresh: str) -> dict:
    token = _live_token(db, raw_refresh)
    user = db.get(User, token.user_id)
    if user is None:
        raise AuthError("Your session is no longer valid. Sign in again.")
    token.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return issue_session(db, user)


def logout(db: Session, raw_refresh: str) -> None:
    digest = refresh_token_digest(raw_refresh)
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == digest))
    if token is not None and token.revoked_at is None:
        token.revoked_at = datetime.now(timezone.utc)
        db.commit()


def revoke_all(db: Session, user_id: int) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    db.execute(
        update(User)
        .where(User.id == user_id)
        .values(token_version=User.token_version + 1)
    )


def logout_all(db: Session, user: User) -> None:
    revoke_all(db, user.id)
    db.commit()


def change_password(db: Session, user: User, current: str, new: str) -> dict:
    if user.password_hash:
        if not verify_password(current, user.password_hash):
            raise AuthError("Your current password is incorrect.", 403)
    else:
        raise AuthError(
            "This account signs in with Google. Set a password from the account settings.",
            400,
        )
    problem = password_problem(new)
    if problem:
        raise AuthError(problem, 422)
    if verify_password(new, user.password_hash):
        raise AuthError("Choose a password different from your current one.", 422)
    user.password_hash = hash_password(new)
    db.commit()
    revoke_all(db, user.id)
    db.commit()
    db.refresh(user)
    return issue_session(db, user)


def delete_account(db: Session, user: User, password: str | None, google_token: str | None) -> None:
    if user.password_hash:
        if not password or not verify_password(password, user.password_hash):
            raise AuthError("Enter your password to delete this account.", 403)
    elif user.google_sub:
        if not google_token:
            raise AuthError("Confirm with Google to delete this account.", 403)
        claims = verify_google_id_token(google_token, settings.google_client_id)
        if str(claims.get("sub")) != user.google_sub:
            raise AuthError("That Google account does not match.", 403)
    db.delete(user)
    db.commit()
