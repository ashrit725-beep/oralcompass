"""Client-side redaction before AI processing (owner request 05:40): the device's confirmed identifiers + the server's own patterns are removed
from everything a model receives; the server's summary is authoritative and carries categories, counts and masked values only.

The live tests run the REAL OpenRouter code path with an httpx.MockTransport that captures every request body: what the transport sees is
exactly what a model would receive. Nothing here reaches the network (conftest refuses any unmocked call)."""
import hashlib
import json
import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402
import pymupdf  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import extraction, uploads  # noqa: E402
from app.main import app  # noqa: E402
from app.redaction import (CATEGORIES, MAX_CLIENT_REDACTION_BYTES, SERVER_PATTERNS, InvalidClientRedaction, mask_value, parse_client_redaction,  # noqa: E402
                           placeholder, redact, redact_detailed, redact_pages, value_key)
from app.store import repo  # noqa: E402

client = TestClient(app)

# ---------------------------------------------------------------- a fictional three-page statement with 12 distinct identifiers
# (Sam Rivera / Jordan Rivera are the project's fictional people; 555-01xx numbers and example.com are reserved for fiction)
IDENTIFIERS = [
    {"category": "name", "value": "Sam Rivera"},
    {"category": "name", "value": "Jordan Rivera"},
    {"category": "address", "value": "4127 Harbor Light Lane, Apt 3"},
    {"category": "address", "value": "Raleigh, NC 27601"},
    {"category": "member_id", "value": "HB26-0042-7731"},
    {"category": "group_number", "value": "55120-A"},
    {"category": "claim_number", "value": "CLM-2026-88812"},
    {"category": "account_number", "value": "4471009922"},
    {"category": "ssn", "value": "123-45-6789"},
    {"category": "dob", "value": "03/14/1988"},
    {"category": "phone", "value": "(919) 555-0142"},
    {"category": "email", "value": "sam.rivera@example.com"},
]
DEDUCTIBLE_QUOTE = "The Deductible is $50 per Covered Person each Calendar Year."
CROWN_QUOTE = "Crowns (D2740) are covered at 50% after a 12-month waiting period."
PAGES = [
    ["Harborview Dental (fictional) member benefits statement",
     "Member: Sam Rivera   Member ID: HB26-0042-7731",
     "Dependent: Jordan   Rivera",
     "4127 Harbor Light Lane, Apt 3",
     "Raleigh, NC 27601",
     "DOB: 03/14/1988   Phone: (919) 555-0142",
     "Email: sam.rivera@example.com",
     "Group No.: 55120-A   Claim #: CLM-2026-88812",
     "Account No.: 4471009922   SSN: 123-45-6789",
     "Member Services: 1-800-555-0199. Plan year January 1, 2026 to December 31, 2026.",
     DEDUCTIBLE_QUOTE,
     "Annual maximum: $1,500 per Covered Person."],
    ["sam rivera  |  ID HB26 0042 7731  |  919.555.0142",                       # different case, spaces for hyphens, dots for the phone
     "Prepared for SAM",
     "RIVERA and JORDAN RIVERA",                                                  # a name split by a line break
     CROWN_QUOTE,
     "Oral examinations (D0120) are covered twice per Calendar Year. Tooth #30."],
    ["SAM RIVERA  hb26-0042-7731  SAM.RIVERA@EXAMPLE.COM",
     "Claim CLM 2026 88812 for account 4471 0099 22 was processed on 03/14/1988 records.",
     "Group dental plan. Policy period 2026. Contact Member Services at 1-800-555-0199."],
]
NEEDED = ["1-800-555-0199", "$50", "$1,500", "50%", "D2740", "D0120", "January 1, 2026", "December 31, 2026", "12-month", "Tooth #30",
          "Group dental plan", "Member Services", "Policy period 2026"]


