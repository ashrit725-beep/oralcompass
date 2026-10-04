"""Informational reminders and push subscriptions: deterministic dates from the engine's arithmetic, linted fact statements with a
clause cite, owner-scoped subscriptions, and a dev-only push test that sends the fixed generic payload through a mocked pywebpush."""
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

os.environ["ORALCOMPASS_DEV_AUTH"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tools"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from advice_lint import lint_text  # noqa: E402
from app.main import app  # noqa: E402
from app import notifications  # noqa: E402
from app.store import NOT_FOUND  # noqa: E402
from app.templates import PUSH_TEST_BODY  # noqa: E402
from oralcompass_engine.ledger import months_between  # noqa: E402

client = TestClient(app)
N = {"X-Dev-User": "notif-alex"}
B = {"X-Dev-User": "notif-other"}
SUB = {"endpoint": "https://push.example.test/send/abc123", "keys": {"p256dh": "BPublicKeyMaterial0123456789", "auth": "authsecret16"}, "label": "this browser"}


@pytest.fixture(scope="module")
def alex():
    client.post("/journeys", json={"from": "sample-alex"}, headers=N)
    return client.get("/me/benefits/ML26", headers=N).json()


def test_vapid_public_key_comes_from_env_or_404(monkeypatch):
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "BTestPublicKey")
    assert client.get("/notifications/vapid-public-key").json() == {"public_key": "BTestPublicKey"}
    monkeypatch.delenv("VAPID_PUBLIC_KEY")
    r = client.get("/notifications/vapid-public-key")
    assert r.status_code == 404 and r.json() == {"detail": NOT_FOUND}


def test_subscriptions_are_validated_and_owner_scoped():
    r = client.post("/me/push/subscriptions", json=SUB, headers=N)
    assert r.status_code == 201 and "keys" not in r.json() and r.json()["endpoint"] == SUB["endpoint"]
    sid = r.json()["id"]
    assert client.post("/me/push/subscriptions", json={**SUB, "endpoint": "http://push.example.test/x"}, headers=N).status_code == 422
    assert client.post("/me/push/subscriptions", json={"endpoint": SUB["endpoint"], "keys": {"p256dh": "short", "auth": "x"}}, headers=N).status_code == 422
    assert client.post("/me/push/subscriptions", json=SUB, headers=N).json()["id"] == sid                 # same endpoint -> same record
    items = client.get("/me/push/subscriptions", headers=N).json()["items"]
    assert [i["id"] for i in items] == [sid] and all("keys" not in i for i in items)
    assert client.get("/me/push/subscriptions", headers=B).json()["items"] == []
    r = client.delete(f"/me/push/subscriptions/{sid}", headers=B)
    assert r.status_code == 404 and r.json() == {"detail": NOT_FOUND}
    assert client.delete(f"/me/push/subscriptions/{sid}", headers=N).json() == {"deleted": sid}
    assert client.get("/me/push/subscriptions", headers=N).json()["items"] == []
    assert client.delete(f"/me/push/subscriptions/{sid}", headers=N).status_code == 404


