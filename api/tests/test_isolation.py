"""Acceptance check 6 (cross-account), 10 (presets read-only), plus the fixture totals through the API."""
import os
import sys
from pathlib import Path

os.environ["ORALCOMPASS_DEV_AUTH"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.store import NOT_FOUND  # noqa: E402

client = TestClient(app)
A = {"X-Dev-User": "user-a"}
B = {"X-Dev-User": "user-b"}

SAM_LINES = [
    {"key": "crown", "label": "Porcelain/ceramic crown", "tooth": "30", "charge_cents": 120000, "prep": "2026-11-03", "completion": "2026-11-20"},
    {"key": "composite", "label": "Two-surface posterior composite", "tooth": "19", "charge_cents": 30000, "completion": "2026-10-20"},
]
SAM_STATE = {"remaining_deductible": {"value": 5000, "status": "USER"}, "remaining_max": {"value": 80000, "status": "USER"},
             "network": {"value": "in", "status": "USER"}, "enrolled_months": {"value": 30, "status": "USER"}}


def test_cross_account_access_is_denied_with_constant_404():
    doc = client.post("/documents", json={"filename": "plan.pdf", "sha256": "abc", "pages": 10, "text_preview": "Patient: Sam Rivera DOB: 01/02/1990"}, headers=A).json()
    est = client.post("/estimates", json={"plan_ref": "HB26", "lines": SAM_LINES, "state": SAM_STATE}, headers=A).json()
    cmp_ = client.post("/comparisons", json={"plan_refs": ["HB26", "DD24", "ML26"], "lines": SAM_LINES, "states": {"HB26": SAM_STATE}}, headers=A).json()
    for path in (f"/documents/{doc['id']}", f"/estimates/{est['id']}", f"/comparisons/{cmp_['id']}"):
        r = client.get(path, headers=B)
        assert r.status_code == 404 and r.json() == {"detail": NOT_FOUND}
        assert client.get(path, headers=A).status_code == 200
    denied = [e for e in client.get("/me/audit", headers=B).json() if e["outcome"] == "denied"]
    assert len(denied) == 3 and all(set(e) == {"ts", "sub", "action", "type", "id", "outcome"} for e in denied)
    assert "Sam Rivera" not in doc["redaction_preview"]["text"] and "name_line" in doc["redaction_preview"]["removed"]


def test_unauthenticated_is_401():
    assert client.get("/estimates/anything").status_code == 401


def test_fixture_totals_through_api():
    est = client.post("/estimates", json={"plan_ref": "HB26", "lines": SAM_LINES, "state": SAM_STATE}, headers=A).json()
    assert est["ledger"]["patient_total_cents"] == 66500 and est["ledger"]["plan_total_cents"] == 53500
    cmp_ = client.post("/comparisons", json={"plan_refs": ["HB26", "DD24", "ML26"], "lines": SAM_LINES, "states": {"HB26": SAM_STATE}}, headers=A).json()
    res = cmp_["result"]
    assert res["columns"] == ["HB26", "DD24", "ML26"]
    assert res["ledgers"]["DD24"]["status"] == "unresolved" and res["ledgers"]["ML26"]["status"] == "unresolved"
    basic = next(r for r in res["grid"] if r["topic"].startswith("Basic"))
    assert "(you pay 20%)" in basic["differences"] and "(you pay 40%)" in basic["differences"]


def test_presets_are_read_only_and_searchable():
    assert client.get("/presets?q=delta", headers=A).json()["items"][0]["plan_code"] == "DD24"
    items = client.get("/presets", headers=A).json()["items"]
    assert any(i["is_fictional"] for i in items) and all(i["eligibility"] for i in items)
    for method in ("put", "patch", "delete"):
        assert getattr(client, method)("/presets/HB26", headers=A).status_code == 405
    assert client.post("/presets", json={}, headers=A).status_code == 405


def test_delete_me_removes_everything():
    client.post("/estimates", json={"plan_ref": "HB26", "lines": SAM_LINES, "state": SAM_STATE}, headers={"X-Dev-User": "user-c"})
    out = client.delete("/me", headers={"X-Dev-User": "user-c"}).json()
    assert out["deleted"].get("estimate", 0) >= 1
    assert all(v == [] for v in client.get("/me/export", headers={"X-Dev-User": "user-c"}).json().values())
