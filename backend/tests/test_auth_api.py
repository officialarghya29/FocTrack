from __future__ import annotations

import re
import time

import jwt
import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.core.security import AuthError, create_access_token
from app.services import email_service
from tests.conftest import start_session

PASSWORD = "a-long-unique-password-9"
NEW_PASSWORD = "another-strong-password-7"


def register(client, email="new@example.com", password=PASSWORD, username="New User"):
    return client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "username": username},
    )


def login(client, email="test@example.com", password="test-password-123"):
    return client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_register_creates_private_account_with_defaults(env):
    response = register(env.anonymous_client)
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["tokenType"] == "bearer"
    assert payload["user"]["email"] == "new@example.com"
    assert payload["user"]["hasPassword"] is True

    # The new account starts with exactly the documented defaults.
    headers = bearer(payload["accessToken"])
    assert len(env.anonymous_client.get("/api/v1/categories", headers=headers).json()) == 8
    assert env.anonymous_client.get("/api/v1/settings", headers=headers).status_code == 200
    assert env.anonymous_client.get("/api/v1/sessions", headers=headers).json()["total"] == 0
    me = env.anonymous_client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["username"] == "New User"


def test_duplicate_email_is_rejected_neutrally(env):
    assert register(env.anonymous_client, email="Dup@Example.com").status_code == 201
    second = register(env.anonymous_client, email="dup@example.com")
    assert second.status_code == 409
    assert "already exists" not in second.json()["detail"].lower()


def test_login_and_unknown_email_share_one_message(env):
    unknown = login(env.anonymous_client, email="nobody@example.com")
    wrong = login(env.anonymous_client, email="test@example.com", password="wrong-password")
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"]
    assert login(env.anonymous_client).status_code == 200


def test_missing_and_forged_tokens_are_rejected(env):
    anonymous = env.anonymous_client.get("/api/v1/sessions")
    assert anonymous.status_code == 401
    assert anonymous.headers["www-authenticate"] == "Bearer"

    forged = env.anonymous_client.get(
        "/api/v1/sessions", headers={"Authorization": "Bearer not-a-jwt"}
    )
    assert forged.status_code == 401

    expired = jwt.encode(
        {
            "sub": str(env.user_id),
            "tv": 0,
            "type": "access",
            "iat": int(time.time()) - 7200,
            "exp": int(time.time()) - 3600,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    assert env.anonymous_client.get("/api/v1/sessions", headers=bearer(expired)).status_code == 401

    stale_version, _ = create_access_token(env.user_id, 99)
    assert (
        env.anonymous_client.get("/api/v1/sessions", headers=bearer(stale_version)).status_code
        == 401
    )


def test_refresh_rotates_and_detects_replay(env):
    session = login(env.anonymous_client).json()
    refreshed = env.anonymous_client.post(
        "/api/v1/auth/refresh", json={"refreshToken": session["refreshToken"]}
    )
    assert refreshed.status_code == 200, refreshed.text
    rotated = refreshed.json()
    assert rotated["refreshToken"] != session["refreshToken"]
    assert rotated["accessToken"] != session["accessToken"]

    replay = env.anonymous_client.post(
        "/api/v1/auth/refresh", json={"refreshToken": session["refreshToken"]}
    )
    assert replay.status_code == 401

    # Replaying a rotated token revokes the whole family, including the token
    # that rotation produced.
    family = env.anonymous_client.post(
        "/api/v1/auth/refresh", json={"refreshToken": rotated["refreshToken"]}
    )
    assert family.status_code == 401


def test_logout_and_logout_all(env):
    session = login(env.anonymous_client).json()
    assert (
        env.anonymous_client.post(
            "/api/v1/auth/logout", json={"refreshToken": session["refreshToken"]}
        ).status_code
        == 204
    )
    assert (
        env.anonymous_client.post(
            "/api/v1/auth/refresh", json={"refreshToken": session["refreshToken"]}
        ).status_code
        == 401
    )

    live = login(env.anonymous_client).json()
    assert (
        env.anonymous_client.post(
            "/api/v1/auth/logout-all", headers=bearer(live["accessToken"])
        ).status_code
        == 204
    )
    # Existing access tokens die immediately because token_version moved.
    assert (
        env.anonymous_client.get(
            "/api/v1/sessions", headers=bearer(live["accessToken"])
        ).status_code
        == 401
    )


def test_change_password_requires_current_and_revokes_sessions(env):
    session = login(env.anonymous_client).json()
    headers = bearer(session["accessToken"])

    wrong = env.anonymous_client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"currentPassword": "not-it-at-all", "newPassword": NEW_PASSWORD},
    )
    assert wrong.status_code == 403

    weak = env.anonymous_client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"currentPassword": "test-password-123", "newPassword": "short"},
    )
    assert weak.status_code == 422

    changed = env.anonymous_client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"currentPassword": "test-password-123", "newPassword": NEW_PASSWORD},
    )
    assert changed.status_code == 200, changed.text

    assert env.anonymous_client.get("/api/v1/sessions", headers=headers).status_code == 401
    assert login(env.anonymous_client, password=NEW_PASSWORD).status_code == 200
    assert login(env.anonymous_client, password="test-password-123").status_code == 401


