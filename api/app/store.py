"""Owner-scoped repository. Every read goes through `get_owned`, which raises a constant 404 when the resource does not belong
to the caller — the same response as a nonexistent id, so existence is never disclosed (spec §5.6).

InMemoryRepo is used for tests and local demos. DynamoRepo is the production shape: partition key USER#<sub>, sort key
<TYPE>#<id>; presets live under PRESET#<id>#v<n> and are read-only through the API.
"""
from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import HTTPException

NOT_FOUND = {"error": "not_found"}      # constant body — never varies by reason


class InMemoryRepo:
    def __init__(self) -> None:
        self._items: dict[tuple[str, str, str], dict] = {}
        self.audit: list[dict] = []

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

    def list_owned(self, sub: str, rtype: str) -> list[dict]:
        return [v for (s, t, _), v in self._items.items() if s == sub and t == rtype]

    def delete_all(self, sub: str) -> dict[str, int]:
        counts: dict[str, int] = {}
        for key in [k for k in self._items if k[0] == sub]:
            counts[key[1]] = counts.get(key[1], 0) + 1
            del self._items[key]
        self._log(sub, "delete_all", "*", "*", "ok")
        return counts


repo = InMemoryRepo()
