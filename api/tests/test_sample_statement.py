"""The FICTIONAL sample member benefits statement (tools/make_sample_statement.py), the document behind "Try a fictional sample statement".

Covers: the committed PDF exists, is labeled fictional, and its SHA-256 is the one the demo extraction fixture is keyed by; the PDF's
text layer carries each of the 12 invented personal identifiers; removing the 12 confirmed values takes every occurrence out of the
text the model would receive while everything the AI needs stays (plan clauses, CDT codes, amounts, plan dates, the carrier's toll-free
number) and every cited clause still verifies; the statement's claim arithmetic equals the engine's on the same rules; and demo mode
runs the whole flow with no key (upload → extraction with every quote verified against the PDF text layer → review → publish UP1)."""
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "engine"))

import make_sample_statement as sample  # noqa: E402
from app import extraction, redaction  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)
PDF = sample.PDF_PATH
FIXTURE = json.loads(sample.FIXTURE_PATH.read_text())
SHA = FIXTURE["source_document"]["sha256"]
VALUES = [i["value"] for i in sample.IDENTIFIERS]
CONFIRMED = [{"category": i["category"], "value": i["value"]} for i in sample.IDENTIFIERS]


@pytest.fixture(autouse=True)
def demo_mode(monkeypatch):
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "none")
    yield


def pages_text() -> list[str]:
    d = pymupdf.open(str(PDF))
    try:
        return [d[i].get_text() for i in range(d.page_count)]
    finally:
        d.close()


