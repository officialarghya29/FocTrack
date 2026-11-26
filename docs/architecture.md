# FocTrack — Architecture

FocTrack is a two-tier application. A React single-page app renders the
interface; a FastAPI service owns sessions, the time model and every
analytics number. The database is the source of truth.

```
Browser (React + Vite)
   │  JSON over HTTP, camelCase
   ▼
FastAPI routers  →  services  →  repositories/SQLAlchemy  →  SQLite
                       │
                       └── analytics aggregation + focus score
```

## Design principles

1. **Time is measured, never counted.** No component increments a counter.
   Durations are differences between UTC timestamps, so throttled tabs,
   refreshed pages, sleeping laptops and restarted servers cannot drift the
   numbers.
2. **The backend is the only authority.** The frontend extrapolates between
   fetches for display only, using the timestamp of the last response. Every
   mutation returns the recalculated session.
3. **Store raw facts, derive everything else.** Pauses and interruptions are
   stored as their own intervals; focused time is computed, and frozen only
   when a session closes.
4. **Honest empty states.** No seeded statistics unless the user explicitly
   loads demo mode, in which case every demo row is flagged and labelled.
5. **Failure is explicit.** Invalid transitions return 409 with a readable
   message instead of mutating state.

## Layers

| Layer | Location | Responsibility |
|---|---|---|
| API | `backend/app/api/v1` | Routing, query validation, status codes, OpenAPI docs |
| Schemas | `backend/app/schemas` | Pydantic models, camelCase aliasing, input constraints |
| Services | `backend/app/services` | Session lifecycle, categories, settings, demo data, export |
| Time engine | `backend/app/services/session_clock.py` | Pure timestamp arithmetic and serialization |
| Analytics | `backend/app/services/analytics_service.py`, `backend/app/analytics/focus_score.py` | Aggregation, focus score, insights |
| Models | `backend/app/models/entities.py` | SQLAlchemy 2.0 mappings, constraints, indexes |
| Persistence | `backend/app/database` | Engine, session factory, UTC type decorator, Alembic bootstrap |
| UI shell | `frontend/src/components/layout` | Sidebar, mobile navigation, toasts |
| Pages | `frontend/src/pages` | Overview, Focus, History, Analytics, Settings |
| Server state | `frontend/src/hooks`, `frontend/src/services/api.ts` | TanStack Query hooks and typed HTTP client |

## Session state machine

```
(none) --start--> ACTIVE --pause--> PAUSED --resume--> ACTIVE
                    │                   │
                    ├──complete─────────┴──> COMPLETED
                    └──cancel───────────────> CANCELLED
```

* `ACTIVE` and `PAUSED` are the only open states. A partial unique index
  (`uq_open_session_per_user`) plus a service check makes a second open session
  impossible.
* `COMPLETED` and `CANCELLED` are terminal. Attempting to pause, resume or
  complete them returns `409 Conflict`.
* Every transition runs inside a single transaction and writes derived totals
  before committing.

## The time model in the database

`focus_sessions` stores the bookkeeping needed to reconstruct any duration:

| Column | Purpose |
|---|---|
| `started_at` | UTC instant the session began |
| `ended_at` | UTC instant the session closed |
| `status` | ACTIVE, PAUSED, COMPLETED, CANCELLED |
| `accumulated_active_seconds` | Running time already banked across pauses |
| `paused_seconds` | Total paused time |
| `last_resumed_at` | Anchor for the current running interval |
| `paused_at` | Anchor for the current paused interval |
| `focused_duration` / `interrupted_duration` | Frozen totals written on close |
| `target_duration` | Optional target for the progress ring |

Interruptions are rows with `started_at`, `ended_at` and `duration`. An open
interruption is closed automatically when the session pauses, completes or
cancels, or when another interruption starts, so the interrupted total can
never double count.

See [calculations.md](calculations.md) for the exact formulas.

## Analytics

Analytics are computed from completed sessions inside a local-time window.
The client sends `tzOffsetMinutes` (JavaScript `getTimezoneOffset()`), which
lets the API bucket by the user's calendar day exactly.

Aggregation is done in Python over the rows in the requested window. This
keeps one implementation for SQLite and PostgreSQL, and avoids dialect-specific
date functions. For a personal tracker (thousands of rows at most) the cost is
small; measured response times are documented in the README.

## Concurrency and integrity

* Foreign keys are enabled per SQLite connection (`PRAGMA foreign_keys=ON`).
* Deleting a category sets its sessions' `category_id` to `NULL` instead of
  deleting history.
* Deleting a session cascades to its interruptions.
* Duplicate category names are blocked by a unique `(user_id, name)` constraint
  and a case-insensitive service check.
* Timestamps are stored through a `UTCDateTime` decorator: naive UTC in SQLite,
  timezone-aware UTC in Python. This avoids SQLite dropping tzinfo.

## Error handling

| Situation | Response |
|---|---|
| Unknown session/category/interruption id | `404` with a human sentence |
| Pause a paused session, resume a completed one, second open session | `409` |
| Completing a session with under a second of activity | `409`, suggesting cancel |
| Unknown interruption reason or missing custom label | `400` |
| Validation failure (colour, target bounds, theme) | `422` with a flattened message |
| Database unavailable | `503` |
| Unexpected server error | `500` (FastAPI default, no state committed) |

The frontend maps these responses to toasts and inline errors. It never
silently retries a mutation that could duplicate a session.

## Security and privacy

* Local-profile mode: one profile per database, no passwords, no pretend
  multi-user authentication. Every query is still scoped by `user_id`.
* No keystroke logging, screenshots or browsing collection. The optional
  inactivity prompt listens for activity events only to keep an in-memory
  timestamp, and never logs an interruption on its own.
* Secrets come from environment variables; `.env` files are gitignored.
* CORS is an explicit allowlist.
* SQL is generated by SQLAlchemy with bound parameters.
* Export and deletion are first-class endpoints.

## Deployment topology

* **Frontend:** static build on Vercel (`frontend/vercel.json` adds the SPA
  rewrite). Set `VITE_API_BASE_URL` to the deployed API origin.
* **Backend:** Render blueprint in `render.yaml`, SQLite on a mounted disk at
  `/var/data`. Startup applies Alembic migrations to `head`.
* **Database:** SQLite for the MVP. All models use portable types and the only
  dialect-specific statement is the partial unique index, which PostgreSQL also
  supports. The app has not been exercised against a live PostgreSQL instance.
