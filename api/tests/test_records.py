"""Records, journeys, sources and the real-data path: an existing procedure ID → a real plan's cited rules → a traceable calculation.
Also: owner isolation for every new private record type; missing-input explanations when the evidence cannot support an estimate."""
import os
import sys
from pathlib import Path

os.environ["ORALCOMPASS_DEV_AUTH"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.store import NOT_FOUND  # noqa: E402

client = TestClient(app)
A = {"X-Dev-User": "alex-a"}
B = {"X-Dev-User": "other-b"}
S = {"X-Dev-User": "sam-s"}


def test_catalogs_keep_identifiers_and_point_to_sources():
    procs = client.get("/procedures", headers=A).json()["items"]
    assert len(procs) == 16 and all(p["key"] for p in procs)
    crown = next(p for p in procs if p["key"] == "crown")
    assert crown["external_codes"]["primary_code"] == "D2740" and crown["external_codes"]["review_required"] is False
    bw = next(p for p in procs if p["key"] == "bitewing_xrays")
    assert bw["external_codes"]["review_required"] is True and set(bw["external_codes"]["distinct_codes_seen"]) >= {"D0272", "D0274"}
    codes = client.get("/procedures/crown/codes", headers=A).json()
    assert all(c["quote"] and c["document_url"] for c in codes["mapping"]["candidates"])
    bench = client.get("/procedures/exam/benchmarks", headers=A).json()
    row = next(r for r in bench["rows"] if r["code"] == "D0120")
    assert row["rate_cents"] == 2696 and row["payer"].startswith("NC Medicaid") and row["geography"] == "North Carolina" and "not your dentist's fee" in row["not_a_price"]
    absent = client.get("/procedures/crown/benchmarks", headers=A).json()
    assert all(r["status"] == "UNKNOWN" for r in absent["rows"] if r["code"] == "D2740")      # D2740 is absent from the NC Medicaid schedule — no number invented
    sources = client.get("/sources", headers=A).json()["items"]
    assert len(sources) >= 12 and all(s["url"] and s["retrieved_at"] for s in sources)
    ml = next(s for s in sources if s["source_id"] == "ncflex-2026-plan-details")
    assert "ML26" in ml["supports_plan_codes"] and ml["counts"]["facts"] > 50
    ev = client.get("/plans/ML26/evidence", headers=A).json()
    assert ev["documents"][0]["url"].startswith("https://oshr.nc.gov") and ev["clauses"][0]["n"] == 1 and all(c["quote"] for c in ev["clauses"])
    assert any(c["field"] == "deductible applicability to implants" for c in ev["conflicts"])
    report = client.get("/data/report", headers=A).json()
    assert report["ingest"]["procedure_keys_without_code"] == [] and report["ingest"]["validation_errors"] == []


def test_real_data_path_procedure_id_to_cited_rules_to_traceable_calculation():
    j = client.post("/journeys", json={"from": "sample-alex"}, headers=A).json()
    assert j["is_sample"] and j["seeded_records"]["treatment_item"] == 6 and j["journey"]["plan_ref"] == "ML26"
    b = client.get("/me/benefits/ML26", headers=A).json()
    assert b["remaining_deductible_cents"] == 0 and b["remaining_max_cents"] == 126000 and "$1,500.00 (document) − plan paid $240.00" in b["derivation"]["remaining_max"]
    rules = client.get("/plans/ML26/rules?procedure_keys=root_canal_molar,crown", headers=A).json()["rules"]
    rct, crown = rules
    assert rct["category"] == "Type II" and rct["plan_pays_pct"] == 60 and rct["coverage_cite"]["page"] == 25 and rct["coverage_cite"]["doc"] == "ML26"
    assert crown["category"] == "Type III" and crown["plan_pays_pct"] == 50 and "Crowns, including Single Implant Crowns" in crown["category_cite"]["quote"]
    assert rct["allowed_amount"]["status"] == "UNKNOWN"                      # the public document prints no fee schedule
    est = client.post("/me/estimates", json={"plan_code": "ML26"}, headers=A).json()
    assert est["status"] == "estimate" and est["ledger"]["status"] == "estimate"
    # root canal: allowed $980 (USER, pre-treatment estimate), deductible met, plan 60% → plan $588 / Alex $392; crown: allowed $1,020, 50/50 → $510 / $510
    lines = {L["label"]: L for L in est["ledger"]["lines"]}
    rct_line = next(v for k, v in lines.items() if "Root canal" in k); crown_line = next(v for k, v in lines.items() if "Crown" in k)
    assert (rct_line["plan_cents"], rct_line["patient_cents"]) == (58800, 39200) and (crown_line["plan_cents"], crown_line["patient_cents"]) == (51000, 51000)
    assert est["user_estimated_payment_cents"] == 90200 and est["insurer_estimated_payment_cents"] == 109800
    for L in (rct_line, crown_line):      # every rule step is stitched to a page of the cited document
        cited = [s for s in L["steps"] if s["rule"] in ("CO", "D", "M")]
        assert cited and all(s["stitch"] and s["stitch"].startswith("ML26#p") for s in cited)
        assert L["patient_cents"] == sum(s["cents"] for s in L["steps"] if s["owner"] == "patient")       # amounts reconcile
    flags = " ".join(est["ledger"]["flags"])
    assert "waiting period: not found" in flags and "alternate-benefit clause: not found" in flags      # unknown rules are flagged, never assumed
    assert est["sources"]["plan_document"]["url"].startswith("https://oshr.nc.gov") and est["sources"]["evidence_endpoint"] == "/plans/ML26/evidence"
    # the journey links the caller's own records and the latest estimate (ids only)
    jj = client.get(f"/journeys/{j['id']}", headers=A).json()
    assert jj["links"]["latest_estimate"]["id"] == est["id"] and "ti-a-rct-19" in jj["links"]["treatment_items"]
    assert jj["progress"]["stages"][0]["label"] == "4 of 4 checkpoints completed"
    appt = next(c for s in jj["journey"]["stages"] for c in s["checkpoints"] if c["id"] == "appointment-info")
    assert appt["completed_by"] == "dental_team" and appt["date"]["source"] == "dental_team"


def test_missing_inputs_are_explained_not_guessed():
    client.post("/journeys", json={"from": "sample-alex"}, headers=B)
    items = client.get("/me/treatment-items", headers=B).json()
    crown = next(i for i in items if i.get("seed_id") == "ti-a-crown-19")
    client.patch(f"/me/treatment-items/{crown['id']}", json={"allowed_cents": None, "allowed_source": None}, headers=B)
    est = client.post("/me/estimates", json={"plan_code": "ML26", "treatment_item_ids": [crown["id"]]}, headers=B).json()
    assert est["status"] == "unresolved" and est["user_estimated_payment_cents"] is None
    assert any(m["input"].startswith("allowed amount") and "pre-treatment estimate" in m["how"] for m in est["missing_inputs"])
    # excluded procedure under the real plan: night guard → not covered, cited to the exclusions page
    ng = next(i for i in items if i.get("seed_id") == "ti-a-nightguard")
    est2 = client.post("/me/estimates", json={"plan_code": "ML26", "treatment_item_ids": [ng["id"]]}, headers=B).json()
    L = est2["ledger"]["lines"][0]
    assert L["status"] == "not_covered" and L["steps"][0]["stitch"] == "ML26#p26" and L["patient_cents"] == 55000
    # out-of-network under a plan with separate out-of-network limits (FEDVIP Delta Standard): the separate usage figure is required, not assumed
    est3 = client.post("/me/estimates", json={"plan_code": "FD26S", "treatment_item_ids": [crown["id"]], "hypotheticals": {"network": "out", "remaining_deductible_cents": 0, "remaining_max_cents": 150000}}, headers=B).json()
    assert est3["status"] == "unresolved" and "remaining out-of-network deductible" in est3["ledger"]["not_provided"] and "remaining out-of-network annual maximum" in est3["ledger"]["not_provided"]
    # unlimited in-network maximum (FEDVIP MetLife High): no cap and no 'remaining maximum' input required
    est4 = client.post("/me/estimates", json={"plan_code": "FM26H", "treatment_item_ids": [crown["id"]], "hypotheticals": {"network": "in", "remaining_deductible_cents": 0, "remaining_max_cents": 1}}, headers=B).json()
    assert est4["status"] == "unresolved" and any(m["input"].startswith("allowed amount") for m in est4["missing_inputs"])    # still needs the allowed amount


def test_fixture_sample_through_records():
    j = client.post("/journeys", json={"from": "sample-sam"}, headers=S).json()
    b = client.get("/me/benefits/HB26", headers=S).json()
    assert b["remaining_deductible_cents"] == 0 and b["remaining_max_cents"] == 75500
    est = client.post("/me/estimates", json={"plan_code": "HB26"}, headers=S).json()
    assert (est["user_estimated_payment_cents"], est["insurer_estimated_payment_cents"]) == (64000, 56000)
    assert j["progress"]["stages"][0]["label"] == "3 of 3 checkpoints completed"


def test_private_records_are_isolated_with_constant_404():
    j = client.post("/journeys", json={"from": "sample-sam"}, headers=S).json()
    items = client.get("/me/treatment-items", headers=S).json()
    est = client.post("/me/estimates", json={"plan_code": "HB26"}, headers=S).json()
    for path in (f"/journeys/{j['id']}", f"/me/treatment-items/{items[0]['id']}", f"/me/estimates/{est['id']}"):
        if "treatment-items" in path:
            r = client.patch(path, json={"tooth": "1"}, headers=B)
        else:
            r = client.get(path, headers=B)
        assert r.status_code == 404 and r.json() == {"detail": NOT_FOUND}
    assert client.get("/me/benefits/HB26", headers={"X-Dev-User": "nobody"}).status_code == 404
    assert all(e["type"] for e in client.get("/me/audit", headers=B).json())
    r = client.patch(f"/journeys/{j['id']}/checkpoints/recovery-milestone", json={"status": "completed", "completed_by": "dental_team", "date": "2026-11-28", "date_source": "dental_team"}, headers=S).json()
    cp = next(c for s in r["journey"]["stages"] for c in s["checkpoints"] if c["id"] == "recovery-milestone")
    assert cp["completed_by"] == "dental_team" and cp["date"] == {"value": "2026-11-28", "source": "dental_team"}
    r2 = client.patch(f"/journeys/{j['id']}/checkpoints/aftercare", json={"status": "completed"}, headers=S).json()
    assert next(c for s in r2["journey"]["stages"] for c in s["checkpoints"] if c["id"] == "aftercare")["completed_by"] == "user"     # default attribution is the user, never the dental team
    for method in ("put", "patch", "delete"):
        assert getattr(client, method)("/presets/ML26", headers=A).status_code == 405


def test_ledger_lines_carry_record_ids_and_benefits_are_keyed_by_plan_ref():
    h = {"X-Dev-User": "alex-lines"}
    client.post("/journeys", json={"from": "sample-alex"}, headers=h)
    items = {i["id"]: i for i in client.get("/me/treatment-items", headers=h).json()}
    est = client.post("/me/estimates", json={"plan_code": "ML26"}, headers=h).json()
    assert est["plan_ref"] == "ML26" and est["plan_version_label"] == "ML26" and len(est["ledger"]["lines"]) == 2
    for L, tid in zip(est["ledger"]["lines"], est["inputs"]["treatment_item_ids"]):            # lines_from_items keeps the items' order
        assert L["treatment_item_id"] == tid and L["procedure_key"] == items[tid]["procedure_key"]
        assert L["label"].startswith(items[tid].get("procedure_name") or "")
    # an upload reference that does not exist for this owner is a constant 404, on every plan-ref endpoint
    for path in ("/me/benefits/upload:nope", "/me/benefits/upload%3Anope"):
        assert client.get(path, headers=h).status_code == 404 and client.get(path, headers=h).json() == {"detail": NOT_FOUND}
    assert client.put("/me/benefits/upload:nope", json={"deductible_met_cents": 0}, headers=h).status_code == 404
    assert client.post("/me/estimates", json={"plan_code": "upload:nope"}, headers=h).status_code == 404
    assert client.post("/me/estimates", json={"plan_code": "ZZ99"}, headers=h).status_code == 404
    # preset benefits stay keyed by the preset code; listing derives each record against its own plan
    assert [b["plan_code"] for b in client.get("/me/benefits", headers=h).json()] == ["ML26"]
    assert client.get("/me/benefits/ml26", headers=h).json()["plan_code"] == "ML26"