def test_reminders_for_alex_state_facts_with_cites_and_pass_the_linter(alex, monkeypatch):
    assert alex["remaining_max_cents"] == 126000
    r = client.get("/me/reminders?as_of=2026-10-03", headers=N)
    assert r.status_code == 200
    body = r.json()
    items = body["items"]
    assert body["as_of"] == "2026-10-03" and items
    bye = next(i for i in items if i["kind"] == "benefit_year_end")
    assert bye["date"] == "2026-12-31" and bye["plan_code"] == "ML26"
    assert bye["text"] == ("Your plan document states the benefit year ends December 31, 2026. As of your statement dated 2026-09-20, "
                           "$1,260.00 of the $1,500.00 annual maximum had not been used.")
    assert bye["cite"]["doc"] == "ML20c" and bye["cite"]["page"] == 50 and "begins January 1" in bye["cite"]["quote"]
    assert "benefit statement dated 2026-09-20" in bye["source"]
    # calendar-count clocks from the 2026-03-02 claims (exam, cleaning, bitewings): count used this benefit year and the reset date
    counts = {i["procedure_key"]: i for i in items if i["kind"] == "frequency_count_reset"}
    assert set(counts) == {"exam", "cleaning", "bitewing_xrays"}
    assert counts["exam"]["text"] == "Your plan document limits Periodic oral evaluation to 2 per calendar year. Your records list 1 in the current benefit year; the count resets on 2027-01-01."
    assert counts["exam"]["date"] == "2027-01-01" and counts["exam"]["cite"] == {"doc": "ML26", "page": 25, "quote": "Oral Examination (two per calendar year)"}
    assert counts["bitewing_xrays"]["text"].startswith("Your plan document limits Bitewing x-rays (set) to 1 per calendar year.")
    for i in items:
        assert lint_text(i["text"]) == [], i["text"]
        assert "—" not in i["text"] and set(i) >= {"kind", "date", "text", "cite", "source"}
    assert [i["date"] for i in items if i["date"]] == sorted(i["date"] for i in items if i["date"])
    # no reminders for a user with no records; a bad date is a 422, not a guess
    assert client.get("/me/reminders", headers={"X-Dev-User": "notif-nobody"}).json()["items"] == []
    assert client.get("/me/reminders?as_of=yesterday", headers=N).status_code == 422
    # a document awaiting a decision is listed by id only; a legacy record nothing was extracted from is not "awaiting decisions"
    client.post("/documents", json={"filename": "plan.pdf", "sha256": "nomatch", "pages": 3, "text_preview": ""}, headers=N)
    import test_uploads as tu
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "none")
    doc = tu.upload(N, tu.make_pdf(["Section 4. The deductible is $25 per covered person."])).json()
    client.post(f"/me/documents/{doc['id']}/extract", headers=N)
    waiting = [i for i in client.get("/me/reminders?as_of=2026-10-03", headers=N).json()["items"] if i["kind"] == "document_awaiting_decision"]
    assert len(waiting) == 1 and waiting[0]["document_id"] == doc["id"] and waiting[0]["date"] is None and lint_text(waiting[0]["text"]) == []


def test_interval_reminders_use_the_engine_arithmetic():
    # SM26 (fictional): cleaning every 6 months; the next covered date is computed exactly as ledger._frequency_ok does
    b = {"plan_code": "SM26", "claims": [{"date": "2026-06-15", "procedure_key": "cleaning", "plan_paid_cents": 0, "source": "statement"},
                                        {"date": "2026-01-31", "procedure_key": "exam", "plan_paid_cents": 0, "source": "statement"}],
         "source": {"date": "2026-09-01"}, "benefits_used_cents": 0, "deductible_met_cents": 0}
    items = notifications.reminders_for_plan("SM26", b, date(2026, 10, 3))
    nxt = {i["procedure_key"]: i for i in items if i["kind"] == "frequency_next_eligible"}
    assert nxt["cleaning"]["date"] == "2026-12-15" and months_between(date(2026, 6, 15), date(2026, 12, 15)) == 6
    assert nxt["cleaning"]["text"] == "Your plan document limits Adult cleaning (prophylaxis) to one every 6 months. Your records list a service on 2026-06-15; the first date that satisfies the interval is 2026-12-15."
    assert "exam" not in nxt                                            # 2026-01-31 + 6 months = 2026-07-28 is in the past as of 2026-10-03
    assert notifications.next_covered_date(date(2026, 1, 31), 6) == date(2026, 7, 28)   # day clamped to 28, as the engine does
    assert notifications.next_covered_date(date(2026, 11, 20), 84) == date(2033, 11, 20)
    for i in items:
        assert lint_text(i["text"]) == []
    # TW26 (fictional) starts its benefit year in July: the end date and the period word follow the document
    items = notifications.reminders_for_plan("TW26", {"plan_code": "TW26", "claims": [{"date": "2026-08-10", "procedure_key": "exam", "plan_paid_cents": 0, "source": "s"}],
                                                      "source": {"date": "2026-09-01"}, "benefits_used_cents": 0, "deductible_met_cents": 0}, date(2026, 10, 3))
    bye = next(i for i in items if i["kind"] == "benefit_year_end")
    assert bye["date"] == "2027-06-30" and "June 30, 2027" in bye["text"]
    assert next(i for i in items if i["kind"] == "frequency_count_reset")["text"].endswith("per benefit year. Your records list 1 in the current benefit year; the count resets on 2027-07-01.")


