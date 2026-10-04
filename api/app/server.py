"""Single production server: the API under /api and the built web app at /.

    cd api && uvicorn app.server:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips '*' --no-access-log

- /api/...   → the existing FastAPI app (app.main:app) mounted unchanged, so the web's `/api/...` calls work exactly as through the Vite proxy.
               GET /api/health is the platform health check.
- /assets/*  → Vite's content-hashed bundles: `Cache-Control: public, max-age=31536000, immutable`.
- /fixtures/plans/*.json, /fixtures/documents/*.pdf → the public fixture plans and fictional documents (from web/dist when the build
               copied them, else from the repository's fixtures/ directory). They hold no personal data.
- any other path without a file extension → index.html (SPA fallback, `no-cache`); index.html, sw.js and the manifest are `no-cache`;
  other static files (art) get one day. A missing file with an extension is a plain 404, never index.html.

Security headers, body limits and request logs come from security.SecurityMiddleware (the mounted API has its own instance, so the outer
one skips /api). With ORALCOMPASS_ENV=production the process refuses to start with dev auth on or without a 32+ character
ORALCOMPASS_SESSION_SECRET, and the API's interactive docs are disabled (they load scripts from a CDN the CSP blocks).
"""
from __future__ import annotations

import logging
import os
import re
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from starlette.responses import FileResponse, Response

ROOT = Path(__file__).resolve().parents[2]
WEB_DIST = Path(os.getenv("ORALCOMPASS_WEB_DIST") or ROOT / "web" / "dist").resolve()
FIXTURES = Path(os.getenv("ORALCOMPASS_FIXTURES_DIR") or ROOT / "fixtures").resolve()

IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"
ONE_DAY = "public, max-age=86400"
NO_CACHE_FILES = {"index.html", "sw.js", "manifest.webmanifest"}
FIXTURE_ROUTES = {"fixtures/plans": (re.compile(r"^[a-z0-9_-]{1,64}\.json$"), FIXTURES / "plans"),
                  "fixtures/documents": (re.compile(r"^[a-z0-9_-]{1,96}\.pdf$"), FIXTURES / "documents")}


def check_production_config() -> None:
    if os.getenv("ORALCOMPASS_ENV") != "production":
        return
    if os.getenv("ORALCOMPASS_DEV_AUTH") == "1":
        raise RuntimeError("ORALCOMPASS_DEV_AUTH=1 is not allowed with ORALCOMPASS_ENV=production")
    if len(os.getenv("ORALCOMPASS_SESSION_SECRET") or "") < 32:
        raise RuntimeError("ORALCOMPASS_SESSION_SECRET must be set to a random value of at least 32 characters in production")


def configure_logging() -> None:
    """The app's loggers write plain lines to stdout (the platform collects them). Messages are ids and outcomes only."""
    lg = logging.getLogger("oralcompass")
    if not lg.handlers:
        h = logging.StreamHandler(sys.stdout)
        h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        lg.addHandler(h)
    lg.setLevel(os.getenv("ORALCOMPASS_LOG_LEVEL", "INFO").upper())
    lg.propagate = False


check_production_config()
configure_logging()

from .main import app as api_app  # noqa: E402  (after the config check: importing the API loads the plans)
from .security import SecurityMiddleware  # noqa: E402
from starlette.middleware.gzip import GZipMiddleware  # noqa: E402

app = FastAPI(title="OralCompass", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1024)    # inside SecurityMiddleware: JSON, JS, CSS and the pdf.js worker compressed (mobile-15)
app.add_middleware(SecurityMiddleware, skip_prefix="/api")
app.mount("/api", api_app)


def _within(base: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(base)
        return True
    except ValueError:
        return False


def _file(path: Path, cache: str, media_type: str | None = None) -> FileResponse:
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": cache})


def _cache_for(rel: str) -> str:
    if rel.startswith("assets/"):
        return IMMUTABLE
    if rel in NO_CACHE_FILES:
        return NO_CACHE
    return ONE_DAY


def _index() -> Response:
    index = WEB_DIST / "index.html"
    if not index.is_file():
        return Response("The web app is not built (web/dist/index.html is missing).", status_code=503, media_type="text/plain",
                        headers={"Cache-Control": "no-store"})
    return _file(index, NO_CACHE, "text/html; charset=utf-8")


@app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
def web(path: str) -> Response:
    rel = path.lstrip("/")
    if rel in ("", "index.html"):
        return _index()
    if "\x00" in rel or ".." in rel.split("/"):
        raise HTTPException(status_code=404)
    candidate = (WEB_DIST / rel).resolve()
    if _within(WEB_DIST, candidate) and candidate.is_file():
        return _file(candidate, _cache_for(rel), "application/manifest+json" if rel == "manifest.webmanifest" else None)
    folder, _, name = rel.rpartition("/")
    if folder in FIXTURE_ROUTES:
        pattern, base = FIXTURE_ROUTES[folder]
        f = (base / name).resolve()
        if pattern.match(name) and _within(base, f) and f.is_file():
            return _file(f, ONE_DAY)
        raise HTTPException(status_code=404)
    if "." in rel.rsplit("/", 1)[-1] or rel.startswith(("assets/", "api/")):
        raise HTTPException(status_code=404)
    return _index()                                     # client-side route → the SPA shell