def make_pdf(pages: list[list[str]]) -> bytes:
    doc = pymupdf.open()
    for lines in pages:
        page = doc.new_page()
        y = 60
        for line in lines:
            page.insert_text((36, y), line, fontsize=9)
            y += 16
    out = doc.tobytes()
    doc.close()
    return out


STATEMENT = make_pdf(PAGES)


def H(sub: str) -> dict:
    return {"X-Dev-User": sub}


def upload(sub: str, data: bytes = STATEMENT, client_redaction=None, raw_field=None):
    form = {"sha256": hashlib.sha256(data).hexdigest(), "pages": str(extraction.page_count(data))}
    if client_redaction is not None:
        form["client_redaction"] = json.dumps(client_redaction)
    if raw_field is not None:
        form["client_redaction"] = raw_field
    return client.post("/me/documents/upload", files={"file": ("statement.pdf", data, "application/pdf")}, data=form, headers=H(sub))


def projection(s: str) -> str:
    return value_key(s)


def assert_absent(text: str, values=IDENTIFIERS, where: str = "") -> None:
    """No identifier survives in `text`: not verbatim, not upper/lower-cased, and not with any spacing or punctuation (the letters-and-digits
    projection of the text does not contain the identifier's letters and digits)."""
    flat = projection(text)
    for it in values:
        v = it["value"] if isinstance(it, dict) else it
        assert v not in text and v.upper() not in text and v.lower() not in text, f"{where}: {v!r} leaked"
        assert value_key(v) not in flat, f"{where}: {v!r} leaked in another spacing"


def live(monkeypatch, handler) -> None:
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key-not-real")
    monkeypatch.setattr(extraction, "_TRANSPORT_OVERRIDE", httpx.MockTransport(handler))


def _reply(payload: dict) -> httpx.Response:
    return httpx.Response(200, json={"id": "gen-test", "choices": [{"message": {"role": "assistant", "content": json.dumps(payload)}}]})


def capturing_model(seen: list[str]):
    """A fake model behind the real transport: records every message it receives and answers with the clause quotes of the statement."""
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.extend(m["content"] for m in body["messages"] if isinstance(m.get("content"), str))
        if body["response_format"]["json_schema"]["name"] == "cited_sentences":
            return _reply({"findings": [{"field": "deductible", "stated": True, "page": 1, "sentence": DEDUCTIBLE_QUOTE}]})
        return _reply({"carrier_as_printed": "Harborview Dental", "notes": [],
                       "deductible_individual": {"value_cents": 5000, "waived_for_classes_as_printed": [], "page": 1, "quote": DEDUCTIBLE_QUOTE},
                       "waiting_periods": {"none_stated": False, "entries": [{"applies_to_as_printed": "crowns", "months": 12}], "page": 2, "quote": CROWN_QUOTE}})
    return handler


# ---------------------------------------------------------------- the engine
def test_placeholders_match_the_web_labels():
    assert CATEGORIES == ("name", "address", "member_id", "group_number", "claim_number", "account_number", "ssn", "dob", "phone", "email")
    assert [placeholder(c) for c in CATEGORIES] == ["[name removed]", "[address removed]", "[member ID removed]", "[group number removed]",
                                                     "[claim number removed]", "[account number removed]", "[SSN removed]", "[date of birth removed]",
                                                     "[phone removed]", "[email removed]"]


def test_every_confirmed_value_is_removed_in_any_case_spacing_or_line_break_on_every_page():
    pages = ["\n".join(p) for p in PAGES]
    out, summary, labels = redact_pages(pages, IDENTIFIERS, [])
    for i, page in enumerate(out):
        assert_absent(page, where=f"page {i + 1}")
    joined = "\n".join(out)
    for keep in NEEDED:
        assert keep in joined, keep                                           # what the AI needs is untouched
    assert summary["total"] == 12 and summary["from_device"] == 12 and summary["from_server_check"] == 0 and summary["device_not_found"] == 0
    assert summary["by_category"] == {"name": 2, "address": 2, "member_id": 1, "group_number": 1, "claim_number": 1, "account_number": 1, "ssn": 1,
                                      "dob": 1, "phone": 1, "email": 1}
    occ = {m["masked"]: m["occurrences"] for m in summary["masked"]}
    assert occ["S•• R•••••"] >= 4 and occ["•••• 7731"] >= 3 and summary["occurrences"] == sum(m["occurrences"] for m in summary["masked"])
    assert "[name removed]" in out[1] and "[member ID removed]" in out[1] and "[phone removed]" in out[1]