def test_push_test_sends_the_fixed_generic_payload_through_mocked_webpush(monkeypatch):
    calls = []

    def fake_webpush(**kw):
        calls.append(kw)
    monkeypatch.setattr(notifications, "webpush", fake_webpush)
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "test-private-key-value")
    monkeypatch.setenv("VAPID_SUBJECT", "mailto:test@example.test")
    H = {"X-Dev-User": "notif-push"}
    client.post("/me/push/subscriptions", json=SUB, headers=H)
    r = client.post("/me/push/test", headers=H)
    assert r.status_code == 200 and r.json()["sent"] == 1 and r.json()["failed"] == 0
    assert len(calls) == 1
    payload = json.loads(calls[0]["data"])
    assert payload == {"title": "OralCompass", "body": PUSH_TEST_BODY} == notifications.PUSH_TEST_PAYLOAD
    assert PUSH_TEST_BODY == "A date you chose to follow is approaching. Open the app for details."
    assert not re.search(r"\d", calls[0]["data"]) and lint_text(PUSH_TEST_BODY) == []       # never content, never an amount or a date in the push body
    assert calls[0]["subscription_info"]["endpoint"] == SUB["endpoint"] and calls[0]["vapid_private_key"] == "test-private-key-value"
    assert calls[0]["vapid_claims"] == {"sub": "mailto:test@example.test"}
    # a failing endpoint is counted, not raised
    def failing(**kw):
        raise notifications.WebPushException("gone")
    monkeypatch.setattr(notifications, "webpush", failing)
    assert client.post("/me/push/test", headers=H).json() == {"sent": 0, "failed": 1, "payload": notifications.PUSH_TEST_PAYLOAD}
    # unset keys -> an honest 503; outside dev auth the route does not exist
    monkeypatch.delenv("VAPID_PRIVATE_KEY")
    assert client.post("/me/push/test", headers=H).status_code == 503
    monkeypatch.setattr(notifications, "_dev_mode", lambda: False)
    assert client.post("/me/push/test", headers=H).status_code == 404


def test_reminders_cover_uploaded_plans_and_only_documents_really_awaiting_decisions(monkeypatch):
    """api-correctness-3 (benefits on an upload ref get reminders) and api-correctness-27 (an un-extracted upload is not 'awaiting decisions')."""
    from urllib.parse import quote
    import test_uploads as tu
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "none")          # demo mode: no model call from a test
    sub = "rem-upload"
    h = {"X-Dev-User": sub}
    doc_id, _ = tu.hb26_published(sub)
    ref = f"upload:{doc_id}"
    assert client.put(f"/me/benefits/{quote(ref, safe='')}", json=tu.SAM_BENEFITS, headers=h).status_code == 200
    items = client.get("/me/reminders?as_of=2026-10-03", headers=h).json()["items"]
    assert any(i["kind"] == "benefit_year_end" and i["plan_code"] == ref for i in items)
    assert not any(i["kind"] == "document_awaiting_decision" for i in items)                     # published: nothing awaits
    h2 = {"X-Dev-User": "rem-unextracted"}
    up = tu.upload(h2, tu.HB26_PDF.read_bytes(), name="harborview_certificate.pdf").json()
    assert not any(i["kind"] == "document_awaiting_decision" for i in client.get("/me/reminders", headers=h2).json()["items"])
    client.post(f"/me/documents/{up['id']}/extract", headers=h2)
    assert any(i["kind"] == "document_awaiting_decision" for i in client.get("/me/reminders", headers=h2).json()["items"])
    assert client.get("/me/documents", headers=h2).json()[0]["fields_needing_confirmation"]
