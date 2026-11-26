from __future__ import annotations

from tests.conftest import default_category, record_completed_session, start_session


def test_create_session_returns_live_session(client):
    category = default_category(client)
    session = start_session(client, title="Read a paper", categoryId=category["id"])
    assert session["status"] == "ACTIVE"
    assert session["title"] == "Read a paper"
    assert session["category"]["name"] == category["name"]
    assert session["focusedSeconds"] == 0
    assert session["interruptions"] == []


def test_second_open_session_is_rejected(client):
    start_session(client)
    response = client.post("/api/v1/sessions", json={"title": "Another"})
    assert response.status_code == 409
    assert "already running" in response.json()["detail"]


def test_active_session_endpoint_recovers_state(client, clock):
    session = start_session(client)
    clock.advance(90)
    recovered = client.get("/api/v1/sessions/active").json()
    assert recovered["id"] == session["id"]
    assert recovered["focusedSeconds"] == 90
    assert recovered["status"] == "ACTIVE"


def test_active_session_endpoint_returns_null_when_idle(client):
    response = client.get("/api/v1/sessions/active")
    assert response.status_code == 200
    assert response.json() is None


def test_pause_and_resume_math(client, clock):
    session = start_session(client)
    clock.advance(120)

    paused = client.post(f"/api/v1/sessions/{session['id']}/pause").json()
    assert paused["session"]["status"] == "PAUSED"
    assert paused["session"]["focusedSeconds"] == 120

    # Time spent paused must never be counted as focus.
    clock.advance(300)
    still_paused = client.get(f"/api/v1/sessions/{session['id']}").json()
    assert still_paused["focusedSeconds"] == 120
    assert still_paused["pausedSeconds"] == 300

    resumed = client.post(f"/api/v1/sessions/{session['id']}/resume").json()
    assert resumed["session"]["status"] == "ACTIVE"

    clock.advance(60)
    completed = client.post(f"/api/v1/sessions/{session['id']}/complete").json()
    assert completed["session"]["focusedSeconds"] == 180
    assert completed["session"]["pausedSeconds"] == 300
    assert completed["session"]["status"] == "COMPLETED"


def test_interruption_duration_is_subtracted_from_focus(client, clock):
    session = start_session(client)
    clock.advance(200)

    created = client.post(
        f"/api/v1/sessions/{session['id']}/interruptions",
        json={"reason": "phone", "notes": "Call from home"},
    )
    assert created.status_code == 201
    interruption = created.json()["interruptions"][0]
    assert interruption["label"] == "Phone"
    assert interruption["isOpen"] is True

    clock.advance(40)
    live = client.get(f"/api/v1/sessions/{session['id']}").json()
    assert live["interruptedSeconds"] == 40
    assert live["focusedSeconds"] == 200

    ended = client.post(f"/api/v1/interruptions/{interruption['id']}/end")
    assert ended.status_code == 200
    assert ended.json()["interruptions"][0]["durationSeconds"] == 40

    completed = client.post(f"/api/v1/sessions/{session['id']}/complete").json()
    assert completed["session"]["focusedSeconds"] == 200
    assert completed["session"]["interruptedSeconds"] == 40
    assert completed["session"]["elapsedSeconds"] == 240


def test_interruption_requires_active_session(client, clock):
    session = start_session(client)
    client.post(f"/api/v1/sessions/{session['id']}/pause")
    response = client.post(
        f"/api/v1/sessions/{session['id']}/interruptions", json={"reason": "phone"}
    )
    assert response.status_code == 409
    assert "running" in response.json()["detail"]


def test_other_reason_requires_custom_label(client):
    session = start_session(client)
    missing = client.post(
        f"/api/v1/sessions/{session['id']}/interruptions", json={"reason": "other"}
    )
    assert missing.status_code == 400

    ok = client.post(
        f"/api/v1/sessions/{session['id']}/interruptions",
        json={"reason": "other", "customReason": "Someone knocked"},
    )
    assert ok.status_code == 201
    assert ok.json()["interruptions"][0]["label"] == "Someone knocked"


def test_only_one_interruption_stays_open(client, clock):
    session = start_session(client)
    clock.advance(30)
    client.post(f"/api/v1/sessions/{session['id']}/interruptions", json={"reason": "phone"})
    clock.advance(30)
    payload = client.post(
        f"/api/v1/sessions/{session['id']}/interruptions", json={"reason": "browsing"}
    ).json()
    open_items = [item for item in payload["interruptions"] if item["isOpen"]]
    assert len(payload["interruptions"]) == 2
    assert len(open_items) == 1
    # The first interruption was auto-closed at the 30s mark.
    assert payload["interruptedSeconds"] == 30