def test_the_server_patterns_alone_find_the_same_twelve_and_sweep_every_page():
    """No device input at all (an old client, or a person who unticked everything): the safety net still removes all 12 everywhere."""
    out, summary, labels = redact_pages(["\n".join(p) for p in PAGES], None, None)
    for i, page in enumerate(out):
        assert_absent(page, where=f"page {i + 1}")
    assert summary["total"] == 12 and summary["from_server_check"] == 12 and summary["from_device"] == 0
    assert set(labels) == {"name_line", "address", "member_id", "group_number", "claim_number", "account_number", "ssn", "dob", "phone", "email"}
    joined = "\n".join(out)
    assert all(k in joined for k in NEEDED)


def test_device_and_server_layers_union_without_double_counting():
    partial = [i for i in IDENTIFIERS if i["category"] in ("name", "member_id")]
    out, summary, _ = redact_pages(["\n".join(p) for p in PAGES], partial, [])
    assert summary["total"] == 12 and summary["from_device"] == 3 and summary["from_server_check"] == 9      # distinct, never 15
    for page in out:
        assert_absent(page)


def test_counts_are_distinct_and_occurrences_separate():
    text = "Patient: Sam Rivera\nSAM RIVERA\nsam  rivera\nSam\nRivera"
    out, s = redact_detailed(text, [{"category": "name", "value": "Sam Rivera"}, {"category": "name", "value": "SAM RIVERA"}])
    assert s["total"] == 1 and s["occurrences"] == 4 and s["masked"] == [{"category": "name", "masked": "S•• R•••••", "occurrences": 4}]
    assert_absent(out, ["Sam Rivera"])
    # a value that exists only inside a longer confirmed value is still removed (and counted) with it
    out, s = redact_detailed("Email sam.rivera@example.com today", [{"category": "email", "value": "sam.rivera@example.com"},
                                                                   {"category": "name", "value": "Sam Rivera"}])
    assert out == "Email [email removed] today" and s["total"] == 2


def test_word_boundaries_and_what_the_ai_needs_survive():
    out, s = redact_detailed("Sample text for Samuel. Sam is here. Crown D2740 at 50% after 12 months; deductible $50.",
                             [{"category": "name", "value": "Sam"}])
    assert out == "Sample text for Samuel. [name removed] is here. Crown D2740 at 50% after 12 months; deductible $50." and s["total"] == 1
    prose = ("Group dental plan. Member services: 1-800-555-0199 or (877) 555-0100. Policy period 2026. Effective date 01/01/2026. "
             "Cleanings are covered 2 times per year in place of a periodic exam. 1 per 6 months. Waiting period: 12 months. Tooth #3. "
             "Deductible: $50. Annual maximum: $1,500. The Plan pays 80% for Class II. Plan name: Harborview Dental PPO.")
    assert redact(prose) == (prose, [])


def test_toll_free_numbers_stay_and_personal_numbers_go():
    for toll_free in ("1-800-555-0199", "(888) 555-0100", "877.555.0101", "844 555 0102", "855-555-0103", "866-555-0104", "833-555-0105"):
        assert redact(f"Call {toll_free} for help.")[0] == f"Call {toll_free} for help."
    assert redact("Phone: 919-555-0142 or (336) 555-0177")[0] == "Phone: [phone removed] or [phone removed]"