def flat(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().casefold()


def remaining(texts: list[str], values: list[str]) -> list[str]:
    """Values still present anywhere, ignoring case and however the words are spaced or broken across lines."""
    joined = flat(" ".join(texts))
    return [v for v in values if flat(v) in joined]


def remove_confirmed(text: str, values: list[str]) -> str:
    """Only the confirmed values (no server patterns): what the person confirmed on the device, nothing else."""
    for v in values:
        text = re.compile(r"\s+".join(re.escape(w) for w in v.split()), re.I).sub("[removed]", text)
    return text


# ---------------------------------------------------------------- the file
def test_sample_pdf_is_committed_fictional_and_keyed_by_its_sha256():
    assert PDF.is_file() and PDF.name == "tw26_fictional_sample_statement.pdf" and "fictional" in PDF.name
    assert hashlib.sha256(PDF.read_bytes()).hexdigest() == SHA
    d = pymupdf.open(str(PDF))
    meta, n = d.metadata, d.page_count
    d.close()
    assert "FICTIONAL SAMPLE" in meta["title"] and "fictional" in meta["author"] and n == FIXTURE["source_document"]["pages"] == 4
    texts = pages_text()
    assert all("FICTIONAL SAMPLE" in t and "Fictional sample statement" in t for t in texts)          # a ribbon and a footer on every page
    assert flat("This is a fictional sample statement made for the OralCompass demo.") in flat(texts[-1])
    assert FIXTURE["is_fictional"] is True and FIXTURE["source_document"]["path"] == f"fixtures/documents/{PDF.name}"
    fx = extraction.FixtureExtractor()
    assert fx.extract(SHA) is not None and "_about" not in fx.extract(SHA)
    assert all(j["plan_code"] != "TW26" or j["source_document"]["sha256"] != SHA for j in fx.by_code.values())   # never a preset


def test_the_sample_carries_exactly_the_twelve_identifiers():
    assert len(sample.IDENTIFIERS) == 12 and len({flat(v) for v in VALUES}) == 12
    cats = {}
    for i in sample.IDENTIFIERS:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    assert cats == {"name": 2, "address": 2, "member_id": 1, "group_number": 1, "dob": 1, "ssn": 1, "phone": 1, "email": 1,
                    "claim_number": 1, "account_number": 1}
    texts = pages_text()
    joined = flat(" ".join(texts))
    for v in VALUES:
        assert flat(v) in joined, v
    # the header repeats the member's name, member ID and group number on every page
    for t in texts:
        for v in (sample.MEMBER, sample.MEMBER_ID, sample.GROUP):
            assert flat(v) in flat(t)
    # the builder's own audit: nothing else on the page has the shape of an identifier, and the text the AI needs is all there
    assert sample.audit(texts, "pymupdf") == []


# ---------------------------------------------------------------- redaction
def test_server_redaction_with_the_twelve_confirmed_values_removes_every_occurrence():
    texts = pages_text()
    assert len(remaining(texts, VALUES)) == 12
    redacted = [redaction.redact(t, VALUES)[0] for t in texts]          # the existing extra-terms path (the PUT /redaction flow)
    assert remaining(redacted, VALUES) == []
    broken = [v for v in VALUES if " " in v and re.search(r"\s*\n\s*".join(map(re.escape, v.split(" ", 1))), "\n".join(texts))]
    assert broken                                                    # at least one value is broken across lines, and it is removed too
    assert flat(sample.PLAN_NAME) in flat(" ".join(redacted)) and "d2392" in flat(" ".join(redacted))


def test_removing_the_confirmed_values_keeps_everything_the_ai_needs():
    texts = pages_text()
    redacted = [remove_confirmed(t, VALUES) for t in texts]
    assert remaining(redacted, VALUES) == []
    joined = flat(" ".join(redacted))
    for keep in sample.MUST_KEEP:
        assert flat(keep) in joined, keep
    # every clause the demo extraction cites still verifies against the redacted text: quotes carry no identifiers
    pages_n = [extraction.normalize(t) for t in redacted]
    fields, _structure = extraction.fields_from_plan_dict({k: v for k, v in FIXTURE.items() if not k.startswith("_")})
    quoted = [f for f in fields if f["quote"]]
    assert quoted and all(extraction.verify_quote(f["quote"], f["page"], pages_n)["result"] == "confirmed" for f in quoted)


@pytest.mark.skipif(not hasattr(redaction, "redact_detailed"), reason="redact_detailed arrives with the client-redaction API branch")
def test_redact_detailed_counts_the_same_twelve():
    """When the device confirms the 12, the server removes them all, adds nothing the AI needs, and counts 12 (the UI's number)."""
    text = "\n".join(pages_text())
    out, summary = redaction.redact_detailed(text, CONFIRMED, [])
    assert remaining([out], VALUES) == []
    for keep in sample.MUST_KEEP:
        assert flat(keep) in flat(out), keep
    assert summary["total"] == 12 and summary["from_device"] == 12 and summary["from_server_check"] == 0
    assert summary["by_category"] == {"name": 2, "address": 2, "member_id": 1, "group_number": 1, "dob": 1, "ssn": 1, "phone": 1,
                                      "email": 1, "claim_number": 1, "account_number": 1}
    assert not any(v in json.dumps(summary) for v in VALUES)                     # categories, counts and masked values only


# ---------------------------------------------------------------- the numbers
def test_statement_claim_equals_the_engine_on_the_same_rules():
    from oralcompass_engine import Evidence, MemberState, V, compute_ledger
    from oralcompass_engine.loader import load_plan
    from oralcompass_engine.models import EstimateLine

    rows, tot = sample.claim_rows(sample.load_inputs())
    assert (tot["charge"], tot["allowed"], tot["plan"], tot["you"], tot["deductible"]) == (57500, 42000, 33800, 8200, 5000)
    for path in (sample.FIXTURE_PATH, ROOT / "fixtures" / "plans" / "tw26.json"):          # the extraction fixture loads like a plan
        plan = load_plan(path)
        lines = [EstimateLine(r["key"], r["service"], r["tooth"], r["charge"], completion=date(2026, 8, 12)) for r in rows]
        state = MemberState(V(5000, Evidence.USER), V(150000, Evidence.USER), V("in", Evidence.USER), V(1, Evidence.USER))
        ledger = compute_ledger(plan, lines, state)
        assert (ledger.patient_total_cents, ledger.plan_total_cents) == (tot["you"], tot["plan"]), path.name
        assert [(l.patient_cents, l.plan_cents) for l in ledger.lines] == [(r["you"], r["plan"]) for r in rows]


# ---------------------------------------------------------------- demo mode, end to end
def test_demo_extraction_verifies_every_quote_against_the_sample_pdf():
    statuses = []
    st = extraction.run_extraction(PDF, SHA, [], statuses.append, mode="demo")
    assert st["status"] == "ready" and st["demo_fixture_match"] is True and st["pages"] == 4
    assert st["quotes_total"] > 0 and st["quotes_verified"] == st["quotes_total"]
    quoted = [f for f in st["fields"] if f["quote"]]
    assert quoted and all(f["confidence"] == "confirmed" and f["evidence_status"] == "DOC" and f["quote_verified"] for f in quoted)
    assert st["counts"]["likely"] == 0 and st["counts"]["needs_review"] == 0
    assert st["counts"]["not_found"] == sum(1 for f in st["fields"] if not f["quote"])
    for f in st["fields"]:
        if f["required"]:
            assert f["confidence"] == "confirmed", f["field_path"]
    by = {f["field_path"]: f for f in st["fields"]}
    assert by["benefit_year_start_month"]["proposed_value"] == 7 and by["deductible_individual"]["proposed_value"] == 5000
    assert by["deductible_family"]["proposed_value"] == 15000 and by["annual_max"]["proposed_value"] == 150000
    assert [by[f"classes[{i}].plan_share_bp_in"]["proposed_value"] for i in range(3)] == [10000, 8000, 5000]
    assert by["waiting_months"]["proposed_value"] == {"Class III": 12} and by["excluded.implant"]["proposed_value"] is True
    assert {p.split(".", 1)[1] for p in by if p.startswith("allowed_amounts.")} == {"exam", "cleaning", "bitewing_xrays", "composite"}
    assert not any(p.startswith("premium_monthly.") for p in by)                        # a statement prints no premiums
    assert all(f["page"] in (3, 4) for f in quoted)                                     # the plan rules are printed on pages 3 and 4
    assert st["structure"]["ignored_wording"] == [] and st["structure"]["unmatched_wording"] == []
    # no identifier is ever part of a field, a quote or the structure
    blob = flat(json.dumps({"fields": st["fields"], "structure": st["structure"]}))
    assert not [v for v in VALUES if flat(v) in blob]


def test_sample_upload_review_and_publish_in_demo_mode():
    h = {"X-Dev-User": "sample-statement-owner"}
    data = PDF.read_bytes()
    up = client.post("/me/documents/upload", files={"file": (PDF.name, data, "application/pdf")},
                     data={"sha256": SHA, "pages": "4", "text_preview": ""}, headers=h)
    assert up.status_code == 201, up.text
    up = up.json()
    assert up["sha256"] == SHA and up["pages"] == 4 and up["demo_fixture_match"] is True and up["mode"] == "demo"
    r = client.post(f"/me/documents/{up['id']}/extract", headers=h)
    assert r.status_code == 202 and r.json()["status"] == "ready"
    st = client.get(f"/me/documents/{up['id']}/extraction", headers=h).json()
    assert st["status"] == "ready" and st["quotes_verified"] == st["quotes_total"] > 0
    decisions = [{"field_path": f["field_path"], "decision": "confirmed" if f["confidence"] == "confirmed" else "not_in_document"}
                 for f in st["fields"]]
    rev = client.put(f"/me/documents/{up['id']}/review", json={"decisions": decisions}, headers=h)
    assert rev.status_code == 200 and rev.json()["undecided_required"] == []
    pub = client.post(f"/me/documents/{up['id']}/publish", headers=h)
    assert pub.status_code == 201, pub.text
    pub = pub.json()
    assert pub["version_label"] == "UP1" and pub["sha256"] == SHA and pub["summary"]["is_fictional"] is True
    rules = client.get(f"/me/plans/{up['id']}/rules", headers=h)
    assert rules.status_code == 200 and rules.json()["version_label"] == "UP1"
    assert not [v for v in VALUES if flat(v) in flat(json.dumps(pub))]


def test_production_server_serves_the_sample_where_the_upload_step_fetches_it(tmp_path, monkeypatch):
    from app import server
    (tmp_path / "index.html").write_text("<!doctype html><title>OralCompass</title><div id=root></div>")
    monkeypatch.setattr(server, "WEB_DIST", tmp_path.resolve())
    r = TestClient(server.app).get(f"/fixtures/documents/{PDF.name}")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and hashlib.sha256(r.content).hexdigest() == SHA
