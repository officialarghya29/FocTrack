# Security policy

FocTrack stores personal focus history, so security reports are taken seriously.

## Supported versions

| Version | Supported |
|---|---|
| 1.1.x | Yes |
| 1.0.x | No |

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Email
**officialarghya29@gmail.com** with:

* a short description and the affected endpoint or page;
* reproduction steps against https://foctrack.vercel.app (or local);
* whether any real user data was accessed.

You will get an acknowledgement as soon as possible. Please allow time for a fix
before public disclosure.

## What is implemented

* Scrypt password hashes with per-user salts; no password or hash is ever logged
  or returned by the API.
* Short-lived HS256 access tokens (30 minutes) and opaque refresh tokens stored
  only as SHA-256 digests. Refresh tokens rotate on use, and replaying a rotated
  token revokes the whole session family.
* `token_version` invalidation for password changes and "sign out everywhere".
* Optional Google sign-in verified against Google's published keys, including
  audience, issuer, expiry and `email_verified`.
* Login, registration, Google and refresh rate limits; generic login errors and
  a dummy hash for unknown accounts.
* Per-account tenant isolation, proven by automated tests across every endpoint.
* Explicit CORS allowlist, CSP and standard security headers, request size
  limits, capped text fields, a 2 MB CSV import limit and a 5000-row cap.
* Secrets are environment-only; `.env` files are gitignored.

## Known gaps

* Password reset and email verification are implemented but require
  `FOCTRACK_RESEND_API_KEY`; without it production answers `503` and no mail is
  sent.
* The rate limiter is process-local and assumes one API instance.
* Dependency scanning runs in CI with `pip-audit` and `npm audit --omit=dev`;
  Dependabot is configured not to open update pull requests, so updates are
  applied manually. Neither is a substitute for a full external audit.
* Error monitoring (Sentry) is not configured for this deployment.
