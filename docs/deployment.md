# FocTrack — Deployment runbook

**Current status: deployed on free tiers.**

| Component | Platform | URL |
|---|---|---|
| Web app | Vercel (static Vite build) | https://foctrack.vercel.app |
| API | Render free web service | https://foctrack-api.onrender.com |
| API docs | FastAPI / Swagger UI | https://foctrack-api.onrender.com/docs |
| Database | Neon free PostgreSQL | connection string held in Render env vars only |

The API and the web app deploy separately. The frontend inlines
`VITE_API_BASE_URL` at build time, so a change to the API origin requires a
frontend rebuild.

## Architecture on free tiers

| Piece | Choice | Why |
|---|---|---|
| API host | Render free web service | No card required; sleeps when idle |
| Database | Neon free PostgreSQL | Free plan does not expire, unlike Render's free Postgres, which is deleted 30 days after creation |
| Static host | Vercel Hobby | Free, CDN-hosted, SPA rewrite included |

Render free services cannot attach a persistent disk, so the SQLite file used
for local development cannot survive a deploy or a spin-down. That is why the
deployed API points at PostgreSQL.

## 1. Database (Neon)

1. Create the project once:

```bash
neonctl projects create --name foctrack --region-id aws-us-west-2 --database focustrack
```

2. Copy the connection string from the output or the console
   (Neon → project → **Connect**). It looks like:

```
postgresql://<role>:<password>@<endpoint>.<region>.aws.neon.tech/focustrack?sslmode=require
```

3. Store it only as the `FOCTRACK_DATABASE_URL` environment variable on Render.
   The API accepts `postgres://` and `postgresql://` DSNs and pins the psycopg 3
   driver itself, so the string can be pasted exactly as the provider prints it.

No schema step is needed: the API runs `alembic upgrade head` on boot. It does
not create a profile — people create their own account through the web app, and
registration creates that account's settings and eight default categories.

## 2. API on Render

The repository ships `render.yaml`, but the running service was created from the
CLI, with these settings:

| Setting | Value |
|---|---|
| Type / runtime | Web service / Python 3.12.3 |
| Root directory | `backend` |
| Plan | `free` |
| Region | `oregon` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/api/v1/health` |
| `FOCTRACK_ENVIRONMENT` | `production` |
| `FOCTRACK_DATABASE_URL` | the Neon DSN (secret, dashboard or CLI only) |
| `FOCTRACK_CORS_ORIGINS` | `https://foctrack.vercel.app` |
| `FOCTRACK_JWT_SECRET` | a random value of at least 32 characters (secret) |
| `FOCTRACK_GOOGLE_CLIENT_ID` | the OAuth Web client id, when Google sign-in is enabled |
| `FOCTRACK_TRUST_FORWARDED_FOR` | `true` (Render terminates TLS and sets the header) |

```bash
render workspace set <workspace-id>
render services create \
  --name foctrack-api --type web_service --runtime python --plan free \
  --repo https://github.com/officialarghya29/FocTrack --branch main \
  --root-directory backend --region oregon \
  --build-command 'pip install -r requirements.txt' \
  --start-command 'uvicorn app.main:app --host 0.0.0.0 --port $PORT' \
  --health-check-path /api/v1/health \
  --env-var FOCTRACK_ENVIRONMENT=production \
  --env-var "FOCTRACK_DATABASE_URL=<neon-dsn>" \
  --env-var FOCTRACK_CORS_ORIGINS=https://foctrack.vercel.app \
  --env-var "FOCTRACK_JWT_SECRET=<at-least-32-random-characters>" \
  --env-var FOCTRACK_TRUST_FORWARDED_FOR=true
```

Generate the signing secret locally, never in a tracked file:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

In production the API refuses to start when `FOCTRACK_JWT_SECRET` is missing or
shorter than 32 characters. That is deliberate: a weak signing key would make
every access token forgeable.

This service was created from the CLI and has no GitHub webhook, so a push does
not deploy it. Either install the Render GitHub App on the repository (Render
dashboard → service → **Settings → Build & Deploy → Repository**) to get
push-to-deploy, or trigger each deploy explicitly:

