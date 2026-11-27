from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.core.rate_limit import enforce
from app.database.session import get_db
from app.models import User
from app.schemas.auth import (
    ChangePasswordIn,
    DeleteAccountIn,
    GoogleIn,
    LoginIn,
    RefreshIn,
    RegisterIn,
    SessionOut,
    UserOut,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "email_verified": bool(user.email_verified),
        "has_password": bool(user.password_hash),
        "created_at": user.created_at,
    }


def session_out(session: dict) -> dict:
    return {**session, "user": user_out(session["user"])}


@router.post("/register", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, request: Request, db: Session = Depends(get_db)):
    enforce(request, "register", limit=5, window_seconds=3600)
    user = auth_service.register(
        db, email=payload.email, password=payload.password, username=payload.username
    )
    return session_out(auth_service.issue_session(db, user))


@router.post("/login", response_model=SessionOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    enforce(request, "login", 5, 60, payload.email)
    user = auth_service.authenticate(
        db, email=payload.email, password=payload.password
    )
    return session_out(auth_service.issue_session(db, user))


@router.post("/google", response_model=SessionOut)
def google(payload: GoogleIn, request: Request, db: Session = Depends(get_db)):
    enforce(request, "google", limit=20, window_seconds=60)
    user = auth_service.google_sign_in_with_token(db, payload.id_token)
    return session_out(auth_service.issue_session(db, user))


@router.post("/refresh", response_model=SessionOut)
def refresh(payload: RefreshIn, request: Request, db: Session = Depends(get_db)):
    enforce(request, "refresh", limit=30, window_seconds=60)
    return session_out(auth_service.refresh_session(db, payload.refresh_token))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshIn, db: Session = Depends(get_db)):
    # Always 204: a caller must not learn whether a token was live.
    auth_service.logout(db, payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(
    db: Session = Depends(get_db), user: User = Depends(current_user)
):
    auth_service.logout_all(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.post("/change-password", response_model=SessionOut)
def change_password(
    payload: ChangePasswordIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    session = auth_service.change_password(
        db, user, payload.current_password, payload.new_password
    )
    return session_out(session)


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    payload: DeleteAccountIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    auth_service.delete_account(db, user, payload.password, payload.google_id_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
