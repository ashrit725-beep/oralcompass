"""Security middleware: response headers, request body limits and structured request logs (ids and outcomes only).

Headers on every response (never overwriting a header a route already set):
- Content-Security-Policy — CSP_DIRECTIVES below. Relaxations beyond the strict baseline, each needed by the built web app and verified by
  tools/prod_smoke.py (CSP violations = 0):
    * style-src 'unsafe-inline' — React `style` props, Motion and NumberFlow write inline styles; Radix/vaul set positioning styles.
    * img-src data: blob: — data: URI textures in the stylesheet; blob: for canvas/object URLs.
    * worker-src blob: — pdf.js may start its worker from a blob URL when the module worker cannot be constructed directly.
    * connect-src blob: — pdf.js reads an owner-scoped PDF from an object URL (the bytes were fetched with the session cookie first).
  Everything else stays 'self' or 'none': no inline or eval'd script, no third-party origins, no framing (frame-ancestors 'none').
- X-Content-Type-Options: nosniff; Referrer-Policy: strict-origin-when-cross-origin; Permissions-Policy: camera=(), microphone=(),
  geolocation=(); X-Frame-Options: DENY (legacy twin of frame-ancestors); Strict-Transport-Security when the request arrived over https
  (directly or via X-Forwarded-Proto from the platform's TLS proxy); X-Request-ID.

Body limits: 35 MB for upload routes (a path ending in one of LARGE_BODY_SUFFIXES, or listed in ORALCOMPASS_LARGE_BODY_PATHS), 1 MB for every
other request. A declared Content-Length over the limit gets 413 before the body is read; a chunked body is counted as it streams and the
request fails with 413 once it passes the limit.

Logs: one JSON line per request on the `oralcompass.http` logger — request id, method, route path (ids only; no query string, no headers,
no cookies, no bodies), status, duration, bytes received. Session ids, document text, names and amounts never appear.
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid

from fastapi import HTTPException

log = logging.getLogger("oralcompass.http")

CSP_DIRECTIVES: dict[str, str] = {
    "default-src": "'self'",
    "img-src": "'self' data: blob:",
    "style-src": "'self' 'unsafe-inline'",
    "script-src": "'self'",
    "worker-src": "'self' blob:",
    "connect-src": "'self' blob:",       # pdf.js reads the owner's stored PDF from an object URL (see module docstring)
    "object-src": "'none'",
    "frame-ancestors": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
}
CSP = "; ".join(f"{k} {v}" for k, v in CSP_DIRECTIVES.items())

STATIC_HEADERS: list[tuple[bytes, bytes]] = [
    (b"content-security-policy", CSP.encode()),
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"x-frame-options", b"DENY"),
]
HSTS = (b"strict-transport-security", b"max-age=31536000; includeSubDomains")

UPLOAD_LIMIT = 35 * 1024 * 1024
DEFAULT_LIMIT = 1 * 1024 * 1024
# POST /me/documents/upload (a new file route ending in /upload is covered too) and POST /me/treatment-plans/read (a photo or PDF of an
# estimate; the reader caps the file itself at 10 MB and pasted text at 20,000 characters).
LARGE_BODY_SUFFIXES: tuple[str, ...] = ("/upload", "/me/treatment-plans/read")


class BodyTooLarge(HTTPException):
    """Raised from the wrapped `receive` so FastAPI's body parsing re-raises it as-is (it re-raises HTTPException) → a clean 413."""

    def __init__(self, limit: int) -> None:
        super().__init__(status_code=413, detail={"error": "body_too_large", "max_bytes": limit})


def body_limit(path: str) -> int:
    extra = tuple(p.strip() for p in (os.getenv("ORALCOMPASS_LARGE_BODY_PATHS") or "").split(",") if p.strip())
    p = path.rstrip("/")
    if p.endswith(LARGE_BODY_SUFFIXES) or (extra and p.endswith(extra)):
        return UPLOAD_LIMIT
    return DEFAULT_LIMIT


def is_https(scope: dict, headers: dict[str, str]) -> bool:
    if scope.get("scheme") == "https":
        return True
    return headers.get("x-forwarded-proto", "").split(",")[0].strip().lower() == "https"


class SecurityMiddleware:
    """Pure ASGI. `skip_prefix` lets an outer app leave a mounted sub-app (which has its own instance) alone."""

    def __init__(self, app, skip_prefix: str | None = None) -> None:
        self.app = app
        self.skip_prefix = skip_prefix

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        if self.skip_prefix and (path == self.skip_prefix or path.startswith(self.skip_prefix + "/")):
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        https = is_https(scope, headers)
        rid = uuid.uuid4().hex[:16]
        limit = body_limit(path)
        t0 = time.perf_counter()
        state = {"status": None, "received": 0, "started": False}

        def add_headers(raw: list) -> list:
            present = {k.lower() for k, _ in raw}
            extra = [(k, v) for k, v in STATIC_HEADERS if k not in present]
            if https and HSTS[0] not in present:
                extra.append(HSTS)
            extra.append((b"x-request-id", rid.encode()))
            return list(raw) + extra

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                state["status"], state["started"] = message["status"], True
                message = {**message, "headers": add_headers(message.get("headers", []))}
            await send(message)

        async def receive_wrapper():
            message = await receive()
            if message["type"] == "http.request":
                state["received"] += len(message.get("body", b""))
                if state["received"] > limit:
                    raise BodyTooLarge(limit)
            return message

        async def reject():
            body = json.dumps({"detail": {"error": "body_too_large", "max_bytes": limit}}).encode()
            await send_wrapper({"type": "http.response.start", "status": 413,
                                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()), (b"connection", b"close")]})
            await send({"type": "http.response.body", "body": body})

        try:
            declared = headers.get("content-length")
            if declared is not None and declared.isdigit() and int(declared) > limit:
                await reject()
                return
            try:
                await self.app(scope, receive_wrapper, send_wrapper)
            except BodyTooLarge:
                if state["started"]:
                    raise
                await reject()
        finally:
            log.info(json.dumps({"event": "http", "rid": rid, "method": scope.get("method"), "path": path, "status": state["status"] or 500,
                                 "ms": round((time.perf_counter() - t0) * 1000, 1), "bytes_in": state["received"]}, separators=(",", ":")))
