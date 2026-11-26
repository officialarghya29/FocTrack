from __future__ import annotations

from tests.conftest import default_category

HEADER = "title,category,started_at,ended_at,focused_minutes,interrupted_minutes,status,notes"


def upload(client, content: str, filename: str = "sessions.csv"):
    return client.post(
        "/api/v1/import/csv",
        files={"file": (filename, content.encode("utf-8"), "text/csv")},
    )


def test_import_creates_sessions_and_categories(env):
    category = default_category(env.client)
    csv_text = "\n".join(
        [
            HEADER,
            f"Algorithms revision,{category['name']},2026-11-20T09:00:00Z,2026-11-20T09:50:00Z,45,5,COMPLETED,Two phone checks",
            "Piano practice,Music,2026-11-21T18:00:00Z,2026-11-21T18:30:00Z,,,COMPLETED,",
        ]
    )

    response = upload(env.client, csv_text)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["imported"] == 2
    assert payload["skipped"] == 0
    assert payload["categoriesCreated"] == 1
    assert payload["errors"] == []

    sessions = env.client.get("/api/v1/sessions?limit=10").json()
    assert sessions["total"] == 2
    by_title = {item["title"]: item for item in sessions["items"]}
    first = by_title["Algorithms revision"]
    assert first["status"] == "COMPLETED"
    assert first["focusedSeconds"] == 45 * 60
    assert first["interruptedSeconds"] == 5 * 60
    assert first["category"]["name"] == category["name"]
    assert first["notes"] == "Two phone checks"

    second = by_title["Piano practice"]
    # No durations given: the whole wall time becomes focused time.
    assert second["focusedSeconds"] == 30 * 60
    assert second["category"]["name"] == "Music"

    categories = env.client.get("/api/v1/categories").json()
    assert any(item["name"] == "Music" for item in categories)

    # Imported rows must never create an open session.
    assert env.client.get("/api/v1/sessions/active").json() is None


def test_import_reports_bad_rows_and_keeps_good_ones(env):
    csv_text = "\n".join(
        [
            HEADER,
            ",Research,2026-11-20T09:00:00Z,2026-11-20T09:30:00Z,25,0,COMPLETED,missing title",
            "Bad date,Research,not-a-date,2026-11-20T09:30:00Z,25,0,COMPLETED,",
            "Negative,Research,2026-11-20T09:00:00Z,2026-11-20T09:30:00Z,-5,0,COMPLETED,",
            "Wrong status,Research,2026-11-20T09:00:00Z,2026-11-20T09:30:00Z,25,0,ACTIVE,",
            "Backwards,Research,2026-11-20T10:00:00Z,2026-11-20T09:00:00Z,25,0,COMPLETED,",
            "Too distracted,Research,2026-11-20T09:00:00Z,2026-11-20T09:30:00Z,10,40,COMPLETED,",
            "Good session,Research,2026-11-20T09:00:00Z,2026-11-20T09:30:00Z,28,2,COMPLETED,",
            "Good session,Research,2026-11-20T09:00:00Z,2026-11-20T09:30:00Z,28,2,COMPLETED,duplicate",
        ]
    )

    response = upload(env.client, csv_text)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["imported"] == 1
    assert payload["skipped"] == 7
    assert payload["duplicateTitles"] == 1
    assert len(payload["errors"]) == 7
    messages = " ".join(item["message"] for item in payload["errors"])
    assert "title is required" in messages
    assert "could not parse timestamp" in messages
    assert "cannot be negative" in messages
    assert "COMPLETED or CANCELLED" in messages
    assert "before started_at" in messages
    assert "exceeds the session length" in messages
    assert "Duplicate" in messages

    assert env.client.get("/api/v1/sessions").json()["total"] == 1


def test_import_handles_quoted_commas_and_alt_headers(env):
    csv_text = "\n".join(
        [
            "Task,Category,Start,End,Focus Minutes,Interrupted Minutes,Notes",
            '"Review PR #42, with tests",Programming,2026-11-22 10:00,2026-11-22 10:40,35,5,"Reviewed, approved"',
        ]
    )
    response = upload(env.client, csv_text)
    assert response.status_code == 200, response.text
    assert response.json()["imported"] == 1

    session = env.client.get("/api/v1/sessions").json()["items"][0]
    assert session["title"] == "Review PR #42, with tests"
    assert session["focusedSeconds"] == 2100
    assert session["notes"] == "Reviewed, approved"


def test_import_rejects_invalid_files(env):
    missing_column = upload(env.client, "title,category\nSomething,Research\n")
    assert missing_column.status_code == 400
    assert "started_at" in missing_column.json()["detail"]

    empty = upload(env.client, "")
    assert empty.status_code == 400

    header_only = upload(env.client, HEADER)
    assert header_only.status_code == 400
    assert "no data rows" in header_only.json()["detail"]

    wrong_type = upload(env.client, HEADER + "\n", filename="sessions.txt")
    assert wrong_type.status_code == 400

    duplicate_headers = upload(
        env.client, "title,title,started_at\nA,B,2026-11-20T09:00:00Z\n"
    )
    assert duplicate_headers.status_code == 400


def test_import_allows_cancelled_sessions(env):
    csv_text = "\n".join(
        [
            HEADER,
            "Abandoned,Cancelled test,2026-11-20T09:00:00Z,2026-11-20T09:20:00Z,10,0,CANCELLED,",
        ]
    )
    response = upload(env.client, csv_text)
    assert response.status_code == 200
    assert response.json()["imported"] == 1

    overview = env.client.get("/api/v1/analytics/overview").json()
    assert overview["totals"]["focusedSeconds"] == 0
    session = env.client.get("/api/v1/sessions").json()["items"][0]
    assert session["status"] == "CANCELLED"


def test_import_works_while_a_session_is_running(env):
    open_session = env.client.post(
        "/api/v1/sessions", json={"title": "Live work"}
    ).json()
    csv_text = "\n".join(
        [HEADER, "Old work,Work,2026-11-20T09:00:00Z,2026-11-20T09:30:00Z,30,0,COMPLETED,"]
    )
    response = upload(env.client, csv_text)
    assert response.status_code == 200
    assert response.json()["imported"] == 1
    active = env.client.get("/api/v1/sessions/active").json()
    assert active["id"] == open_session["id"]


def test_csv_template_is_downloadable(client):
    response = client.get("/api/v1/import/csv/template")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    lines = response.text.splitlines()
    assert lines[0].startswith("title,category,started_at")
    assert len(lines) == 3
