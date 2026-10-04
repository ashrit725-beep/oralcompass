"""API edge cases from the finish-pass security sweep: no echoed input in 422 bodies, dev user ids that cannot become paths."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)
A = {"X-Dev-User": "edges-a"}


def test_validation_errors_do_not_echo_submitted_text():
    secret = "Patient Sam Rivera DOB 01/02/1990"
    for path, body in (("/estimates", {"plan_ref": "HB26", "lines": [{"key": secret, "charge_cents": secret}]}),
                       ("/me/assistant", {"message": secret + "a" * 401}),
                       ("/me/push/subscriptions", {"endpoint": "http://" + secret, "keys": {"p256dh": secret[:3], "auth": "x"}})):
        r = client.post(path, json=body, headers=A)
        assert r.status_code == 422
        assert "Sam Rivera" not in r.text and "01/02/1990" not in r.text
        assert all(set(e) == {"type", "loc", "msg"} for e in r.json()["detail"])


def test_assistant_400_is_the_limit_and_401_is_422():
    r = client.post("/me/assistant", json={"message": "a" * 401}, headers=A)
    assert r.status_code == 422 and r.json()["detail"][0]["loc"][-1] == "message"


def test_push_subscription_requires_https():
    r = client.post("/me/push/subscriptions", json={"endpoint": "http://push.example/x", "keys": {"p256dh": "a" * 20, "auth": "b" * 10}}, headers=A)
    assert r.status_code == 422


def test_unsafe_dev_user_ids_are_unauthenticated():
    for bad in ("../../etc", "..", "a/b", "a" * 65, ".hidden", "x y", "-lead"):
        r = client.get("/me/export", headers={"X-Dev-User": bad})
        assert r.status_code == 401 and r.json() == {"detail": {"error": "unauthenticated"}}, bad
    assert client.get("/me/export", headers={"X-Dev-User": "user.a_1-b"}).status_code == 200


def test_repeated_publish_without_changes_returns_the_same_version():
    from pathlib import Path
    import hashlib
    pdf = (Path(__file__).resolve().parents[2] / "fixtures" / "documents" / "harborview_certificate.pdf").read_bytes()
    h = {"X-Dev-User": "edges-publish"}
    up = client.post("/me/documents/upload", files={"file": ("plan.pdf", pdf, "application/pdf")},
                     data={"sha256": hashlib.sha256(pdf).hexdigest(), "pages": "14"}, headers=h).json()
    client.post(f"/me/documents/{up['id']}/extract", headers=h)
    st = client.get(f"/me/documents/{up['id']}/extraction", headers=h).json()
    dec = [{"field_path": f["field_path"], "decision": "confirmed" if f.get("candidates") and f.get("status") != "not_found" else "not_in_document"}
           for f in st["fields"]]
    assert client.put(f"/me/documents/{up['id']}/review", json={"decisions": dec}, headers=h).status_code == 200
    first = client.post(f"/me/documents/{up['id']}/publish", headers=h).json()
    again = client.post(f"/me/documents/{up['id']}/publish", headers=h).json()
    assert first["version_label"] == again["version_label"] == "UP1"
    assert [v["version_label"] for v in client.get(f"/me/plans/{up['id']}/versions", headers=h).json()["items"]] == ["UP1"]
    client.put(f"/me/documents/{up['id']}/review", json={"decisions": [{"field_path": "deductible_individual", "decision": "edited", "value": 7500, "source": "x"}]}, headers=h)
    assert client.post(f"/me/documents/{up['id']}/publish", headers=h).json()["version_label"] == "UP2"


def test_push_endpoint_must_be_a_public_host():
    keys = {"p256dh": "B" * 87, "auth": "a" * 22}
    for url in ("https://localhost/x", "https://169.254.169.254/latest", "https://127.0.0.1/x", "https://[::1]/x", "https://10.0.0.5/x",
                "https://metadata.google.internal/x", "https://router/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x",
                "https://printer.local/x"):
        assert client.post("/me/push/subscriptions", json={"endpoint": url, "keys": keys}, headers=A).status_code == 422, url
    assert client.post("/me/push/subscriptions", json={"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": keys}, headers=A).status_code == 201


def test_rules_ignore_unknown_procedure_keys_and_cap_the_list():
    r = client.get("/plans/HB26/rules?procedure_keys=crown,crown,not_a_procedure", headers=A).json()["rules"]
    assert [x["procedure_key"] for x in r] == ["crown"]
    assert client.get("/plans/HB26/rules?procedure_keys=nope", headers=A).json()["rules"] == []
    assert len(client.get("/plans/HB26/rules", headers=A).json()["rules"]) > 1
    r = client.get("/plans/HB26/rules?procedure_keys=" + ",".join(["x"] * 65), headers=A)
    assert r.status_code == 422 and r.json()["detail"]["error"] == "too_many_procedure_keys"


def test_benefit_and_treatment_amounts_have_an_upper_bound():
    src = {"type": "benefit_statement", "label": "x", "date": "2026-09-15", "entered_by": "user"}
    r = client.put("/me/benefits/HB26", json={"coverage_start": "2025-01-01", "network_default": "in", "deductible_met_cents": 10**20, "source": src}, headers=A)
    assert r.status_code == 422
    r = client.post("/me/treatment-items", json={"label": "Crown", "procedure_key": "crown", "dentist_fee_cents": 10**20}, headers=A)
    assert r.status_code == 422


def test_estimate_line_lists_are_bounded():
    import time
    line = {"key": "crown", "label": "Crown", "tooth": "30", "charge_cents": 120000, "completion": "2026-11-20"}
    t0 = time.time()
    assert client.post("/estimates", json={"plan_ref": "HB26", "lines": [line] * 5000}, headers=A).status_code == 422
    assert time.time() - t0 < 5
    assert client.post("/estimates", json={"plan_ref": "HB26", "lines": [line] * 3}, headers=A).status_code == 201
