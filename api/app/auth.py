"""Authentication: Cognito JWT in production; a dev header in local/test mode.

Production: API Gateway's JWT authorizer validates the Cognito token and forwards claims; this module re-validates `sub`
from the `Authorization: Bearer <jwt>` header using the pool's JWKS (set FINEPRINT_COGNITO_JWKS_URL and FINEPRINT_COGNITO_AUDIENCE).
Dev/test: when FINEPRINT_DEV_AUTH=1, the `X-Dev-User` header is the user id. Never enable in production.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import Header, HTTPException, Request


@dataclass(frozen=True)
class User:
    sub: str


def _dev_mode() -> bool:
    return os.getenv("FINEPRINT_DEV_AUTH") == "1"


def current_user(request: Request, authorization: str | None = Header(default=None), x_dev_user: str | None = Header(default=None)) -> User:
    if _dev_mode():
        if not x_dev_user:
            raise HTTPException(status_code=401, detail={"error": "unauthenticated"})
        return User(sub=x_dev_user)
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail={"error": "unauthenticated"})
    token = authorization.split(" ", 1)[1]
    try:
        import jwt  # PyJWT
        from jwt import PyJWKClient
        jwks_url = os.environ["FINEPRINT_COGNITO_JWKS_URL"]
        audience = os.environ["FINEPRINT_COGNITO_AUDIENCE"]
        signing_key = PyJWKClient(jwks_url).get_signing_key_from_jwt(token)
        claims = jwt.decode(token, signing_key.key, algorithms=["RS256"], audience=audience)
        return User(sub=claims["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail={"error": "unauthenticated"})
