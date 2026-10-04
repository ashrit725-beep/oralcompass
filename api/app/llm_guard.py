"""Live-AI cost guard (owner decision, design spec addendum §D.2).

Every live model call is preceded by `allow(sub, kind)` and followed by `record(kind, in_tokens, out_tokens)`:

    from . import llm_guard
    ok, reason = llm_guard.allow(user.sub, "reader")          # kinds: extraction | reader | explainer | assistant
    if not ok:
        ... demo/template behaviour, ribbon = templates.LLM_LIMIT_RIBBON ...
    else:
        r = client.post(...)
        llm_guard.record("reader", *llm_guard.usage_tokens(r.json(), fallback_in=len(prompt) // 4, fallback_out=max_tokens))

Limits (all env-configurable; the defaults are the owner's numbers):
- per session and kind: extraction 5 per UTC day (ORALCOMPASS_LLM_LIMIT_EXTRACTION), reader 10 per day (…_READER), explainer 60 per day
  (…_EXPLAINER), assistant 30 per 10-minute window (…_ASSISTANT, ORALCOMPASS_LLM_ASSISTANT_WINDOW_S); any other kind 20 per day (…_DEFAULT);
- global per UTC day: requests (ORALCOMPASS_LLM_DAILY_REQUESTS, default 300) and estimated spend in USD (ORALCOMPASS_LLM_DAILY_USD, default
  2.00), priced per 1k tokens from PRICES_PER_1K for the configured model or ORALCOMPASS_LLM_PRICE_IN_PER_1K / …_OUT_PER_1K.

Counters live in the owner-scoped repository's counter table (SQLite on the volume in production, so a restart does not reset the day),
keyed by the hashed session id, the kind and the UTC day (or window). Day keys roll over at UTC midnight; stale keys are pruned. `allow`
reserves the request atomically (a refused call changes nothing). Spend is an estimate from the provider's reported token usage (or a
conservative fallback), not a bill. No key, prompt or document text is ever stored or logged here.
"""
from __future__ import annotations

import logging
import math
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from . import store

log = logging.getLogger("oralcompass.llm_guard")

KIND_LIMITS: dict[str, tuple[str, int, str]] = {          # kind → (env var, default, period)
    "extraction": ("ORALCOMPASS_LLM_LIMIT_EXTRACTION", 5, "day"),
    "reader": ("ORALCOMPASS_LLM_LIMIT_READER", 10, "day"),
    "explainer": ("ORALCOMPASS_LLM_LIMIT_EXPLAINER", 60, "day"),
    "assistant": ("ORALCOMPASS_LLM_LIMIT_ASSISTANT", 30, "window"),
}
DEFAULT_KIND = ("ORALCOMPASS_LLM_LIMIT_DEFAULT", 20, "day")
DEFAULT_DAILY_REQUESTS = 300
DEFAULT_DAILY_USD = 2.00
DEFAULT_ASSISTANT_WINDOW_S = 600
# USD per 1,000 tokens (input, output). Claude Haiku 4.5: $1 / $5 per million tokens.
PRICES_PER_1K: dict[str, tuple[float, float]] = {
    "anthropic/claude-haiku-4.5": (0.001, 0.005),
}
FALLBACK_PRICE_PER_1K = (0.003, 0.015)                     # an unknown model is priced high rather than free

REASONS = ("session_limit", "daily_requests_cap", "daily_spend_cap")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "").strip() or default)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "").strip() or default)
    except ValueError:
        return default


def usage_tokens(payload: Any, fallback_in: int = 0, fallback_out: int = 0) -> tuple[int, int]:
    """(input, output) tokens from an OpenAI-style response body's `usage`, or the fallbacks when the provider did not report them."""
    try:
        u = payload.get("usage") or {}
        pin, pout = int(u.get("prompt_tokens") or 0), int(u.get("completion_tokens") or 0)
        if pin or pout:
            return pin, pout
    except Exception:
        pass
    return int(fallback_in), int(fallback_out)


