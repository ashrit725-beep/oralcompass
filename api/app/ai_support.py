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

import time
from collections import deque
from typing import Optional

from fastapi import HTTPException

from . import llm_guard
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
