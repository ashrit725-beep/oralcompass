"""Shared plumbing for the AI features (treatment-plan reader, clause explainer; addendum D.2 and D.5).

* `guard_allow`: every live call first reserves one request with the live-AI cost guard (`api/app/llm_guard.py`: per-visitor limit per
  kind, global daily request and spend caps, counters in the store). The feature kinds map to the guard's kinds: `treatment_reader` →
  `reader`, `explain` → `explainer`. A refusal, or an error inside the guard, means no live call (fail closed on spend): the caller falls back
  to demo behaviour and says so.
* Spend: `call_model` runs `extraction.OpenRouterExtractor._call`, which records each completed call's provider-reported token usage with
  the guard under the same kind, so nothing here records spend a second time.
* `local_rate_limit`: an in-process limiter per (visitor, feature) that applies in every mode (PDF parsing costs CPU even in demo mode).
* `call_model`: one OpenRouter chat completion (json_schema first, json_object fallback, one retry; tests inject
  `extraction._TRANSPORT_OVERRIDE`). The key stays in server env; nothing here logs a message, a quote or a body.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Optional

from fastapi import HTTPException, Request

from . import llm_guard
from .sessions import dev_mode
from .extraction import OpenRouterExtractor, llm_mode, llm_model  # noqa: F401  (re-exported for the feature modules)

_RATE: dict[tuple, deque] = {}
_RATE_LOCK = threading.Lock()
_PRUNE_EVERY = 256                          # calls between sweeps of expired keys (the dict never grows with abandoned sessions)
_calls = 0
CLIENT_FACTOR = 3                           # a network address may make this many times one visitor's allowance (several people share one)


def reset_rate_limits() -> None:            # tests
    with _RATE_LOCK:
        _RATE.clear()


def client_key(request: Optional[Request]) -> Optional[str]:
    """A coarse per-network key for the limiters, beside the per-session key: the right-most X-Forwarded-For entry (the address the
    platform's proxy saw), else the socket peer. A visitor who drops the session cookie keeps the same key (api-correctness-26)."""
    if request is None:
        return None
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        last = xff.split(",")[-1].strip()
        if last:
            return last[:64]
    return request.client.host if request.client else None


def _hit(key: tuple, n: int, window_s: float, now: float) -> None:
    q = _RATE.setdefault(key, deque())
    while q and now - q[0] > window_s:
        q.popleft()
    if len(q) >= n:
        raise HTTPException(status_code=429, detail={"error": "rate_limited"})
    q.append(now)


def _prune(now: float, window_s: float) -> None:
    for k in [k for k, q in _RATE.items() if not q or now - q[-1] > window_s]:
        del _RATE[k]


def local_rate_limit(sub: str, kind: str, n: int, window_s: float, request: Optional[Request] = None) -> None:
    """n calls per window per (visitor, feature); outside dev auth also CLIENT_FACTOR × n per (network address, feature). Expired keys are
    swept, so the limiter's memory follows active visitors, not every session ever seen (security-6)."""
    global _calls
    now = time.monotonic()
    client = client_key(request) if request is not None and not dev_mode() else None
    with _RATE_LOCK:
        _calls += 1
        if _calls % _PRUNE_EVERY == 0:
            _prune(now, window_s)
        if client:
            ck = ("client", client, kind)
            q = _RATE.get(ck)
            if q is not None:
                while q and now - q[0] > window_s:
                    q.popleft()
                if len(q) >= n * CLIENT_FACTOR:
                    raise HTTPException(status_code=429, detail={"error": "rate_limited"})
        _hit((sub, kind), n, window_s, now)
        if client:
            _RATE.setdefault(("client", client, kind), deque()).append(now)


GUARD_KIND = {"treatment_reader": "reader", "explain": "explainer"}


def guard_kind(kind: str) -> str:
    return GUARD_KIND.get(kind, kind)


def guard_allow(sub: str, kind: str) -> tuple[bool, Optional[str]]:
    """(allowed, reason) from llm_guard.allow. An error in the guard → not allowed (fail closed on spend)."""
    try:
        ok, reason = llm_guard.allow(sub, guard_kind(kind))
    except Exception:
        return False, "guard_error"
    return bool(ok), (None if ok else str(reason or "limit"))


def call_model(messages: list[dict], schema_name: str, schema: dict, max_tokens: int, timeout: float, kind: str) -> dict:
    """Raises extraction.ModelUnavailable on any failure (HTTP, timeout, malformed JSON). Spend is recorded under the guard kind."""
    return OpenRouterExtractor(timeout=timeout, spend_kind=guard_kind(kind))._call(messages, schema_name, schema, max_tokens)