```bash
render deploys create <service-id> --commit <sha> --confirm
```

Confirm what is actually running with `render deploys list`: compare the live
deploy's commit with `git rev-parse HEAD` before testing the deployment.

The deployment is successful when `render deploys list` reports `live` and the
health check returns 200.

## 3. Frontend on Vercel

```bash
cd frontend
vercel project create foctrack
vercel link --yes --project foctrack
printf 'https://foctrack-api.onrender.com/api/v1' | vercel env add VITE_API_BASE_URL production
vercel deploy --prod --yes
```

`frontend/vercel.json` sets the framework, build command, output directory and
the SPA rewrite, so deep links such as `/analytics` resolve to `index.html`.

The project is connected to the GitHub repository with `vercel git connect`, so
a push to `main` starts a production build. The Vercel project root is the
repository root, which is why the repository also has a root `vercel.json`: it
installs and builds in `frontend/` and serves `frontend/dist`. CLI deploys run
from `frontend/` and use that directory's configuration. Keep the two files
consistent when the build changes. CLI deploys remain available for a build you
want to ship without a commit.

Rebuild whenever `VITE_API_BASE_URL` changes; the value is inlined into the
bundle. To confirm the deployed bundle points at the right API:

```bash
curl -s https://foctrack.vercel.app | grep -o '/assets/index-[^"]*\.js'
# then fetch that asset and search for the API host
```

## 4. Post-deploy verification

Run these against the deployed pair, not localhost.

```bash
curl -s https://foctrack-api.onrender.com/api/v1/health
# {"status":"ok",...}  (cheap liveness; no database access)

curl -s https://foctrack-api.onrender.com/api/v1/health/ready
# {"status":"ok","database":"ok",...}

# CORS must echo the frontend origin
curl -s -o /dev/null -D - -X OPTIONS \
  https://foctrack-api.onrender.com/api/v1/sessions \
  -H "Origin: https://foctrack.vercel.app" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin

# Unauthenticated data requests must be rejected
curl -s -o /dev/null -w '%{http_code}\n' https://foctrack-api.onrender.com/api/v1/sessions
# 401

# A fresh account proves the auth path end to end
curl -s -X POST https://foctrack-api.onrender.com/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.com","password":"a-long-smoke-password","username":"Smoke"}'
# 201 with accessToken and refreshToken
```

Then, in the browser:

0. Create an account, sign out, create a second account, and confirm the second
   account sees empty states while the first account's session survives a
   sign-in.
1. The dashboard loads with empty states and zeroed metrics.
2. Start a session, refresh, and confirm the timer continues from the
   server-reconciled duration.
3. Pause, resume, log one interruption, finish, and check the summary numbers.
4. Open Analytics and confirm the charts match the session just recorded.
5. Import a CSV from Settings and confirm the per-row error list for malformed
   rows.
6. Export JSON and confirm it contains the recorded session.

## 5. Operational notes

* **Cold starts.** The Render free service sleeps after 15 minutes without
  inbound traffic and takes up to a minute to wake. The Neon compute suspends
  when idle as well. The first request after a quiet period is slow, not broken.
* **Keep-warm.** `.github/workflows/keep-warm.yml` requests `/health/ready` every five
  minutes, which keeps the free instance inside its 750 monthly hours (744 for
  an always-on service). Scheduled workflows do not consume paid Actions
  minutes on a public repository. GitHub can delay or drop a scheduled run,
  especially for a newly added workflow, so treat this as an optimisation: the
  client timeout and retry path is what keeps a visitor from getting stuck.
  Run it on demand with `gh workflow run keep-warm.yml`. Disable it if the API
  is not meant to stay up and expect cold starts to return.
* **Client deadlines.** The web client aborts a request after 30 seconds and
  retries gateway errors, timeouts and 5xx responses four times with backoff.
  A loading block also explains that the free API may be starting up after six
  seconds. This turns a stalled instance into a clear error or a successful
  wake instead of an endless spinner.
