from __future__ import annotations

from fastapi import Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.security import AuthError, bearer_token, decode_access_token
from app.database.session import get_db
from app.models import User


def current_user(
    request: Request, db: Session = Depends(get_db)
) -> User:
    """Resolve the signed-in account from its bearer access token.

    The token carries the user id and the account's token version. A token
    issued before a password change or a global sign-out has a stale version
    and is rejected even though its signature is valid.
    """
    token = bearer_token(request.headers.get("authorization"))
    payload = decode_access_token(token)
    user = db.get(User, payload["user_id"])
    if user is None:
        raise AuthError("Your session is no longer valid. Sign in again.")
    if int(payload.get("tv", -1)) != int(user.token_version):
        raise AuthError("Your session is no longer valid. Sign in again.")
    return user


def tz_offset(
    tz_offset_minutes: int = Query(
        default=0,
        ge=-840,
        le=840,
        alias="tzOffsetMinutes",
        description="Browser timezone offset (Date.getTimezoneOffset()) in minutes.",
    )
) -> int:
    return tz_offset_minutes
