# FocTrack — Architecture

FocTrack is a two-tier application. A React single-page app renders the
interface; a FastAPI service owns sessions, the time model and every
analytics number. The database is the source of truth.

```
Browser (React + Vite)
   │  JSON over HTTP, camelCase
   ▼
FastAPI routers  →  services  →  repositories/SQLAlchemy  →  SQLite / PostgreSQL
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

* Real accounts: scrypt password hashes, optional Google sign-in, short-lived
  HS256 access tokens and opaque refresh tokens stored only as SHA-256 digests.
  Rotating a reused refresh token revokes the whole session family, and a
  `token_version` bump invalidates every outstanding access token.
* Every query is scoped by `user_id`. Tenant isolation is covered by dedicated
  tests across sessions, interruptions, categories, analytics, export and import.
* Auth endpoints are rate limited per client address (and per email for login).
  The limiter is in-process, which matches the single-instance deployment.
* Email is read-only after registration; Google is linked only by an already
  verified email, preventing an address from being captured before its owner
  signs in.
* No keystroke logging, screenshots or browsing collection. The optional
  inactivity prompt listens for activity events only to keep an in-memory
  timestamp, and never logs an interruption on its own.
* Secrets come from environment variables; `.env` files are gitignored.
* CORS is an explicit allowlist.
* SQL is generated by SQLAlchemy with bound parameters.
* Export and deletion are first-class endpoints.

## Deployment topology

The shipped deployment runs entirely on free tiers:

* **Frontend:** static build on Vercel (the root `vercel.json` builds
  `frontend/` and adds the SPA rewrite plus security headers).
  `VITE_API_BASE_URL` is inlined at build time.
* **Backend:** Render free web service, configured by `render.yaml` and
  provisioned through the Render CLI. Startup applies Alembic migrations to
  `head`.
* **Database:** Neon free PostgreSQL. Models use portable types and the only
  dialect-specific statement is the partial unique index, which both engines
  support. The suite runs against PostgreSQL with
  `FOCTRACK_TEST_DATABASE_URL` set.

Free web services cannot mount a persistent disk, so the hosted database is
PostgreSQL rather than the SQLite file used locally. The engine normalises
`postgres://` and `postgresql://` DSNs to the psycopg 3 driver and pre-pings
pooled connections, because the hosted database suspends when idle.
