"""SqliteRepo: the owner-scoped repository on one SQLite file (selected by ORALCOMPASS_STORE=sqlite + ORALCOMPASS_DB_PATH).

Exactly InMemoryRepo's interface and semantics:
- `put(sub, type, item)` upserts and returns the stored item (id assigned when missing, `owner` = sub);
- `get_owned` / `delete_owned` raise the same constant 404 for "not yours" and "does not exist", and audit the denial;
- `list_owned(sub, type)` returns the caller's items in first-insert order (an update keeps the row's position, like a dict);
- `delete_all(sub)` returns per-type counts; `audit` / `audit_for(sub)` carry ids and outcomes only.

Storage: table `items` keyed (sub, type, id) with the record as a JSON payload; table `audit` (append-only, ids only); table `counters` for
the live-AI cost guard. WAL journal mode, one connection guarded by a re-entrant lock (FastAPI runs sync endpoints and background tasks on
a thread pool; a single uvicorn process owns the file). Payloads are the same JSON the API returns: no secrets, no raw session ids
(`sub` is a hash of the session id, see sessions.py).
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException

from .store import NOT_FOUND

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    sub TEXT NOT NULL,
    type TEXT NOT NULL,
    id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    PRIMARY KEY (sub, type, id)
);
CREATE TABLE IF NOT EXISTS audit (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    sub TEXT NOT NULL,
    action TEXT NOT NULL,
    type TEXT NOT NULL,
    id TEXT NOT NULL,
    outcome TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_by_sub ON audit (sub, seq);
CREATE TABLE IF NOT EXISTS counters (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL
);
"""


class SqliteRepo:
    def __init__(self, path: str | Path) -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None, timeout=10)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute("PRAGMA foreign_keys=ON")
        self._db.executescript(SCHEMA)

    # ---- internals ----
    def _log(self, sub: str, action: str, rtype: str, rid: str, outcome: str) -> None:
        # audit events carry ids and outcomes only — never content, names or amounts
        self._db.execute("INSERT INTO audit (ts, sub, action, type, id, outcome) VALUES (?, ?, ?, ?, ?, ?)", (time.time(), sub, action, rtype, rid, outcome))

    @staticmethod
    def _load(payload: str) -> dict:
        return json.loads(payload)

    # ---- the InMemoryRepo interface ----
    def put(self, sub: str, rtype: str, item: dict) -> dict:
        rid = item.get("id") or uuid.uuid4().hex
        item = {**item, "id": rid, "owner": sub}
        payload = json.dumps(item, separators=(",", ":"), default=str)
        now = time.time()
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                # ON CONFLICT DO UPDATE keeps the rowid, so list order stays first-insert order (dict semantics)
                self._db.execute("INSERT INTO items (sub, type, id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
                                 "ON CONFLICT (sub, type, id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
                                 (sub, rtype, rid, payload, now, now))
                self._log(sub, "create", rtype, rid, "ok")
                self._db.execute("COMMIT")
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
        return json.loads(payload)

    def get_owned(self, sub: str, rtype: str, rid: str) -> dict:
        with self._lock:
            row = self._db.execute("SELECT payload FROM items WHERE sub = ? AND type = ? AND id = ?", (sub, rtype, str(rid))).fetchone()
            if row is None:
                self._log(sub, "read", rtype, str(rid), "denied")
                raise HTTPException(status_code=404, detail=NOT_FOUND)
            self._log(sub, "read", rtype, str(rid), "ok")
        return self._load(row[0])

    def delete_owned(self, sub: str, rtype: str, rid: str) -> None:
        """Delete one owned record; a record that is not the caller's gets the same constant 404 as a nonexistent id."""
        with self._lock:
            cur = self._db.execute("DELETE FROM items WHERE sub = ? AND type = ? AND id = ?", (sub, rtype, str(rid)))
            if cur.rowcount == 0:
                self._log(sub, "delete", rtype, str(rid), "denied")
                raise HTTPException(status_code=404, detail=NOT_FOUND)
            self._log(sub, "delete", rtype, str(rid), "ok")

    def list_owned(self, sub: str, rtype: str) -> list[dict]:
        with self._lock:
            rows = self._db.execute("SELECT payload FROM items WHERE sub = ? AND type = ? ORDER BY rowid", (sub, rtype)).fetchall()
        return [self._load(r[0]) for r in rows]

    def find_owned(self, sub: str, rtype: str, rid: str) -> Optional[dict]:
        """Keyed lookup for server-side caches: the record or None, no audit entry (a cache miss is not a denied read)."""
        with self._lock:
            row = self._db.execute("SELECT payload FROM items WHERE sub = ? AND type = ? AND id = ?", (sub, rtype, str(rid))).fetchone()
        return self._load(row[0]) if row else None

    def delete_all(self, sub: str) -> dict[str, int]:
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                rows = self._db.execute("SELECT type, COUNT(*) FROM items WHERE sub = ? GROUP BY type ORDER BY MIN(rowid)", (sub,)).fetchall()
                self._db.execute("DELETE FROM items WHERE sub = ?", (sub,))
                self._log(sub, "delete_all", "*", "*", "ok")
                self._db.execute("COMMIT")
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
        return {t: n for t, n in rows}

    @property
    def audit(self) -> list[dict]:
        """Every audit event, oldest first (same shape as InMemoryRepo.audit). Endpoints use audit_for(sub)."""
        with self._lock:
            rows = self._db.execute("SELECT ts, sub, action, type, id, outcome FROM audit ORDER BY seq").fetchall()
        return [dict(zip(("ts", "sub", "action", "type", "id", "outcome"), r)) for r in rows]

    def audit_for(self, sub: str) -> list[dict]:
        with self._lock:
            rows = self._db.execute("SELECT ts, sub, action, type, id, outcome FROM audit WHERE sub = ? ORDER BY seq", (sub,)).fetchall()
        return [dict(zip(("ts", "sub", "action", "type", "id", "outcome"), r)) for r in rows]

    # ---- counters (live-AI cost guard) ----
    def counters_get(self, keys: list[str]) -> dict[str, int]:
        if not keys:
            return {}
        with self._lock:
            rows = self._db.execute(f"SELECT key, value FROM counters WHERE key IN ({','.join('?' * len(keys))})", keys).fetchall()
        found = dict(rows)
        return {k: int(found.get(k, 0)) for k in keys}

    def counters_check_add(self, adds: dict[str, int], limits: dict[str, int]) -> Optional[str]:
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                current = self.counters_get(sorted(set(adds) | set(limits)))
                for k, lim in limits.items():
                    if current.get(k, 0) + adds.get(k, 0) > lim:
                        self._db.execute("ROLLBACK")
                        return k
                for k, n in adds.items():
                    self._db.execute("INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = value + excluded.value", (k, int(n)))
                self._db.execute("COMMIT")
                return None
            except BaseException:
                try:
                    self._db.execute("ROLLBACK")
                except sqlite3.OperationalError:
                    pass
                raise

    def counters_prune(self, keep_suffixes: tuple[str, ...]) -> int:
        with self._lock:
            keys = [r[0] for r in self._db.execute("SELECT key FROM counters").fetchall()]
            old = [k for k in keys if not k.endswith(keep_suffixes)]
            for k in old:
                self._db.execute("DELETE FROM counters WHERE key = ?", (k,))
        return len(old)

    def close(self) -> None:
        with self._lock:
            self._db.close()