def test_google_sign_in_creates_links_and_rejects_unverified(env, monkeypatch):
    claims = {
        "sub": "google-subject-1",
        "email": "google@example.com",
        "email_verified": True,
        "name": "Google Person",
    }
    monkeypatch.setattr(
        "app.services.auth_service.verify_google_id_token",
        lambda token, audience: claims,
    )
    created = env.anonymous_client.post("/api/v1/auth/google", json={"idToken": "x" * 20})
    assert created.status_code == 200, created.text
    user = created.json()["user"]
    assert user["email"] == "google@example.com"
    assert user["hasPassword"] is False

    # Signing in again reuses the same account.
    again = env.anonymous_client.post("/api/v1/auth/google", json={"idToken": "y" * 20})
    assert again.json()["user"]["id"] == user["id"]

    # A verified Google email links to an existing password account.
    monkeypatch.setattr(
        "app.services.auth_service.verify_google_id_token",
        lambda token, audience: {
            "sub": "google-subject-2",
            "email": "other@example.com",
            "email_verified": True,
            "name": "Other",
        },
    )
    linked = env.anonymous_client.post("/api/v1/auth/google", json={"idToken": "z" * 20})
    assert linked.status_code == 200
    assert linked.json()["user"]["id"] == env.other_user_id

    monkeypatch.setattr(
        "app.services.auth_service.verify_google_id_token",
        lambda token, audience: {
            "sub": "google-subject-3",
            "email": "unverified@example.com",
            "email_verified": False,
        },
    )
    rejected = env.anonymous_client.post("/api/v1/auth/google", json={"idToken": "u" * 20})
    assert rejected.status_code == 403

    # An unverified password registration cannot be captured by a Google login
    # that merely claims the same address.
    assert register(env.anonymous_client, email="unverified@example.com").status_code == 201

    def unverified_claim(token, audience):
        return {
            "sub": "google-subject-3",
            "email": "unverified@example.com",
            "email_verified": True,
        }

    monkeypatch.setattr(
        "app.services.auth_service.verify_google_id_token", unverified_claim
    )
    capture = env.anonymous_client.post(
        "/api/v1/auth/google", json={"idToken": "c" * 20}
    )
    assert capture.status_code == 409

    monkeypatch.setattr(
        "app.services.auth_service.verify_google_id_token",
        lambda token, audience: (_ for _ in ()).throw(
            AuthError("Google sign-in could not be verified.")
        ),
    )
    bad = env.anonymous_client.post("/api/v1/auth/google", json={"idToken": "b" * 20})
    assert bad.status_code == 401


