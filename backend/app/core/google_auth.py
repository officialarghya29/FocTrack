"""Google ID token verification.

The browser receives a signed ID token from Google Identity Services. The
backend verifies the signature against Google's published keys, checks the
audience, issuer and expiry, and only then trusts the claims. A client-supplied
email is never trusted on its own.
"""

from __future__ import annotations

import jwt
from jwt import PyJWKClient

from app.core.security import AuthError

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

_jwk_client = PyJWKClient(GOOGLE_CERTS_URL, cache_keys=True)


def verify_google_id_token(token: str, audience: str) -> dict:
    if not audience:
        raise AuthError("Google sign-in is not configured on this server.", 503)
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience,
            issuer=list(GOOGLE_ISSUERS),
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
    except jwt.InvalidTokenError as exc:
        raise AuthError("Google sign-in could not be verified.") from exc
    except Exception as exc:  # network / key lookup failures
        raise AuthError("Google sign-in is temporarily unavailable.", 503) from exc
    return claims