class LLMGuard:
    def __init__(self, repo: Any = None, clock: Optional[Callable[[], float]] = None) -> None:
        self._repo = repo
        self._clock = clock or time.time
        self._lock = threading.Lock()
        self._pruned_day: Optional[str] = None

    # ---- configuration ----
    @property
    def repo(self):
        return self._repo if self._repo is not None else store.repo

    def limit_for(self, kind: str) -> tuple[int, str]:
        env, default, period = KIND_LIMITS.get(kind, DEFAULT_KIND)
        return _env_int(env, default), period

    @staticmethod
    def daily_requests() -> int:
        return _env_int("ORALCOMPASS_LLM_DAILY_REQUESTS", DEFAULT_DAILY_REQUESTS)

    @staticmethod
    def daily_usd() -> float:
        return _env_float("ORALCOMPASS_LLM_DAILY_USD", DEFAULT_DAILY_USD)

    @staticmethod
    def prices() -> tuple[float, float]:
        model = os.getenv("ORALCOMPASS_LLM_MODEL") or "anthropic/claude-haiku-4.5"
        pin, pout = PRICES_PER_1K.get(model, FALLBACK_PRICE_PER_1K)
        return _env_float("ORALCOMPASS_LLM_PRICE_IN_PER_1K", pin), _env_float("ORALCOMPASS_LLM_PRICE_OUT_PER_1K", pout)

    # ---- keys ----
    def _day(self) -> str:
        return datetime.fromtimestamp(self._clock(), tz=timezone.utc).strftime("%Y-%m-%d")

    def _window(self) -> str:
        w = max(1, _env_int("ORALCOMPASS_LLM_ASSISTANT_WINDOW_S", DEFAULT_ASSISTANT_WINDOW_S))
        return f"w{int(self._clock() // w)}"

    def _session_key(self, sub: str, kind: str, period: str) -> str:
        return f"llm:s:{sub}:{kind}:{self._window() if period == 'window' else self._day()}"

    def _global_keys(self) -> tuple[str, str]:
        day = self._day()
        return f"llm:g:requests:{day}", f"llm:g:usd_micros:{day}"

    def _maybe_prune(self) -> None:
        day = self._day()
        if self._pruned_day == day:
            return
        self._pruned_day = day
        try:
            self.repo.counters_prune((f":{day}", f":{self._window()}"))
        except Exception as e:          # pruning is housekeeping; never block a request on it
            log.warning("llm guard prune failed type=%s", type(e).__name__)

    # ---- the API ----
    def allow(self, sub: str, kind: str) -> tuple[bool, Optional[str]]:
        """Reserve one live call for this session and kind. (True, None) when allowed; (False, reason) when a limit is reached."""
        with self._lock:
            self._maybe_prune()
            limit, period = self.limit_for(kind)
            skey = self._session_key(sub, kind, period)
            rkey, ukey = self._global_keys()
            cap_micros = int(round(self.daily_usd() * 1_000_000))
            if cap_micros <= 0:
                log.info("llm guard refused kind=%s reason=daily_spend_cap", kind)
                return False, "daily_spend_cap"
            failed =self.repo.counters_check_add({skey: 1, rkey: 1}, {skey: limit, rkey: self.daily_requests(), ukey: max(0, cap_micros - 1)})
        if failed is None:
            return True, None
        reason = "session_limit" if failed == skey else ("daily_requests_cap" if failed == rkey else "daily_spend_cap")
        log.info("llm guard refused kind=%s reason=%s", kind, reason)
        return False, reason

    def record(self, kind: str, est_tokens: int, out_tokens: int = 0) -> int:
        """Add the estimated cost of one completed call (input tokens, output tokens) to today's spend. Returns micro-USD added."""
        pin, pout = self.prices()
        micros = int(math.ceil((max(0, int(est_tokens)) / 1000 * pin + max(0, int(out_tokens)) / 1000 * pout) * 1_000_000))
        if micros:
            _, ukey = self._global_keys()
            try:
                self.repo.counters_check_add({ukey: micros}, {})
            except Exception as e:
                log.warning("llm guard record failed kind=%s type=%s", kind, type(e).__name__)
        return micros

    def status(self) -> dict:
        rkey, ukey = self._global_keys()
        c = self.repo.counters_get([rkey, ukey])
        req_cap, usd_cap = self.daily_requests(), self.daily_usd()
        spent = c[ukey] / 1_000_000
        return {"requests_today": c[rkey], "requests_cap": req_cap, "spend_usd_today": round(spent, 4), "spend_usd_cap": usd_cap,
                "cap_reached": c[rkey] >= req_cap or spent >= usd_cap}

    def cap_reached(self) -> bool:
        try:
            return bool(self.status()["cap_reached"])
        except Exception:
            return False

    def reset(self) -> None:
        """Drop every counter (tests)."""
        with self._lock:
            self.repo.counters_prune(())
            self._pruned_day = None


guard = LLMGuard()
allow = guard.allow
record = guard.record
cap_reached = guard.cap_reached
status = guard.status
