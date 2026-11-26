# FocTrack — Deployment runbook

**Current status: not deployed.** No hosting account or API token for Vercel,
Render or Netlify exists in the development environment, so this document
describes the exact procedure rather than a live URL. Add the resulting URLs to
the README's deployment section once they exist.

Two components are deployed separately:

| Component | Platform | Artifact |
|---|---|---|
| API | Render (Python web service) | FastAPI + SQLite on a persistent disk |
| Web app | Vercel (static) | Vite production build |

Deploy the API first, because the frontend needs its origin at build time.

## 1. API on Render

The repository includes `render.yaml`, so the simplest path is a Blueprint.

1. Push the repository to GitHub.
2. Render → **New → Blueprint** → select the repository → apply.
3. Confirm these values:

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/api/v1/health` |
| Disk mount | `/var/data`, 1 GB |
| `FOCTRACK_DATABASE_URL` | `sqlite:////var/data/focustrack.db` |
| `FOCTRACK_ENVIRONMENT` | `production` |
| `FOCTRACK_CORS_ORIGINS` | your deployed frontend origin |
| `PYTHON_VERSION` | `3.12.3` |
| Plan | `starter` (required for the persistent disk) |

`FOCTRACK_CORS_ORIGINS` is a comma-separated allowlist with no wildcard. Set it
after the frontend URL is known, then redeploy the API.

The Render free plan does not support persistent disks. The blueprint uses the
`starter` plan so the SQLite file survives deploys; switch to an external
PostgreSQL service if a free tier is mandatory, and note that this release has
not been validated against live PostgreSQL.

The service runs `alembic upgrade head` during startup, so the first boot
creates the schema. A failed migration stops the service instead of serving a
half-migrated database.

Verify:

```bash
curl https://<api-host>/api/v1/health
# {"status":"ok","database":"ok",...}
```

## 2. Frontend on Vercel

1. Vercel → **Add New → Project** → import the repository.
2. Root directory: `frontend`.
3. Framework preset: Vite. Build: `npm run build`. Output: `dist`.
4. Environment variable:

```
VITE_API_BASE_URL=https://<api-host>/api/v1
```

`frontend/vercel.json` provides the SPA rewrite so deep links such as
`/analytics` resolve to `index.html`.

Redeploy after changing the API origin. Rebuild the frontend whenever
`VITE_API_BASE_URL` changes; Vite inlines it at build time.

## 3. Post-deploy verification

Run these against the deployed pair, not localhost:

1. `GET /api/v1/health` returns `status: ok` and `database: ok`.
2. The frontend loads, and Overview shows zeroed metrics with an empty state.
3. Start a session, refresh the page, and confirm the timer continues from the
   server-reconciled duration.
4. Pause, resume, log one interruption, finish, and check the summary numbers.
5. Open Analytics and confirm the charts match the session just recorded.
6. Export the JSON file and confirm it contains the session.
7. `GET /docs` is reachable on the API host.

## 4. Operational notes

* **Persistence:** the SQLite file lives on the Render disk. Without a disk the
  database is lost on every deploy.
* **Backups:** download the JSON export regularly. Render disk snapshots are a
  paid feature; the export endpoint is the portable backup.
* **Single profile:** the MVP has no authentication. Do not advertise the
  deployment as a multi-user service. Restrict access or complete the account
  layer before sharing it publicly.
* **Scaling:** one instance only. Multiple workers against the same SQLite file
  are not supported.
* **Migrations:** always additive. Take an export before deploying a schema
  change.
* **CORS:** if the browser shows CORS errors, compare the exact frontend origin
  (scheme + host + port) with `FOCTRACK_CORS_ORIGINS`.

## 5. CLI-assisted deployment

The commit history and configs are ready to deploy from a terminal. If you want
the deployment performed for you, install and authenticate both CLIs on this
machine once; the credentials persist in your home directory and are never
written into the repository.

### Render

Linux (this machine):

```bash
curl -fsSL raw.githubusercontent.com/render-oss/cli/refs/heads/main/bin/install.sh | sh
# open a new terminal afterwards so `render` is on PATH
render --version
render login
render whoami -o json
```

`render login` opens the dashboard in a browser, asks you to authorize the CLI
and stores a CLI token in `~/.render/cli.yaml`. Select the workspace that owns
the service when prompted (`render workspace set`).

For headless or CI use, the CLI also accepts a Render API key:

```bash
export RENDER_API_KEY="rnd_..."   # current shell only; never commit it
CI=true render whoami -o json
```

Once authenticated, the service can be created from the repository settings and
deployed with the CLI (`render services create`, then
`render deploys create <service-id> --confirm`). The exact flags are read from
`render.yaml`; no credentials belong in that file.

### Vercel

```bash
npm install -g vercel@latest
vercel --version
vercel login
vercel whoami
```

`vercel login` uses a browser-based device flow and stores the session in your
Vercel CLI config. For non-interactive use, `VERCEL_TOKEN` is read from the
environment:

```bash
export VERCEL_TOKEN="..."   # current shell only
vercel whoami
```

From `frontend/`, link the project once and deploy:

```bash
vercel link
vercel env add VITE_API_BASE_URL production   # paste the Render API origin
vercel --prod
```

### Handy verification

```bash
render whoami -o json
render services list -o json
vercel whoami
curl -s https://<api-host>/api/v1/health
```

Do not paste CLI tokens into chat, commit them, or add them to `.env.example`.
If a token is exposed, revoke it in the Render or Vercel dashboard and log in
again.

## 6. Rollback

1. Render → redeploy the previous commit.
2. Vercel → promote the previous deployment.
3. If a migration must be reverted, restore the last JSON export into a fresh
   database rather than running an untested downgrade in production.
