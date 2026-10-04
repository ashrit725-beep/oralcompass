"""Private per-visitor sessions (owner decision, design spec addendum §D.4).

In production (no ORALCOMPASS_DEV_AUTH, no Cognito JWKS configured) every visitor gets an opaque random session id
(`secrets.token_urlsafe(32)`, 256 bits) in a signed cookie on their first API request:

    oc_session=<id>.<HMAC-SHA256(ORALCOMPASS_SESSION_SECRET, id), base64url>; HttpOnly; SameSite=Lax; Path=/; Max-Age=1 year; Secure (https)

The owner key for every repository read is `User.sub = "s-" + sha256(id)[:40]`: derived from the session id, so the database, the audit
trail and the upload directory names never hold the cookie value itself (a copy of the database cannot be replayed as a cookie).
A tampered, truncated or foreign-signed cookie is ignored and replaced by a fresh session. "Delete all my data" (DELETE /me) clears the
cookie. There is no account system: losing the cookie loses access to that visitor's records (stated in docs/DEPLOY.md).

Without ORALCOMPASS_SESSION_SECRET the process signs with a random per-process secret and logs one warning: sessions then end at every
restart. app/server.py refuses to start with ORALCOMPASS_ENV=production and no (or a short) secret.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import re
import secrets
from http.cookies import SimpleCookie
from typing import Optional

COOKIE_NAME = "oc_session"
MAX_AGE_S = 365 * 24 * 3600
_SID_RE = re.compile(r"^[A-Za-z0-9_-]{32,64}$")
_PROCESS_SECRET = secrets.token_bytes(32)
_warned = False
log = logging.getLogger("oralcompass.sessions")


def dev_mode() -> bool:
    return os.getenv("ORALCOMPASS_DEV_AUTH") == "1"


def cognito_mode() -> bool:
    return bool(os.getenv("ORALCOMPASS_COGNITO_JWKS_URL"))


def session_mode() -> bool:
    """Signed-cookie sessions are the production default: neither dev auth nor a Cognito pool is configured."""
    return not dev_mode() and not cognito_mode()


def _secret() -> bytes:
    global _warned
    s = os.getenv("ORALCOMPASS_SESSION_SECRET") or ""
    if s:
        return s.encode()
    if not _warned:
        log.warning("ORALCOMPASS_SESSION_SECRET is not set; sessions are signed with a per-process secret and end at restart")
        _warned = True
    return _PROCESS_SECRET


def _sig(sid: str) -> str:
    mac = hmac.new(_secret(), b"oc-session-v1:" + sid.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).rstrip(b"=").decode()


def new_session_id() -> str:
    return secrets.token_urlsafe(32)


def sign(sid: str) -> str:
    return f"{sid}.{_sig(sid)}"


def verify(value: Optional[str]) -> Optional[str]:
    """The session id inside a cookie value, or None when it is missing, malformed or not signed with the current secret."""
    if not value or value.count(".") != 1:
        return None
    sid, sig = value.split(".", 1)
    if not _SID_RE.match(sid):
        return None
    return sid if hmac.compare_digest(sig, _sig(sid)) else None


def session_sub(sid: str) -> str:
    """The repository owner key for a session id (never the id itself)."""
    return "s-" + hashlib.sha256(sid.encode()).hexdigest()[:40]


def _is_https(scope: dict, headers: dict[str, str]) -> bool:
    if scope.get("scheme") == "https":
        return True
    proto = headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    return proto == "https"


def cookie_header(value: str, https: bool, max_age: int = MAX_AGE_S) -> bytes:
    parts = [f"{COOKIE_NAME}={value}", "Path=/", f"Max-Age={max_age}", "HttpOnly", "SameSite=Lax"]
    if https:
        parts.append("Secure")
    return "; ".join(parts).encode("latin-1")


def mark_cleared(request) -> None:
    """Ask the middleware to expire the session cookie on this response (DELETE /me)."""
    request.scope.setdefault("state", {})["oc_session_clear"] = True


class SessionMiddleware:
    """Pure ASGI middleware: reads/verifies the session cookie, issues a new one on first contact, and expires it on request."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not session_mode():
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        sid = None
        if "cookie" in headers:
            jar = SimpleCookie()
            try:
                jar.load(headers["cookie"])
            except Exception:
                jar = SimpleCookie()
            morsel = jar.get(COOKIE_NAME)
            sid = verify(morsel.value if morsel else None)
        issue = sid is None
        if sid is None:
            sid = new_session_id()
        state = scope.setdefault("state", {})
        state["oc_session_id"] = sid
        https = _is_https(scope, headers)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                extra = []
                if state.get("oc_session_clear"):
                    extra.append((b"set-cookie", cookie_header("", https, max_age=0)))
                elif issue:
                    extra.append((b"set-cookie", cookie_header(sign(sid), https)))
                if extra:
                    message = {**message, "headers": list(message.get("headers", [])) + extra}
            await send(message)

        await self.app(scope, receive, send_wrapper)
