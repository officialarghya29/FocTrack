# FocTrack — Phase 7 self-audit

Date: 2026-11-27. Branch: `release/1.1.0-accounts` (auth UI) with the backend
already on `main`.

Every result below is either a command, a CI run, or an explicit NOT DONE. No
item is marked green because it is expected to work.

## 1. Repository state

| Check | Result | Evidence |
|---|---|---|
| Working tree clean | PASS on `main` and the release branch | `git status --short` prints nothing |
| `main` pushed | PASS | `6525efe..3a771d0 main -> main` |
| Every commit authored by the owner | PASS | `git log --format='%an <%ae>' \| sort -u` → `Arghya Bose <officialarghya29@gmail.com>` only |
| No AI attribution | PASS | `git log --format=%B \| grep -iE 'co-authored\|generated with\|claude\|deepseek\|openai\|copilot\|codebuff'` → no matches |

## 2. Tests

| Check | Result | Evidence |
|---|---|---|
| Backend suite | PASS — 76 tests | `python -m pytest` → `76 passed, 1 warning in 32.21s` |
| Frontend suite | PASS — 26 tests / 7 files | `npx vitest run` |
| Typecheck | PASS | `npx tsc -b --noEmit` |
| Production build | PASS | `npm run build` |
| PostgreSQL suite | PASS | CI run [45970698359](https://github.com/officialarghya29/FocTrack/actions/runs/45970698359), job `Backend (PostgreSQL)` |
| Counts above the 62 + 20 baseline | PASS | 76 ≥ 62, 26 ≥ 20 |
| Migration applies on SQLite | PASS | `alembic upgrade head` on a scratch file; `0001_initial → 0002_auth` |
| Migration applies on PostgreSQL | PASS | PostgreSQL CI job ran the full suite after migrations |

Known warning: Starlette 1.x deprecates `httpx` inside `TestClient`. It is a
deprecation, not a failure.

## 3. Tenant isolation

PASS in automated tests (`backend/tests/test_auth_api.py`):

* `test_tenant_isolation_across_resources` — user B gets `404` for A's session
  read, patch, pause and delete, and for A's interruption; B cannot delete A's
  category; B's analytics total, export and delete-all only cover B; A's data is
  intact afterwards.
* `test_import_is_scoped_to_the_caller` — B's CSV import leaves A's history empty.
* `test_duplicate_email_is_rejected_neutrally`, `test_login_and_unknown_email_share_one_message`.
* `test_delete_account_requires_password_and_cascades`.

LIVE two-account test: **NOT DONE** — the auth API is implemented but deliberately
not deployed until `FOCTRACK_JWT_SECRET` is set in Render (see §12).

## 4. Authentication abuse resistance

PASS in automated tests:

* `test_login_is_rate_limited` — sixth rapid failure returns `429` with
  `Retry-After`.
* `test_registration_is_rate_limited`.
* `test_missing_and_forged_tokens_are_rejected` — missing, malformed, expired
  and stale-`token_version` tokens return `401` with `WWW-Authenticate: Bearer`.
* `test_refresh_rotates_and_detects_replay` — a replayed rotated token revokes
  the whole family.
* `test_logout_and_logout_all`, `test_change_password_requires_current_and_revokes_sessions`.
* `test_production_requires_a_strong_secret` — `Settings(environment="production",
  jwt_secret="short")` raises.

LIVE verification: **PASS** — the release is deployed and a two-account browser
journey against `https://foctrack.vercel.app` passed 15/15 checks on
2026-11-27 (signup, session start, refresh persistence, sign-out, isolation,
wrong password, re-login, read-only email, no console errors).

## 5. Google sign-in

PARTIAL.

* Verifier and account-linking behaviour are unit-tested with injected claims:
  create, repeat sign-in, link to a verified email, reject unverified email,
  reject a failed verifier.
* A real Google ID token has **not** been verified end to end, because no
  `FOCTRACK_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` exists yet and the owner
  must create the OAuth client in Google Cloud Console.

## 6. Headers and CSP

**PASS.** The policy in `vercel.json` is live: `https://foctrack.vercel.app`
returns CSP with `frame-ancestors 'none'`, HSTS, nosniff, referrer and
permissions policies, and the production browser journey produced no console
errors.

## 7. CI and Dependabot

| Check | Result | Evidence |
|---|---|---|
| CI green on `main` | PASS | run 45970944820, all three jobs success |
| CI covers SQLite, PostgreSQL and frontend | PASS | `.github/workflows/ci.yml` |
| Dependabot does not open update pull requests | PASS | `open-pull-requests-limit: 0`; the queued automated PRs were closed |
| A failing PR is blocked | **NOT DONE** | branch protection is not enabled; CI reports failure but does not block a merge |
| Major-version updates are not noisy | **PASS** | automated bumps are disabled and applied manually in reviewed releases |

## 8. Cold start

**NOT DONE.** No 15+ minute idle → load → recovery measurement was recorded.
The GitHub keep-warm schedule is still best-effort; no external pinger is
configured. The client timeout/retry/wake hint remains tested by unit tests.

## 9. Backup restore drill

**NOT DONE.** Neon retains six hours of branch history, but no `pg_dump` has
been restored into a scratch database and compared.

## 10. Lighthouse and axe

**NOT DONE** for the authenticated app. The previous 1.0 UI was smoke-tested at
390×844 for overflow, but no Lighthouse or axe report exists for the new auth
pages or the current build.

## 11. Secrets scan

**NOT DONE** with `gitleaks` (not installed on this machine). Mitigations that
are verified:

* `.env` is gitignored; only `.env.example` with placeholders is tracked.
* `git log` contains no Neon DSN, Render token or API key; the DSN has only ever
  been entered in the Render dashboard.
* `pip-audit -r requirements.txt` → `No known vulnerabilities found`.
* `npm audit --omit=dev` → `found 0 vulnerabilities`.

## 11a. Post-audit additions

| Check | Result | Evidence |
|---|---|---|
| Backend suite after timezone and email work | PASS — 83 tests | `pytest` → `83 passed`; `ruff check` clean |
| Historical days survive a clock change | PASS | `test_stored_offset_keeps_the_historical_day_after_a_clock_change` |
| Password reset is single-use and revokes sessions | PASS | `test_password_reset_is_single_use_and_rotates_sessions` |
| Verification links confirm the address | PASS | `test_signup_sends_a_verification_link_that_marks_the_email` |
| Email endpoints fail closed without a key | PASS | live `POST /auth/forgot-password` → `503`, no fake success |
| PWA manifest and service worker | PASS | manifest `200`, `display: standalone`, SW active and controlling |
| No authenticated API response cached | PASS | cache inspection: 30 precached entries, `apiEntries: 0` |
| Offline app shell | PASS | network disabled, reload rendered the login form |
| CSV export scoped to the caller | PASS | `test_export_csv_matches_the_visible_sessions` |

## 12. Deployment blockers found

1. **No Render Git webhook.** Pushes do not deploy the API; deployment is an
   explicit `render deploys create <id> --commit <sha> --confirm`.
2. **Google sign-in is unconfigured** (no OAuth client id).
3. **No transactional email key**, so password reset and verification are
   implemented but inactive: production returns `503` until
   `FOCTRACK_RESEND_API_KEY` is set on Render.

## 13. Fixes made during this audit

* Upgraded FastAPI, PyJWT, python-multipart and pytest; `pip-audit` went from
  50 advisories in 4 packages to zero.
* Added CI (lint, SQLite, PostgreSQL, frontend) and Dependabot.
* Added `SECURITY.md`, this report, and corrected README claims that the
  PostgreSQL run was verified rather than assumed.
* Reverted an accidental commit that would have shipped the auth UI before the
  API, keeping the live 1.0 app working.
