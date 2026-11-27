from __future__ import annotations

from tests.conftest import default_category, record_completed_session


def test_default_categories_are_seeded(client):
    categories = client.get("/api/v1/categories").json()
    names = [category["name"] for category in categories]
    assert names == [
        "Studying",
        "Programming",
        "Research",
        "Reading",
        "Writing",
        "Work",
        "Personal",
        "Other",
    ]
    assert all(category["isDefault"] for category in categories)


def test_category_crud_and_duplicate_rules(client):
    created = client.post(
        "/api/v1/categories", json={"name": "Music practice", "color": "#62DCEB"}
    )
    assert created.status_code == 201
    category = created.json()

    duplicate = client.post("/api/v1/categories", json={"name": "music PRACTICE"})
    assert duplicate.status_code == 409

    existing_name = client.post("/api/v1/categories", json={"name": "studying"})
    assert existing_name.status_code == 409

    updated = client.patch(
        f"/api/v1/categories/{category['id']}", json={"color": "#F3B65D"}
    )
    assert updated.status_code == 200
    assert updated.json()["color"] == "#F3B65D"

    invalid_color = client.patch(
        f"/api/v1/categories/{category['id']}", json={"color": "blue"}
    )
    assert invalid_color.status_code == 422

    deleted = client.delete(f"/api/v1/categories/{category['id']}")
    assert deleted.status_code == 204
    assert client.patch(
        f"/api/v1/categories/{category['id']}", json={"name": "Gone"}
    ).status_code == 404


def test_deleting_a_category_keeps_sessions(env):
    category = default_category(env.client)
    session = record_completed_session(env, minutes=20, category_id=category["id"])
    assert session["category"]["id"] == category["id"]

    assert env.client.delete(f"/api/v1/categories/{category['id']}").status_code == 204
    refreshed = env.client.get(f"/api/v1/sessions/{session['id']}").json()
    assert refreshed["category"] is None
    assert refreshed["focusedSeconds"] == 1200


def test_settings_defaults_and_validation(client):
    settings = client.get("/api/v1/settings").json()
    assert settings["theme"] == "dark"
    assert settings["defaultTargetDuration"] == 1500
    assert settings["autoIdleDetectionEnabled"] is False
    assert settings["notificationsEnabled"] is False

    updated = client.patch(
        "/api/v1/settings",
        json={
            "theme": "light",
            "accentColor": "#62DCEB",
            "defaultTargetDuration": 2700,
            "notificationsEnabled": True,
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["theme"] == "light"
    assert body["accentColor"] == "#62DCEB"
    assert body["defaultTargetDuration"] == 2700
    assert body["notificationsEnabled"] is True

    assert client.patch("/api/v1/settings", json={"theme": "neon"}).status_code == 422
    assert (
        client.patch("/api/v1/settings", json={"defaultTargetDuration": 5}).status_code
        == 422
    )


def test_profile_can_be_updated(client):
    profile = client.get("/api/v1/profile").json()
    assert profile["username"] == "Focus User"
    assert profile["totalSessions"] == 0

    updated = client.patch(
        "/api/v1/profile", json={"username": "Arghya", "email": "a@example.com"}
    )
    assert updated.status_code == 200
    assert updated.json()["username"] == "Arghya"
    # The email stays as registered.
    assert updated.json()["email"] == "test@example.com"

    assert client.patch("/api/v1/profile", json={"username": "  "}).status_code == 422
