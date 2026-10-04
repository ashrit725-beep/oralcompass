"""Both repositories honour one contract (constant 404, owner scope, first-insert order, ids-only audit, atomic counters), and the whole
API suite passes on SqliteRepo as well as on InMemoryRepo."""
import os
import subprocess
import sys
import threading
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.store import NOT_FOUND, InMemoryRepo, make_repo
from app.store_sqlite import SqliteRepo

API = Path(__file__).resolve().parents[1]


@pytest.fixture(params=["memory", "sqlite"])
def repo(request, tmp_path):
    r = InMemoryRepo() if request.param == "memory" else SqliteRepo(tmp_path / "t.db")
    yield r
    if isinstance(r, SqliteRepo):
        r.close()


def test_put_get_list_and_constant_404(repo):
    a = repo.put("alice", "document", {"filename": "a.pdf", "nested": {"pages": [1, 2]}})
    assert a["owner"] == "alice" and len(a["id"]) == 32
    assert repo.get_owned("alice", "document", a["id"]) == a
    for sub, rtype, rid in (("bob", "document", a["id"]), ("alice", "estimate", a["id"]), ("alice", "document", "nope")):
        with pytest.raises(HTTPException) as e:
            repo.get_owned(sub, rtype, rid)
        assert e.value.status_code == 404 and e.value.detail == NOT_FOUND
    assert repo.list_owned("bob", "document") == []


def test_update_keeps_first_insert_order_and_explicit_ids(repo):
    first = repo.put("u", "journey", {"n": 1})
    repo.put("u", "journey", {"id": "fixed", "n": 2})
    repo.put("u", "journey", {**first, "n": 10})                 # an update does not move the row
    assert [i["n"] for i in repo.list_owned("u", "journey")] == [10, 2]
    assert repo.get_owned("u", "journey", "fixed")["n"] == 2


def test_delete_owned_and_delete_all(repo):
    d = repo.put("u", "document", {})
    repo.put("u", "estimate", {})
    repo.put("u", "estimate", {})
    other = repo.put("v", "estimate", {})
    with pytest.raises(HTTPException) as e:
        repo.delete_owned("v", "document", d["id"])
    assert e.value.detail == NOT_FOUND
    repo.delete_owned("u", "document", d["id"])
    assert repo.list_owned("u", "document") == []
    assert repo.delete_all("u") == {"estimate": 2}
    assert repo.list_owned("u", "estimate") == [] and repo.get_owned("v", "estimate", other["id"])["id"] == other["id"]


def test_audit_carries_ids_and_outcomes_only(repo):
    d = repo.put("u", "document", {"filename": "Sam Rivera plan.pdf", "amount_cents": 64000})
    with pytest.raises(HTTPException):
        repo.get_owned("x", "document", d["id"])
    mine = repo.audit_for("u")
    assert [e["action"] for e in mine] == ["create"] and all(set(e) == {"ts", "sub", "action", "type", "id", "outcome"} for e in repo.audit)
    assert [e["outcome"] for e in repo.audit_for("x")] == ["denied"]
    assert "Sam" not in repr(repo.audit) and "64000" not in repr(repo.audit)


def test_counters_are_atomic_and_refuse_without_partial_writes(repo):
    assert repo.counters_check_add({"a": 1, "g": 1}, {"a": 2, "g": 10}) is None
    assert repo.counters_check_add({"a": 1, "g": 1}, {"a": 2, "g": 10}) is None
    assert repo.counters_check_add({"a": 1, "g": 1}, {"a": 2, "g": 10}) == "a"
    assert repo.counters_get(["a", "g", "missing"]) == {"a": 2, "g": 2, "missing": 0}
    errors = []

    def hammer():
        try:
            for _ in range(50):
                repo.counters_check_add({"c": 1}, {"c": 120})
        except Exception as e:      # pragma: no cover - surfaced below
            errors.append(e)
    threads = [threading.Thread(target=hammer) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors and repo.counters_get(["c"]) == {"c": 120}
    assert repo.counters_prune(("g",)) == 2 and repo.counters_get(["a", "g"]) == {"a": 0, "g": 2}


def test_sqlite_persists_across_reopen_in_wal_mode(tmp_path):
    path = tmp_path / "p.db"
    r = SqliteRepo(path)
    item = r.put("u", "journey", {"journey": {"stages": []}})
    r.counters_check_add({"k": 3}, {})
    r.close()
    r2 = SqliteRepo(path)
    assert r2.get_owned("u", "journey", item["id"]) == item and r2.counters_get(["k"]) == {"k": 3}
    assert r2._db.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
    r2.close()


def test_make_repo_selects_by_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("ORALCOMPASS_STORE", "sqlite")
    monkeypatch.setenv("ORALCOMPASS_DB_PATH", str(tmp_path / "sel.db"))
    r = make_repo()
    assert isinstance(r, SqliteRepo) and (tmp_path / "sel.db").exists()
    r.close()
    monkeypatch.setenv("ORALCOMPASS_STORE", "memory")
    assert isinstance(make_repo(), InMemoryRepo)


@pytest.mark.skipif(os.environ.get("ORALCOMPASS_STORE") == "sqlite", reason="already running the suite on sqlite")
def test_whole_suite_passes_on_sqlite(tmp_path):
    env = {**os.environ, "ORALCOMPASS_STORE": "sqlite", "ORALCOMPASS_DB_PATH": str(tmp_path / "suite.db"), "ORALCOMPASS_DATA_DIR": str(tmp_path / "data")}
    r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests"], cwd=API, env=env, capture_output=True, text=True, timeout=600)
    tail = "\n".join(r.stdout.strip().splitlines()[-15:])
    assert r.returncode == 0, f"API suite failed on SqliteRepo:\n{tail}\n{r.stderr[-2000:]}"
    assert " passed" in tail