* **Connections.** The engine uses `pool_pre_ping` and a 300 second
  `pool_recycle` so a suspended database resumes cleanly. Keep the pool small;
  the free Neon plan has a bounded connection limit.
* **Storage.** Free Neon provides 0.5 GB. Free Render services have an ephemeral
  filesystem, so nothing is stored on disk in production.
* **Backups.** Neon keeps six hours of branch history on the free plan, which
  covers a bad deploy but not long-term retention. Download the JSON export from
  Settings before schema changes, or take a local dump:

  ```bash
  pg_dump "$FOCTRACK_DATABASE_URL" --no-owner --format=custom > focustrack.dump
  ```

  The DSN is read from the environment, never written into a tracked file.
* **Accounts.** Each visitor creates a private account; every query is scoped
  by the authenticated user id. The legacy pre-auth profile row is deliberately
  left unclaimed and is not attached to any new registration.
* **Rate limiting.** Login (5/min per IP+email), registration (5/hour per IP),
  Google (20/min per IP) and refresh (30/min per IP) return `429` with
  `Retry-After`. The limiter is in-process, which is correct for this
  single-instance deployment; scaling out requires a shared store.
* **Security headers.** The frontend sends a CSP that allows only the API
  origin and Google Identity Services. If the API host changes, update both
  `VITE_API_BASE_URL` and the CSP `connect-src`.
* **Scaling.** One API instance. Multiple workers would require moving the
  in-process rate limiter to a shared store and adding database connections.
* **CORS.** Compare the exact frontend origin (scheme, host, port) with
  `FOCTRACK_CORS_ORIGINS`. After changing it, redeploy the API so the new
  environment is loaded.
* **Migrations.** Additive only. The API applies `head` on boot and fails the
  boot if a migration fails, rather than serving a half-migrated schema.

## 5.1 Google sign-in (optional)

Password sign-in works without any Google configuration. To enable the Google
button:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID → Web application**.
2. Add an **Authorized JavaScript origin**: `https://foctrack.vercel.app`
   (plus `http://localhost:5173` for local development).
3. Set `FOCTRACK_GOOGLE_CLIENT_ID` on Render and `VITE_GOOGLE_CLIENT_ID` for the
   Vercel Production environment, using the same client id.
4. Redeploy both: the API needs the id to verify tokens, and the frontend
   rebuild inlines `VITE_GOOGLE_CLIENT_ID`. The button is hidden when it is unset.

There is no client secret in this flow: the browser receives a signed ID token
from Google Identity Services and the API verifies its signature, audience,
issuer and expiry against Google's published keys. A Google email is linked to
an existing account only when that account already has a verified email.

## 5.2 Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

* backend lint (`ruff`) and the full pytest suite on SQLite;
* the same suite against a PostgreSQL 16 service container;
* frontend typecheck, Vitest and a production build.

The checks are independent of the deployment. To make them block merges, enable
branch protection for `main` in GitHub → Settings → Branches and require the
three CI jobs.

## 6. CLI reference

Both CLIs are installed and authenticated under the repository owner's account.

```bash
render --version && render whoami -o json
vercel --version && vercel whoami
```

To perform this deployment from scratch:

```bash
# Render
curl -fsSL raw.githubusercontent.com/render-oss/cli/refs/heads/main/bin/install.sh | sh
render login            # browser device flow; token stored in ~/.render/cli.yaml
render workspace set <workspace-id>

# Vercel
npm install -g vercel@latest
vercel login
```

For CI, both CLIs read `RENDER_API_KEY` and `VERCEL_TOKEN` from the environment.
Never commit either token, and never put the database DSN in a tracked file.

## 7. Rollback

1. API: `render deploys create <service-id> --commit <previous-sha> --confirm`.
2. Frontend: promote the previous deployment in the Vercel dashboard
   (`vercel promote <deployment-url>`).
3. If a migration must be reverted, restore the last JSON export into a fresh
   database rather than running an untested downgrade in production.
