"""Owner-scoped repository. Every read goes through `get_owned`, which raises a constant 404 when the resource does not belong
to the caller — the same response as a nonexistent id, so existence is never disclosed (spec §5.6).

InMemoryRepo is the default (tests and local demos). SqliteRepo (store_sqlite.py) has exactly the same interface and is selected by
ORALCOMPASS_STORE=sqlite + ORALCOMPASS_DB_PATH (the single-container deployment keeps the file on a persistent volume). The SAM skeleton's
DynamoDB shape (partition key USER#<sub>, sort key <TYPE>#<id>) is described in infra/template.yaml and not built.

Besides owner-scoped records, both repositories keep small integer counters (the live-AI cost guard, api/app/llm_guard.py): keys carry a
hashed session id, a kind and a UTC day, never content.
"""
from __future__ import annotations

import os
import threading
import time
import uuid
from typing import Any, Optional

from fastapi import HTTPException

NOT_FOUND = {"error": "not_found"}      # constant body — never varies by reason


class InMemoryRepo:
    def __init__(self) -> None:
        self._items: dict[tuple[str, str, str], dict] = {}
        self.audit: list[dict] = []
        self._counters: dict[str, int] = {}
        self._lock = threading.RLock()

    def _log(self, sub: str, action: str, rtype: str, rid: str, outcome: str) -> None:
        # audit events carry ids and outcomes only — never content, names or amounts
        self.audit.append({"ts": time.time(), "sub": sub, "action": action, "type": rtype, "id": rid, "outcome": outcome})

    def put(self, sub: str, rtype: str, item: dict) -> dict:
        rid = item.get("id") or uuid.uuid4().hex
        item = {**item, "id": rid, "owner": sub}
        self._items[(sub, rtype, rid)] = item
        self._log(sub, "create", rtype, rid, "ok")
        return item

    def get_owned(self, sub: str, rtype: str, rid: str) -> dict:
        item = self._items.get((sub, rtype, rid))
        if item is None:
            self._log(sub, "read", rtype, rid, "denied")
            raise HTTPException(status_code=404, detail=NOT_FOUND)
        self._log(sub, "read", rtype, rid, "ok")
        return item

    def delete_owned(self, sub: str, rtype: str, rid: str) -> None:
        """Delete one owned record; a record that is not the caller's gets the same constant 404 as a nonexistent id."""
        if (sub, rtype, rid) not in self._items:
            self._log(sub, "delete", rtype, rid, "denied")
            raise HTTPException(status_code=404, detail=NOT_FOUND)
        del self._items[(sub, rtype, rid)]
        self._log(sub, "delete", rtype, rid, "ok")

    def list_owned(self, sub: str, rtype: str) -> list[dict]:
        return [v for (s, t, _), v in self._items.items() if s == sub and t == rtype]

    def delete_all(self, sub: str) -> dict[str, int]:
        counts: dict[str, int] = {}
        for key in [k for k in self._items if k[0] == sub]:
            counts[key[1]] = counts.get(key[1], 0) + 1
            del self._items[key]
        self._log(sub, "delete_all", "*", "*", "ok")
        return counts

    def audit_for(self, sub: str) -> list[dict]:
        """The caller's own audit events (ids and outcomes only), oldest first."""
        return [e for e in self.audit if e["sub"] == sub]

    # ---- counters (live-AI cost guard) ----
    def counters_get(self, keys: list[str]) -> dict[str, int]:
        with self._lock:
            return {k: self._counters.get(k, 0) for k in keys}

    def counters_check_add(self, adds: dict[str, int], limits: dict[str, int]) -> Optional[str]:
        """Atomically: if any key in `limits` would exceed its limit after `adds`, change nothing and return that key; otherwise apply
        every add and return None."""
        with self._lock:
            for k, lim in limits.items():
                if self._counters.get(k, 0) + adds.get(k, 0) > lim:
                    return k
            for k, n in adds.items():
                self._counters[k] = self._counters.get(k, 0) + n
            return None

    def counters_prune(self, keep_suffixes: tuple[str, ...]) -> int:
        """Drop counters whose key does not end with one of `keep_suffixes` (yesterday's day keys, expired windows)."""
        with self._lock:
            old = [k for k in self._counters if not k.endswith(keep_suffixes)]
            for k in old:
                del self._counters[k]
            return len(old)


def make_repo():
    """ORALCOMPASS_STORE=sqlite → SqliteRepo at ORALCOMPASS_DB_PATH (default api/.data/oralcompass.db); anything else → InMemoryRepo."""
    if (os.getenv("ORALCOMPASS_STORE") or "memory").strip().lower() == "sqlite":
        from pathlib import Path
        from .store_sqlite import SqliteRepo
        path = os.getenv("ORALCOMPASS_DB_PATH") or str(Path(__file__).resolve().parents[1] / ".data" / "oralcompass.db")
        return SqliteRepo(path)
    return InMemoryRepo()


repo = make_repo()
