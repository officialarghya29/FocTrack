# Changelog

## 1.1.0 — 2026-11-27

### Added

* Installable PWA: manifest, 192/512/maskable icons, offline app shell and a
  service worker that never caches authenticated API responses.
* CSV session export (`GET /export/csv`) with the same column names the importer
  accepts, alongside the existing JSON export.

* Real accounts: email + password registration and login, optional Google
  sign-in, scrypt hashing, short-lived access tokens and rotating refresh tokens.
* Full per-account isolation, proved by automated tests across sessions,
  interruptions, categories, analytics, export and CSV import.
* Rate limiting on authentication endpoints and a production boot check for the
  JWT signing secret.
* Account settings: change password, sign out everywhere, delete account.
* `/api/v1/health/ready` for a database-aware readiness probe; `/health` is now
  a cheap liveness check.
* CI workflow: lint, SQLite tests, PostgreSQL tests, frontend typecheck, tests
  and production build.
* CSP and security headers on the Vercel deployment; request ids and structured
  request logging on the API.
* `SECURITY.md`.

### Changed

* Email is read-only after registration; Google links only to an account whose
  email was already verified.
* Exports and CSV downloads now use authenticated requests instead of plain
  links, because those endpoints require a bearer token.
* The keep-warm job probes `/health/ready` and is documented as best effort.

### Fixed

* Sessions store the browser's timezone offset at creation, so analytics keep a
  historical day on the date it actually happened after a daylight-saving
  change. Older rows fall back to the request offset.
* Two access tokens issued in the same second are now distinct (`jti`).
* Unknown-email logins take the same password-hashing path as wrong-password
  logins.
