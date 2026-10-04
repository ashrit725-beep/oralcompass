# Deploying OralCompass

Status: **deployment-ready, not deployed** (owner decision, design spec addendum §D.1). Nothing in this repository publishes, pushes or
provisions anything. This page is what a person runs when the owner decides to go live.

## What runs

One container, one process (`api/app/server.py`):

| Path | Served by | Notes |
|---|---|---|
| `/api/...` | the existing FastAPI app (`app.main:app`), mounted unchanged | `GET /api/health` is the platform health check |
| `/assets/*` | `web/dist` (Vite's content-hashed bundles) | `Cache-Control: public, max-age=31536000, immutable` |
| `/fixtures/plans/*.json`, `/fixtures/documents/*.pdf` | the repository's public fixture plans and fictional documents | no personal data |
| everything else | `web/dist/index.html` (SPA fallback) | `no-cache`; a missing file with an extension is a 404 |

State lives on one persistent volume mounted at `/data`:

- `/data/oralcompass.db` — `SqliteRepo` (`ORALCOMPASS_STORE=sqlite`, WAL mode): owner-scoped records keyed `(sub, type, id)`, the ids-only audit
  trail, and the live-AI cost-guard counters.
- `/data/uploads/<hashed session>/docs/<id>.pdf` — uploaded plan PDFs (`ORALCOMPASS_DATA_DIR`), mode 600, reachable only through the owner check.

Visitors are identified by a private per-visitor session (`api/app/sessions.py`): an opaque 256-bit random id in a signed cookie
(`oc_session`, HttpOnly, SameSite=Lax, Path=/, one year, Secure over https). The database key is a hash of that id, never the id itself.
"Delete all my data" removes the visitor's records and stored files and expires the cookie.

## Railway

> Railway marks `railway.json` (Config as Code) as deprecated: existing services keep reading it until **2026-12-01**, and new services
> cannot opt into it. The repository ships `railway.json` because the brief asked for it; for a new service, set the same values in the
> dashboard or in `.railway/railway.ts` (Infrastructure as Code; sketch at the end of this section). Railway also builds any repository with
> a root `Dockerfile` with that Dockerfile.

1. **Create the service** from this repository (root directory `/`). The builder is the root `Dockerfile` (`railway.json`: builder
   `DOCKERFILE`, health check `/api/health`, timeout 120 s, restart on failure).
2. **Attach a volume** to the service, mount path **`/data`** (1 GB is plenty for a demo). Volumes are not expressible in `railway.json`;
   attach it in the dashboard (or `volumeMounts` in `.railway/railway.ts`). A service with a volume deploys with a short downtime instead
   of overlapping two containers, which is what SQLite needs (one writer).
3. **Variables** (Service → Variables; the full list with comments is `api/.env.production.example`):

   | Variable | Value |
   |---|---|
   | `ORALCOMPASS_SESSION_SECRET` | **required secret** — `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
   | `OPENROUTER_API_KEY` | secret, for live AI; leave unset for demo mode |
   | `ORALCOMPASS_LLM_PROVIDER` | `openrouter` (or `none` to force demo mode) |
   | `ORALCOMPASS_LLM_MODEL` | `anthropic/claude-haiku-4.5` |
   | `ORALCOMPASS_LLM_DAILY_REQUESTS`, `ORALCOMPASS_LLM_DAILY_USD` | the global daily caps (defaults 300 requests, $2.00) |
   | `RAILWAY_RUN_UID` | `0` — Railway mounts volumes owned by root; the entrypoint then hands `/data` to uid 10001 and drops root before starting the server |

   Already set by the image (override only to change): `ORALCOMPASS_ENV=production`, `ORALCOMPASS_STORE=sqlite`,
   `ORALCOMPASS_DB_PATH=/data/oralcompass.db`, `ORALCOMPASS_DATA_DIR=/data/uploads`. `PORT` is provided by Railway.
   **Never set `ORALCOMPASS_DEV_AUTH`** (the server refuses to start with it under `ORALCOMPASS_ENV=production`).
4. **Deploy**, then open `https://<service>.up.railway.app/api/health`: `{"ok": true, "llm_mode": "live" | "demo", "llm_cap_reached": false, ...}`.
   The key never appears there or in logs.
5. Generate a domain (Settings → Networking). TLS terminates at Railway's proxy; uvicorn runs with `--proxy-headers`, so the session cookie
   gets `Secure` and responses get HSTS.

Infrastructure-as-Code sketch (verify with `railway config plan` before any apply; written from Railway's IaC reference, not applied here):

```ts
import { defineRailway, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const data = volume("oralcompass-data", { sizeMB: 1024 });
  const app = service("oralcompass", {
    healthcheck: "/api/health",
    volumeMounts: { "/data": data },
    env: {
      ORALCOMPASS_SESSION_SECRET: preserve(),
      OPENROUTER_API_KEY: preserve(),
      ORALCOMPASS_LLM_PROVIDER: "openrouter",
      ORALCOMPASS_LLM_MODEL: "anthropic/claude-haiku-4.5",
      RAILWAY_RUN_UID: "0",
    },
  });
  return project("oralcompass", { resources: [app, data] });
});
```

## Docker, locally

```bash
docker build -t oralcompass .
docker volume create oralcompass-data
docker run --rm -p 8000:8000 -v oralcompass-data:/data \
  -e ORALCOMPASS_SESSION_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')" \
  -e ORALCOMPASS_LLM_PROVIDER=none \
  oralcompass
# open http://127.0.0.1:8000  (health: http://127.0.0.1:8000/api/health)
```

For live AI add `-e ORALCOMPASS_LLM_PROVIDER=openrouter -e OPENROUTER_API_KEY=...` (from your shell, never from a committed file). The image
runs as uid 10001; a named volume is initialised from the image with that owner. A bind mount must be writable by uid 10001 (or start the
container with `--user 0` and the entrypoint hands the directory over, then drops root).

Without Docker, the same server runs from a checkout:

```bash
cd web && npm ci && npm run build && cd ../api
ORALCOMPASS_ENV=production ORALCOMPASS_STORE=sqlite ORALCOMPASS_DB_PATH=/tmp/oc/oralcompass.db ORALCOMPASS_DATA_DIR=/tmp/oc/uploads \
ORALCOMPASS_SESSION_SECRET=... ORALCOMPASS_LLM_PROVIDER=none \
python3 -m uvicorn app.server:app --host 127.0.0.1 --port 8080 --no-access-log
```

## Verifying before a deploy

- `python3 tools/prod_smoke.py` — builds the web app, starts `app.server` exactly as in production (SQLite in a temp dir, sessions, no dev
  auth, demo model) on a free port, and walks it with Playwright: health, Alex's $902.00 estimate, the HttpOnly session cookie, a second
  visitor's isolation (no journeys, constant 404, the dev header ignored), a stored PDF and an uploaded, published plan rendered through pdf.js,
  the service worker, "Delete all my data" (records, stored file and cookie), zero CSP violations and zero page errors. When Docker is
  available it then builds the image and runs the same walk against the container (`--no-docker` skips that). It stops every server it starts.
- The usual checks: `cd api && python3 -m pytest -q tests` (the whole API suite runs on InMemoryRepo and again on SqliteRepo), engine tests,
  `tools/ingest_sources.py --check`, `tools/advice_lint.py`, `npm run build && npm test && npm run check:engines && npm run check:bundle`,
  `tools/screenshots.py` (dev mode).

## Security posture (what is implemented)

- **Headers** (`api/app/security.py`): CSP `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self';
  worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
  `X-Frame-Options: DENY`, HSTS over https. Relaxations and why: inline styles (React/Motion/NumberFlow/Radix write style attributes), `data:`/`blob:`
  images, `blob:` workers (pdf.js fallback), `blob:` connect (pdf.js reads the visitor's own PDF from an object URL; the smoke test failed
  without it). No inline or eval'd script, no third-party origins.
- **Body limits**: 35 MB on upload routes, 1 MB elsewhere (declared or streamed).
- **Logs**: one JSON line per request (request id, method, path, status, duration, bytes in); uvicorn's access log is off (it would print
  query strings and client addresses). Session ids, document text, names and amounts are never logged.
- **Sessions**: signed cookie, hashed owner key, tamper → new empty session, constant 404 across visitors.
- **Images sent to a model**: only after the visitor confirms the notice, re-encoded without metadata and bounded in size; never in demo
  mode (`docs/SECURITY.md`).
- **Live-AI cost guard** (`api/app/llm_guard.py`): per-visitor limits (extraction 5/day, treatment-plan reader 10/day, clause explainer 60/day,
  assistant 30 per 10 minutes), a global daily request cap and an estimated-spend cap priced from the model's per-token rates, persisted in
  SQLite and reset at UTC midnight. A refused call falls back to the demo/template path with the ribbon "The live model limit for today has
  been reached; a template answer is shown." The OpenRouter key lives only in the server environment.

## What is not production-grade (state it, do not hide it)

- **No accounts.** A visitor's records are tied to one browser's cookie. Clearing cookies, another device or a rotated session secret loses
  access to them (they stay in the database until deleted). Judging criterion 7: described, not built.
- **One instance, one SQLite file.** No horizontal scaling, no replication. Back up the volume (the platform's volume backups) if the data matters.
  Records of abandoned sessions are not expired automatically.
- **Encryption at rest** is whatever the platform's volume provides; the app does not add per-user keys (the SAM skeleton's KMS design in
  `infra/template.yaml` is not what this container uses).
- **Rate limits are per session.** A visitor who discards cookies gets a fresh per-visitor allowance; the global daily request and spend caps
  are the backstop. Spend is an estimate from reported token usage, not the provider's bill.
- **No CSRF token.** State-changing requests rely on SameSite=Lax cookies plus JSON/multipart bodies from the same origin; there is no CORS
  configuration that would admit another origin.
- **No malware scanning** of uploaded PDFs (they are parsed with PyMuPDF and never served to anyone but their owner).
- **Web Push** needs VAPID keys and is unverified end to end (`docs/BUILD_FOLLOWUPS.md`).
- Docker was not available where this was built: the image build and the container smoke have not been run yet; the local production smoke
  (same server, same settings) passes.