def test_delete_account_requires_password_and_cascades(env):
    session = login(env.anonymous_client).json()
    headers = bearer(session["accessToken"])

    denied = env.anonymous_client.request(
        "DELETE", "/api/v1/auth/account", headers=headers, json={"password": "wrong"}
    )
    assert denied.status_code == 403

    removed = env.anonymous_client.request(
        "DELETE",
        "/api/v1/auth/account",
        headers=headers,
        json={"password": "test-password-123"},
    )
    assert removed.status_code == 204
    assert login(env.anonymous_client).status_code == 401


def test_login_is_rate_limited(env):
    for _ in range(5):
        assert login(env.anonymous_client, password="wrong-password").status_code == 401
    blocked = login(env.anonymous_client, password="wrong-password")
    assert blocked.status_code == 429
    assert "retry-after" in blocked.headers


def test_registration_is_rate_limited(env):
    for index in range(5):
        assert register(env.anonymous_client, email=f"rate{index}@example.com").status_code == 201
    blocked = register(env.anonymous_client, email="rate-final@example.com")
    assert blocked.status_code == 429


def test_tenant_isolation_across_resources(env):
    # Account A creates a session with an interruption.
    session = start_session(env.client, title="Private to A")
    interruption = env.client.post(
        f"/api/v1/sessions/{session['id']}/interruptions", json={"reason": "PHONE"}
    ).json()["interruptions"][0]

    # Account B cannot see or touch any of it.
    assert env.other_client.get("/api/v1/sessions").json()["total"] == 0
    assert env.other_client.get(f"/api/v1/sessions/{session['id']}").status_code == 404
    assert (
        env.other_client.patch(
            f"/api/v1/sessions/{session['id']}", json={"title": "Stolen"}
        ).status_code
        == 404
    )
    assert env.other_client.post(f"/api/v1/sessions/{session['id']}/pause").status_code == 404
    assert (
        env.other_client.delete(f"/api/v1/sessions/{session['id']}").status_code == 404
    )
    assert (
        env.other_client.post(f"/api/v1/interruptions/{interruption['id']}/end").status_code
        == 404
    )

    # Categories are separate, and A's category is not deletable by B.
    a_categories = env.client.get("/api/v1/categories").json()
    b_categories = env.other_client.get("/api/v1/categories").json()
    assert len(a_categories) == len(b_categories) == 8
    assert {item["id"] for item in a_categories}.isdisjoint(
        {item["id"] for item in b_categories}
    )
    assert env.other_client.delete(f"/api/v1/categories/{a_categories[0]['id']}").status_code == 404

    # Analytics, export and deletion only ever cover the caller's data.
    assert env.other_client.get("/api/v1/analytics/overview").json()["totals"]["sessions"] == 0
    exported = env.other_client.get("/api/v1/export").json()
    assert exported["sessions"] == []
    assert exported["profile"]["id"] == env.other_user_id
    assert env.other_client.delete("/api/v1/data").json()["deletedSessions"] == 0

    # A's data is intact after all of B's attempts.
    assert env.client.get(f"/api/v1/sessions/{session['id']}").status_code == 200
    assert env.client.get("/api/v1/sessions").json()["total"] == 1