def test_masks_never_contain_the_value():
    for it in IDENTIFIERS:
        m = mask_value(it["category"], it["value"])
        assert it["value"] not in m and value_key(it["value"]) not in value_key(m) and "•" in m
    assert mask_value("phone", "(919) 555-0142") == "•••• 0142" and mask_value("email", "sam.rivera@example.com") == "••••@example.com"
    assert mask_value("name", "Sam Rivera") == "S•• R•••••" and mask_value("member_id", "1234") == "••••"


def test_typed_terms_count_as_names_unless_they_have_another_shape():
    out, s = redact_detailed("Dr. Okafor wrote to okafor@example.com; Okafor's office", None, ["Okafor", "okafor@example.com"])
    assert "Okafor" not in out and "okafor@" not in out and s["by_category"] == {"name": 1, "email": 1} and s["from_device"] == 2
    assert redact("Smith SMITH smith John", ["Smith"]) == ("[name removed] [name removed] [name removed] John", ["user:Smi…"])


def test_a_confirmed_value_that_is_not_in_the_text_is_reported_not_counted():
    _, s = redact_detailed("Deductible $50.", [{"category": "name", "value": "Pat Example"}])
    assert s["total"] == 0 and s["device_not_found"] == 1 and s["masked"] == []


def test_every_pattern_is_linear_on_200kb_adversarial_input():
    """security-1: 200 KB of input built to make each pattern (and the confirmed-value matcher) work hardest finishes quickly."""
    n = 200_000
    hostile = [
        "Patient: " * (n // 9), "Member ID " * (n // 10), "Member: Aa " * (n // 11), "Dear Aaaa " * (n // 10), "1 A " * (n // 4) + "Street",
        "1 Aaaa " * (n // 7), "Raleigh " * (n // 8), "Aa Aa Aa Aa, " * (n // 13), "(919) " * (n // 6), "919-" * (n // 4), "1-" * (n // 2),
        "a@" * (n // 2), "a." * (n // 2), "a" * n, "DOB " * (n // 4), "date of birth " * (n // 14), "SSN 1" * (n // 5), "123-45-" * (n // 7),
        "Group # 1" * (n // 9), "Claim " * (n // 6), "Account No. " * (n // 12), "id " * (n // 3), "1 " * (n // 2), "A-" * (n // 2),
        "[name removed] " * (n // 15), "Sam Rivera " * (n // 11), "s a m r i v e r " * (n // 16),
    ]
    confirmed = [{"category": "name", "value": "a " * 59 + "b"}, {"category": "name", "value": "Sam Rivera X"},
                 {"category": "member_id", "value": "1-" * 50 + "9"}, {"category": "name", "value": "aa"}]
    for text in hostile:
        assert len(text) >= n - 20
        t = time.perf_counter()
        redact_pages([text], confirmed, ["a a a a a a b", "Sam"])
        elapsed = time.perf_counter() - t
        assert elapsed < 2.0, (text[:20], elapsed)
    for category, pat in SERVER_PATTERNS:                                      # each compiled pattern on its own, too
        for text in hostile:
            t = time.perf_counter()
            for _ in pat.finditer(text):
                pass
            assert time.perf_counter() - t < 0.5, (category, text[:20])


# ---------------------------------------------------------------- client_redaction intake
VALID = {"version": 1, "identifiers": IDENTIFIERS, "extra_terms": ["Okafor"]}
SECRET = "Zyxwvut-Secret-77"


def _bad_payloads() -> list:
    big_value = {"version": 1, "identifiers": [{"category": "name", "value": "Ab" * 60}] * 300, "extra_terms": ["x" * 64] * 20}
    assert len(json.dumps(big_value)) < MAX_CLIENT_REDACTION_BYTES                 # the largest valid shape fits under 64 KB
    return [
        "not json " + SECRET, "[" * 40_000 + "]" * 10, json.dumps([SECRET]), json.dumps({"version": 2, "identifiers": [{"category": "name", "value": SECRET}]}),
        json.dumps({"version": "1", "identifiers": []}), json.dumps({"version": True, "identifiers": []}), json.dumps({"identifiers": []}),
        json.dumps({"version": 1, "identifiers": [{"category": "name", "value": SECRET}] * 301}),
        json.dumps({"version": 1, "identifiers": [], "extra_terms": [SECRET] * 21}),
        json.dumps({"version": 1, "identifiers": [{"category": "nickname", "value": SECRET}]}),
        json.dumps({"version": 1, "identifiers": [{"category": "name", "value": "S"}]}),
        json.dumps({"version": 1, "identifiers": [{"category": "name", "value": SECRET * 8}]}),
        json.dumps({"version": 1, "identifiers": [{"category": "name", "value": 12345}]}),
        json.dumps({"version": 1, "identifiers": [{"category": "name", "value": SECRET + "\x00"}]}),
        json.dumps({"version": 1, "identifiers": [], "extra_terms": [SECRET * 4]}),
        json.dumps({"version": 1, "identifiers": [], "extra_terms": [7]}),
        json.dumps({"version": 1, "identifiers": {"category": "name", "value": SECRET}}),
        json.dumps({"version": 1, "identifiers": [SECRET]}),
        json.dumps({"version": 1, "identifiers": [{"category": "name", "value": SECRET}], "extra_terms": ["y" * 60]}) + " " * MAX_CLIENT_REDACTION_BYTES,
    ]


def test_parse_client_redaction_accepts_the_contract_and_dedupes():
    out = parse_client_redaction(json.dumps({"version": 1, "identifiers": IDENTIFIERS + [{"category": "name", "value": " SAM  RIVERA "}],
                                             "extra_terms": ["Okafor", " Okafor ", ""]}))
    assert out["version"] == 1 and len(out["identifiers"]) == 12 and out["extra_terms"] == ["Okafor"]
    assert parse_client_redaction({"version": 1}) == {"version": 1, "identifiers": [], "extra_terms": []}
    for bad in _bad_payloads():
        with pytest.raises(InvalidClientRedaction):
            parse_client_redaction(bad)


def test_invalid_client_redaction_is_a_constant_422_that_stores_nothing():
    subs = []
    for n, bad in enumerate(_bad_payloads()):
        sub = f"cr-invalid-{n}"                                                # one visitor per payload: the hourly upload limit is not under test
        subs.append(sub)
        r = upload(sub, raw_field=bad)
        assert r.status_code == 422 and r.json() == {"detail": {"error": "invalid_client_redaction"}}, bad[:60]
        assert SECRET not in r.text
    sub = "cr-invalid-shape"
    subs.append(sub)
    # a file part or a repeated field is refused the same way
    form = {"sha256": hashlib.sha256(STATEMENT).hexdigest(), "pages": "3"}
    r = client.post("/me/documents/upload", files=[("file", ("s.pdf", STATEMENT, "application/pdf")), ("client_redaction", ("x.json", SECRET.encode(), "application/json"))],
                    data=form, headers=H(sub))
    assert r.status_code == 422 and r.json() == {"detail": {"error": "invalid_client_redaction"}} and SECRET not in r.text
    r = client.post("/me/documents/upload", files={"file": ("s.pdf", STATEMENT, "application/pdf")},
                    data={**form, "client_redaction": [json.dumps(VALID), json.dumps(VALID)]}, headers=H(sub))
    assert r.status_code == 422 and r.json() == {"detail": {"error": "invalid_client_redaction"}}
    for sub in subs:
        assert repo.list_owned(sub, "document") == [] and not (uploads.data_dir() / sub).exists()


def test_upload_stores_values_privately_and_every_response_is_masked(caplog):
    sub = "cr-private"
    with caplog.at_level(logging.DEBUG):
        r = upload(sub, client_redaction=VALID)
        assert r.status_code == 201
        up = r.json()
        doc_id = up["id"]
        s = up["redaction_summary"]
        assert s == up["redaction_preview"]["summary"]
        assert s["total"] == 12 and s["from_device"] == 12 and s["from_server_check"] == 0 and len(s["masked"]) == 12
        assert set(s) == {"total", "by_category", "occurrences", "from_device", "from_server_check", "device_not_found", "masked"}
        assert all(set(m) == {"category", "masked", "occurrences"} for m in s["masked"])
        assert "[name removed]" in up["redaction_preview"]["text"]
        put = client.put(f"/me/documents/{doc_id}/redaction", json={"extra_terms": ["Harborview"]}, headers=H(sub))
        assert put.status_code == 200 and put.json()["redaction_summary"]["total"] == 13 and "Harborview" not in put.json()["redaction_preview"]["text"]
        listed = client.get("/me/documents", headers=H(sub)).json()
        exported = client.get("/me/export", headers=H(sub)).json()
    bodies = {"upload": r.text, "put": put.text, "list": json.dumps(listed), "export": json.dumps(exported)}
    for where, body in bodies.items():
        for it in IDENTIFIERS:
            assert it["value"] not in body, (where, it["value"])
        assert "Okafor" not in body
        if where != "upload":                                                 # the upload preview predates the typed term
            assert "Harborview" not in body
    record = repo.get_owned(sub, "document", doc_id)
    assert record["extra_terms"] == [] and record["client_redaction"] == {"version": 1, "identifiers": 12, "extra_terms": 1}
    assert record["redaction_summary"]["total"] == 13
    stored = uploads.redaction_path(sub, doc_id)
    assert stored.exists() and (stored.stat().st_mode & 0o777) == 0o600 and stored.parent == uploads.doc_path(sub, doc_id).parent
    saved = json.loads(stored.read_text())
    assert len(saved["identifiers"]) == 12 and saved["client_extra_terms"] == ["Okafor"] and saved["extra_terms"] == ["Harborview"]
    logs = " ".join(rec.getMessage() for rec in caplog.records)
    for it in IDENTIFIERS:
        assert it["value"] not in logs
    assert "Okafor" not in logs and "Harborview" not in logs
    assert client.delete("/me", headers=H(sub)).json()["deleted"]["stored_file"] == 1 and not stored.exists()


def test_live_extraction_model_input_carries_no_identifier_and_clause_quotes_still_verify(monkeypatch):
    seen: list[str] = []
    live(monkeypatch, capturing_model(seen))
    sub = "cr-live"
    up = upload(sub, client_redaction={"version": 1, "identifiers": IDENTIFIERS, "extra_terms": []}).json()
    assert up["mode"] == "live"
    r = client.post(f"/me/documents/{up['id']}/extract", headers=H(sub))
    assert r.status_code == 202
    st = client.get(f"/me/documents/{up['id']}/extraction", headers=H(sub)).json()
    assert st["status"] == "ready" and len(seen) == 4                       # system + user for each of the two calls
    document_message = next(m for m in seen if "<<<PAGE 1>>>" in m)
    assert "<<<PAGE 3>>>" in document_message
    for m in seen:
        assert_absent(m, where="model input")
    for keep in NEEDED:
        assert keep in document_message, keep
    assert document_message.count("[name removed]") >= 5 and "[member ID removed]" in document_message
    # the authoritative summary is on the extraction, the document record and the Documents list
    s = st["redaction_summary"]
    assert s["total"] == 12 and s["from_device"] == 12 and s["by_category"]["name"] == 2
    listed = client.get("/me/documents", headers=H(sub)).json()
    assert listed[0]["redaction_summary"] == s and listed[0]["extraction"]["redaction_summary"] == s
    # quote verification still runs against the PDF text layer: the clause quotes confirm
    fields = {f["field_path"]: f for f in st["fields"]}
    assert fields["deductible_individual"]["confidence"] == "confirmed" and fields["deductible_individual"]["quote_verified"] is True
    assert fields["waiting_months"]["confidence"] == "confirmed" and fields["waiting_months"]["quote"] == CROWN_QUOTE
    body = json.dumps(st)
    for it in IDENTIFIERS:
        assert it["value"] not in body


def test_live_extraction_without_client_redaction_still_removes_every_identifier(monkeypatch):
    seen: list[str] = []
    live(monkeypatch, capturing_model(seen))
    sub = "cr-live-server-only"
    up = upload(sub).json()
    client.post(f"/me/documents/{up['id']}/extract", headers=H(sub))
    st = client.get(f"/me/documents/{up['id']}/extraction", headers=H(sub)).json()
    assert st["status"] == "ready" and seen
    for m in seen:
        assert_absent(m, where="model input (server patterns only)")
    assert st["redaction_summary"]["total"] == 12 and st["redaction_summary"]["from_server_check"] == 12


def test_typed_terms_reach_the_model_removed(monkeypatch):
    seen: list[str] = []
    live(monkeypatch, capturing_model(seen))
    sub = "cr-terms"
    pdf = make_pdf([["Plan sponsor contact: Dr. Okafor at the Okafor Family Practice.", DEDUCTIBLE_QUOTE]])
    up = upload(sub, pdf, client_redaction={"version": 1, "identifiers": [], "extra_terms": ["Okafor"]}).json()
    assert up["redaction_summary"]["total"] == 1 and up["redaction_summary"]["by_category"] == {"name": 1}
    client.put(f"/me/documents/{up['id']}/redaction", json={"extra_terms": ["Family Practice"]}, headers=H(sub))
    client.post(f"/me/documents/{up['id']}/extract", headers=H(sub))
    st = client.get(f"/me/documents/{up['id']}/extraction", headers=H(sub)).json()
    assert st["status"] == "ready"
    for m in seen:
        assert "Okafor" not in m and "Family Practice" not in m
    assert st["redaction_summary"]["total"] == 2


def test_an_unreadable_redaction_file_fails_closed_without_any_model_call(monkeypatch):
    calls: list[str] = []
    live(monkeypatch, lambda request: (calls.append("x"), httpx.Response(500))[1])
    sub = "cr-fail-closed"
    up = upload(sub, client_redaction=VALID).json()
    uploads.redaction_path(sub, up["id"]).write_text("{not json")
    client.post(f"/me/documents/{up['id']}/extract", headers=H(sub))
    st = client.get(f"/me/documents/{up['id']}/extraction", headers=H(sub)).json()
    assert st["status"] == "failed" and calls == []
    r = client.put(f"/me/documents/{up['id']}/redaction", json={"extra_terms": []}, headers=H(sub))
    assert r.status_code == 409 and r.json()["detail"]["error"] == "redaction_unavailable"


def test_demo_mode_reports_the_same_summary_on_every_surface():
    sub = "cr-demo"
    up = upload(sub, client_redaction=VALID).json()
    r = client.post(f"/me/documents/{up['id']}/extract", headers=H(sub))
    assert r.json()["status"] == "demo_no_model"
    st = client.get(f"/me/documents/{up['id']}/extraction", headers=H(sub)).json()
    doc = repo.get_owned(sub, "document", up["id"])
    assert st["redaction_summary"] == doc["redaction_summary"] == up["redaction_summary"]
    assert st["redaction_summary"]["total"] == 12 and st["redaction_summary"]["from_device"] == 12
    assert st["redaction_summary"]["device_not_found"] == 1                    # the typed term 'Okafor' is not in this PDF: reported, not counted


def test_documents_from_before_client_redaction_keep_working():
    """A record without the private file (stored before this feature) reads its typed terms from the record, as before."""
    sub = "cr-legacy"
    up = upload(sub).json()
    rec = repo.get_owned(sub, "document", up["id"])
    rec.pop("redaction_stored")
    rec["extra_terms"] = ["Harborview"]
    repo.put(sub, "document", rec)
    os.unlink(uploads.redaction_path(sub, up["id"]))
    stored = uploads.load_redaction(sub, rec)
    assert stored == {"identifiers": [], "client_extra_terms": [], "extra_terms": ["Harborview"]}
    put = client.put(f"/me/documents/{up['id']}/redaction", json={"extra_terms": ["Harborview"]}, headers=H(sub)).json()
    assert "Harborview" not in put["redaction_preview"]["text"] and repo.get_owned(sub, "document", up["id"])["extra_terms"] == []


# ---------------------------------------------------------------- the treatment-plan reader (text path)
ESTIMATE = ("Northside Dental Group (fictional) estimate\nPatient: Jordan Example   DOB 02/03/1990\nMember ID: NW-55512-09\nPhone 919-555-0100\n"
            "Tooth  Description                      Fee\n30     Porcelain/ceramic crown          $1,200.00\nQuestions? Call 1-888-555-0123.")


def test_reader_applies_the_device_values_before_the_model_and_returns_the_summary(monkeypatch):
    sent: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.extend(m["content"] for m in body["messages"] if isinstance(m.get("content"), str))
        return _reply({"items": [{"line_text": "30     Porcelain/ceramic crown          $1,200.00", "procedure_as_written": "Porcelain/ceramic crown",
                                  "tooth": "30", "surface": "", "quantity": 1, "fee_as_written": "$1,200.00", "fee_in_fee_column": True,
                                  "code_as_written": "", "date_as_written": ""}], "ignored_text": []})

    live(monkeypatch, handler)
    confirmed = {"version": 1, "identifiers": [{"category": "name", "value": "Jordan Example"}, {"category": "member_id", "value": "NW-55512-09"}],
                 "extra_terms": ["Northside"]}
    r = client.post("/me/treatment-plans/read", json={"text": ESTIMATE, "client_redaction": confirmed}, headers=H("cr-reader"))
    assert r.status_code == 200
    j = r.json()
    assert j["mode"] == "live" and j["items"][0]["fee_cents"] == 120000
    for m in sent:
        assert_absent(m, ["Jordan Example", "NW-55512-09", "919-555-0100", "02/03/1990", "Northside"], where="reader model input")
    assert any("1-888-555-0123" in m for m in sent)                          # the practice's toll-free line is not personal
    s = j["redaction"]["summary"]
    assert s["total"] == 5 and s["from_device"] == 3 and s["from_server_check"] == 2 and j["redaction"]["image_not_redacted"] is False
    for v in ("Jordan Example", "NW-55512-09", "919-555-0100", "02/03/1990"):
        assert v not in r.text
    # the same contract also arrives as a multipart field
    r = client.post("/me/treatment-plans/read", files=[("text", (None, ESTIMATE)), ("client_redaction", (None, json.dumps(confirmed)))], headers=H("cr-reader"))
    assert r.status_code == 200 and r.json()["redaction"]["summary"]["total"] == 5


def test_reader_rejects_a_malformed_client_redaction_without_echo():
    for bad in ({"version": 9, "identifiers": [{"category": "name", "value": SECRET}]}, SECRET, [SECRET], 5):
        r = client.post("/me/treatment-plans/read", json={"text": ESTIMATE, "client_redaction": bad}, headers=H("cr-reader-bad"))
        assert r.status_code == 422 and r.json() == {"detail": {"error": "invalid_client_redaction"}} and SECRET not in r.text
    r = client.post("/me/treatment-plans/read", files=[("text", (None, ESTIMATE)), ("client_redaction", (None, "{" + SECRET))], headers=H("cr-reader-bad"))
    assert r.status_code == 422 and r.json() == {"detail": {"error": "invalid_client_redaction"}} and SECRET not in r.text


def test_reader_image_has_no_summary_because_an_image_cannot_be_redacted():
    png = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 8, 8), False).tobytes("png")
    r = client.post("/me/treatment-plans/read", files={"file": ("e.png", png, "image/png")}, headers=H("cr-reader-img"))
    j = r.json()
    assert r.status_code == 200 and j["redaction"]["image_not_redacted"] is True and j["redaction"]["summary"] is None
