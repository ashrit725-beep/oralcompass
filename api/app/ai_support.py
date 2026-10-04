"""Shared plumbing for the AI features (treatment-plan reader, clause explainer; addendum D.2 and D.5).

* `guard_allow` / `guard_record`: the per-visitor and global daily limits live in `api/app/llm_guard.py` (production branch:
  `guard.allow(sub, kind)` and `guard.record(kind, est_tokens)`). The module is imported lazily; when it is absent this branch treats
  every call as allowed so it works alone. When it is present and refuses (or raises), the caller falls back to demo behaviour and says so.
* `local_rate_limit`: an in-process limiter per (visitor, feature) that applies in every mode (PDF parsing costs CPU even in demo mode).
* `call_model`: one OpenRouter chat completion through `extraction.OpenRouterExtractor._call` (json_schema first, json_object fallback,
  one retry; tests inject `extraction._TRANSPORT_OVERRIDE`). The key stays in server env; nothing here logs a message, a quote or a body.
"""
from __future__ import annotations

import time
from collections import deque
from typing import Optional

from fastapi import HTTPException

from .extraction import OpenRouterExtractor, llm_mode, llm_model  # noqa: F401  (re-exported for the feature modules)

_RATE: dict[tuple[str, str], deque] = {}


def reset_rate_limits() -> None:            # tests
    _RATE.clear()


def local_rate_limit(sub: str, kind: str, n: int, window_s: float) -> None:
    now = time.monotonic()
    q = _RATE.setdefault((sub, kind), deque())
    while q and now - q[0] > window_s:
        q.popleft()
    if len(q) >= n:
        raise HTTPException(status_code=429, detail={"error": "rate_limited"})
    q.append(now)


def _guard():
    try:
        from . import llm_guard  # type: ignore[attr-defined]
    except ImportError:
        return None
    return getattr(llm_guard, "guard", None)


def guard_allow(sub: str, kind: str) -> tuple[bool, Optional[str]]:
    """(allowed, reason). No guard module → allowed. A refusal or an error in the guard → not allowed (fail closed on spend)."""
    g = _guard()
    if g is None:
        return True, None
    try:
        res = g.allow(sub, kind)
    except Exception:
        return False, "guard_error"
    if isinstance(res, tuple):
        ok = bool(res[0])
        return ok, (None if ok else str(res[1]) if len(res) > 1 else "limit")
    if isinstance(res, dict):
        ok = bool(res.get("allowed", res.get("ok", False)))
        return ok, (None if ok else str(res.get("reason") or "limit"))
    return bool(res), (None if res else "limit")


def guard_record(kind: str, est_tokens: int) -> None:
    g = _guard()
    if g is None:
        return
    try:
        g.record(kind, int(est_tokens))
    except Exception:
        pass


def estimate_tokens(messages: list[dict], images: int = 0, out_chars: int = 0) -> int:
    chars = out_chars
    for m in messages:
        c = m.get("content")
        if isinstance(c, str):
            chars += len(c)
        elif isinstance(c, list):
            chars += sum(len(p.get("text", "")) for p in c if isinstance(p, dict))
    return chars // 4 + images * 1600


def call_model(messages: list[dict], schema_name: str, schema: dict, max_tokens: int, timeout: float) -> dict:
    """Raises extraction.ModelUnavailable on any failure (HTTP, timeout, malformed JSON)."""
    return OpenRouterExtractor(timeout=timeout)._call(messages, schema_name, schema, max_tokens)