def test_import_is_scoped_to_the_caller(env):
    csv_body = (
        "title,category,started_at,ended_at,focused_minutes,status\n"
        "B only,Reading,2026-11-25T09:00:00Z,2026-11-25T09:30:00Z,25,COMPLETED\n"
    ).encode()
    response = env.other_client.post(
        "/api/v1/import/csv",
        files={"file": ("sessions.csv", csv_body, "text/csv")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["imported"] == 1
    assert env.other_client.get("/api/v1/sessions").json()["total"] == 1
    assert env.client.get("/api/v1/sessions").json()["total"] == 0


def test_production_requires_a_strong_secret():
    with pytest.raises(ValidationError):
        Settings(environment="production", jwt_secret="short")
    strong = Settings(environment="production", jwt_secret="x" * 48)
    assert strong.environment == "production"


# --------------------------------------------------------------------------- #
# Password reset and email verification
# --------------------------------------------------------------------------- #

def captured_emails(monkeypatch):
    sent: list[dict] = []

    def fake_send(*, to, subject, text, html=None):
        sent.append({"to": to, "subject": subject, "text": text})
        return True

    monkeypatch.setattr(email_service, "send_email", fake_send)
    return sent


def token_from_email(message: dict) -> str:
    match = re.search(r"[?&]token=([A-Za-z0-9_.\-]+)", message["text"])
    assert match, message["text"]
    return match.group(1)


def test_signup_sends_a_verification_link_that_marks_the_email(env, monkeypatch):
    sent = captured_emails(monkeypatch)
    response = register(env.anonymous_client, email="verify-me@example.com")
    assert response.status_code == 201, response.text
    assert len(sent) == 1
    assert sent[0]["to"] == "verify-me@example.com"

    token = token_from_email(sent[0])
    assert env.anonymous_client.post(
        "/api/v1/auth/verify-email", json={"token": token}
    ).status_code == 204
    me = env.client.get("/api/v1/auth/me").json()
    assert me["email"] == "test@example.com"  # the fixture account
    # The new account's token is valid regardless of which client presents it.
    new_login = login(env.anonymous_client, "verify-me@example.com", PASSWORD)
    assert new_login.status_code == 200
    headers = bearer(new_login.json()["accessToken"])
    assert env.anonymous_client.get("/api/v1/auth/me", headers=headers).json()[
        "emailVerified"
    ] is True

    # A verified address is not mailed again.
    before = len(sent)
    assert env.anonymous_client.post(
        "/api/v1/auth/resend-verification", json={"email": "verify-me@example.com"}
    ).status_code == 202
    assert len(sent) == before


def test_password_reset_is_single_use_and_rotates_sessions(env, monkeypatch):
    sent = captured_emails(monkeypatch)
    assert register(env.anonymous_client, email="reset-me@example.com").status_code == 201
    sent.clear()

    assert env.anonymous_client.post(
        "/api/v1/auth/forgot-password", json={"email": "reset-me@example.com"}
    ).status_code == 202
    assert len(sent) == 1
    reset_token = token_from_email(sent[0])

    reset = env.anonymous_client.post(
        "/api/v1/auth/reset-password",
        json={"token": reset_token, "newPassword": NEW_PASSWORD},
    )
    assert reset.status_code == 204, reset.text
    assert login(env.anonymous_client, "reset-me@example.com", PASSWORD).status_code == 401
    assert login(env.anonymous_client, "reset-me@example.com", NEW_PASSWORD).status_code == 200

    # The link was consumed: the token version moved on with the reset.
    reuse = env.anonymous_client.post(
        "/api/v1/auth/reset-password",
        json={"token": reset_token, "newPassword": "third-strong-password-4"},
    )
    assert reuse.status_code == 400


def test_unknown_addresses_get_the_same_neutral_answer(env, monkeypatch):
    sent = captured_emails(monkeypatch)
    assert env.anonymous_client.post(
        "/api/v1/auth/forgot-password", json={"email": "nobody@example.com"}
    ).status_code == 202
    assert sent == []
    assert env.anonymous_client.post(
        "/api/v1/auth/resend-verification", json={"email": "nobody@example.com"}
    ).status_code == 202
    assert sent == []


def test_registration_survives_an_email_outage(env, monkeypatch):
    def explode(**kwargs):
        raise AuthError("The email service is unreachable.", 502)

    monkeypatch.setattr(email_service, "send_email", explode)
    response = register(env.anonymous_client, email="outage@example.com")
    assert response.status_code == 201, response.text


def test_malformed_links_are_rejected(env):
    assert env.anonymous_client.post(
        "/api/v1/auth/verify-email", json={"token": "not-a-real-token-at-all"}
    ).status_code == 400
    assert env.anonymous_client.post(
        "/api/v1/auth/reset-password",
        json={"token": "not-a-real-token-at-all", "newPassword": NEW_PASSWORD},
    ).status_code == 400
