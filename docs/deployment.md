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

No schema step is needed: the API runs `alembic upgrade head` on boot, creates
the profile and seeds the eight default categories.

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
  --env-var FOCTRACK_CORS_ORIGINS=https://foctrack.vercel.app
```

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
a push to `main` starts a production build. CLI deploys remain available for a
build you want to ship without a commit.

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
# {"status":"ok","database":"ok",...}

# CORS must echo the frontend origin
curl -s -o /dev/null -D - -X OPTIONS \
  https://foctrack-api.onrender.com/api/v1/sessions \
  -H "Origin: https://foctrack.vercel.app" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin

curl -s https://foctrack-api.onrender.com/api/v1/profile
curl -s https://foctrack-api.onrender.com/api/v1/categories
```

Then, in the browser:

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
* **Keep-warm.** `.github/workflows/keep-warm.yml` requests `/health` every five
  minutes, which keeps the free instance inside its 750 monthly hours (744 for
  an always-on service). Scheduled workflows do not consume paid Actions
  minutes on a public repository. Disable the workflow if the API is not meant
  to stay up, and expect cold starts to return.
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
* **Single profile.** There is no authentication. Do not advertise the
  deployment as a multi-user service.
* **Scaling.** One API instance. Multiple workers are unnecessary for a
  single-profile app and would only add database connections.
* **CORS.** Compare the exact frontend origin (scheme, host, port) with
  `FOCTRACK_CORS_ORIGINS`. After changing it, redeploy the API so the new
  environment is loaded.
* **Migrations.** Additive only. The API applies `head` on boot and fails the
  boot if a migration fails, rather than serving a half-migrated schema.

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
