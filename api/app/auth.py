"""Authentication: per-visitor signed-cookie sessions in production; a dev header in local/test mode; Cognito JWT when a pool is configured.

Order of precedence (sessions.py holds the mode switches):
1. Dev/test: ORALCOMPASS_DEV_AUTH=1 → the `X-Dev-User` header is the user id (401 without it). Never enable in production.
2. Cognito: ORALCOMPASS_COGNITO_JWKS_URL set → API Gateway's JWT authorizer validates the Cognito token and forwards claims; this module
   re-validates `sub` from `Authorization: Bearer <jwt>` with the pool's JWKS (ORALCOMPASS_COGNITO_JWKS_URL, ORALCOMPASS_COGNITO_AUDIENCE).
3. Otherwise (the single-container deployment): sessions.SessionMiddleware has verified or issued the `oc_session` cookie, and the owner
   key is a hash of that session id. `X-Dev-User` and `Authorization` are ignored in this mode.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

from fastapi import Header, HTTPException, Request

from .sessions import cognito_mode, dev_mode, session_sub


# A dev user id becomes a directory name under ORALCOMPASS_DATA_DIR (uploads.doc_path), so only a short safe slug is accepted:
# "../x" or a 5,000-character header is 401, never a path outside the data dir.
_DEV_USER_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}")


@dataclass(frozen=True)
class User:
    sub: str


def _dev_mode() -> bool:          # kept for callers of the old name
    return dev_mode()


def current_user(request: Request, authorization: str | None = Header(default=None), x_dev_user: str | None = Header(default=None)) -> User:
    if dev_mode():
        if not x_dev_user or not _DEV_USER_RE.fullmatch(x_dev_user) or ".." in x_dev_user:
            raise HTTPException(status_code=401, detail={"error": "unauthenticated"})
        return User(sub=x_dev_user)
    if cognito_mode():
        if not authorization or not authorization.lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail={"error": "unauthenticated"})
        token = authorization.split(" ", 1)[1]
        try:
            import jwt  # PyJWT
            from jwt import PyJWKClient
            jwks_url = os.environ["ORALCOMPASS_COGNITO_JWKS_URL"]
            audience = os.environ["ORALCOMPASS_COGNITO_AUDIENCE"]
            signing_key = PyJWKClient(jwks_url).get_signing_key_from_jwt(token)
            claims = jwt.decode(token, signing_key.key, algorithms=["RS256"], audience=audience)
            return User(sub=claims["sub"])
        except Exception:
            raise HTTPException(status_code=401, detail={"error": "unauthenticated"})
    sid = (request.scope.get("state") or {}).get("oc_session_id")
    if not sid:                    # the session middleware is not installed on this app
        raise HTTPException(status_code=401, detail={"error": "unauthenticated"})
    return User(sub=session_sub(sid))