def test_pausing_closes_open_interruption(client, clock):
    session = start_session(client)
    clock.advance(30)
    client.post(f"/api/v1/sessions/{session['id']}/interruptions", json={"reason": "phone"})
    clock.advance(20)
    paused = client.post(f"/api/v1/sessions/{session['id']}/pause").json()["session"]
    assert all(not item["isOpen"] for item in paused["interruptions"])
    clock.advance(100)
    assert paused["interruptedSeconds"] == 20
    current = client.get(f"/api/v1/sessions/{session['id']}").json()
    assert current["interruptedSeconds"] == 20


def test_invalid_transitions_return_conflict(client, clock):
    session = start_session(client)
    session_id = session["id"]

    assert client.post(f"/api/v1/sessions/{session_id}/resume").status_code == 409
    clock.advance(60)
    client.post(f"/api/v1/sessions/{session_id}/pause")
    assert client.post(f"/api/v1/sessions/{session_id}/pause").status_code == 409
    clock.advance(30)
    assert client.post(f"/api/v1/sessions/{session_id}/complete").status_code == 200
    assert client.post(f"/api/v1/sessions/{session_id}/complete").status_code == 409
    assert client.post(f"/api/v1/sessions/{session_id}/cancel").status_code == 409
    assert client.post(f"/api/v1/sessions/{session_id}/pause").status_code == 409


def test_empty_session_cannot_be_completed(client):
    session = start_session(client)
    response = client.post(f"/api/v1/sessions/{session['id']}/complete")
    assert response.status_code == 409
    assert "no recorded activity" in response.json()["detail"]

    cancelled = client.post(f"/api/v1/sessions/{session['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["session"]["status"] == "CANCELLED"


def test_cancelled_session_is_not_counted_as_completed(client, clock):
    session = start_session(client)
    clock.advance(400)
    cancelled = client.post(f"/api/v1/sessions/{session['id']}/cancel").json()
    assert cancelled["session"]["focusedSeconds"] == 400

    overview = client.get("/api/v1/analytics/overview").json()
    assert overview["todaySessions"] == 0
    assert overview["todayFocusedSeconds"] == 0


def test_unknown_session_returns_404(client):
    assert client.get("/api/v1/sessions/999").status_code == 404
    assert client.post("/api/v1/sessions/999/pause").status_code == 404
    assert client.delete("/api/v1/sessions/999").status_code == 404


def test_lifecycle_can_span_multiple_pause_cycles(client, clock):
    session = start_session(client)
    for _ in range(3):
        clock.advance(100)
        client.post(f"/api/v1/sessions/{session['id']}/pause")
        clock.advance(50)
        client.post(f"/api/v1/sessions/{session['id']}/resume")
    clock.advance(100)
    completed = client.post(f"/api/v1/sessions/{session['id']}/complete").json()["session"]
    assert completed["focusedSeconds"] == 400
    assert completed["pausedSeconds"] == 150


def test_history_filters_search_and_pagination(env):
    category = default_category(env.client)
    record_completed_session(env, title="Algorithms", minutes=25, category_id=category["id"])
    record_completed_session(env, title="Thesis reading", minutes=50, category_id=category["id"])
    record_completed_session(env, title="Old sprint", minutes=10, day_offset=3)

    all_sessions = env.client.get("/api/v1/sessions?limit=2").json()
    assert all_sessions["total"] == 3
    assert len(all_sessions["items"]) == 2

    searched = env.client.get("/api/v1/sessions?search=algo").json()
    assert searched["total"] == 1
    assert searched["items"][0]["title"] == "Algorithms"

    by_category = env.client.get(f"/api/v1/sessions?categoryId={category['id']}").json()
    assert by_category["total"] == 2

    longest = env.client.get("/api/v1/sessions?sort=duration").json()
    assert longest["items"][0]["title"] == "Thesis reading"

    completed = env.client.get("/api/v1/sessions?status=COMPLETED").json()
    assert completed["total"] == 3
    assert env.client.get("/api/v1/sessions?status=NOPE").status_code == 400


def test_session_can_be_edited(client):
    session = start_session(client, title="Draft")
    category = default_category(client)
    response = client.patch(
        f"/api/v1/sessions/{session['id']}",
        json={"title": "Final title", "categoryId": category["id"]},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Final title"
    assert response.json()["category"]["id"] == category["id"]


def test_delete_session_removes_it_from_history(env):
    session = record_completed_session(env, minutes=20)
    response = env.client.delete(f"/api/v1/sessions/{session['id']}")
    assert response.status_code == 204
    assert env.client.get(f"/api/v1/sessions/{session['id']}").status_code == 404
    assert env.client.get("/api/v1/sessions").json()["total"] == 0
