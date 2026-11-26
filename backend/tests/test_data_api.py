from __future__ import annotations

import json

from tests.conftest import record_completed_session


def test_export_returns_real_records(env):
    record_completed_session(env, minutes=25, title="Exported session")
    response = env.client.get("/api/v1/export")
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]

    payload = json.loads(response.content)
    assert payload["format"] == "foctrack.export.v1"
    assert payload["profile"]["username"] == "Focus User"
    assert len(payload["sessions"]) == 1
    assert payload["sessions"][0]["title"] == "Exported session"
    assert len(payload["categories"]) == 8


def test_demo_data_is_labelled_and_removable(env):
    seeded = env.client.post("/api/v1/demo/seed").json()
    assert seeded["created"] > 10

    sessions = env.client.get("/api/v1/sessions?limit=100").json()
    assert sessions["total"] == seeded["created"]
    assert all(item["isDemo"] for item in sessions["items"])

    overview = env.client.get("/api/v1/analytics/overview").json()
    assert overview["totals"]["demoSessions"] == seeded["created"]
    assert overview["weekFocusedSeconds"] > 0

    again = env.client.post("/api/v1/demo/seed").json()
    assert again["created"] == 0

    removed = env.client.delete("/api/v1/demo").json()
    assert removed["removed"] == seeded["created"]
    assert env.client.get("/api/v1/sessions").json()["total"] == 0


def test_delete_all_data_keeps_categories(env):
    record_completed_session(env, minutes=20)
    record_completed_session(env, minutes=20)
    payload = env.client.delete("/api/v1/data").json()
    assert payload["deletedSessions"] == 2
    assert env.client.get("/api/v1/sessions").json()["total"] == 0
    assert len(env.client.get("/api/v1/categories").json()) == 8


def test_health_endpoint(client):
    payload = client.get("/api/v1/health").json()
    assert payload["status"] == "ok"
    assert payload["database"] == "ok"
    assert payload["version"] == "1.0.0"


def test_openapi_schema_is_served(client):
    schema = client.get("/openapi.json").json()
    assert "/api/v1/sessions" in schema["paths"]
    assert "/api/v1/analytics/focus-score" in schema["paths"]
