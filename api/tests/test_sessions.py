"""Per-visitor sessions (addendum §D.4): signed HttpOnly cookie issued on first contact, owner scoping keyed on it, tamper rejection,
DELETE /me clears it; dev auth and the Cognito path keep working."""
import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import sessions, uploads
from app.main import app
from app.store import NOT_FOUND

SECRET = "test-session-secret-0123456789abcdef0123456789"
HB26_PDF = Path(__file__).resolve().parents[2] / "fixtures" / "documents" / "harborview_certificate.pdf"


@pytest.fixture(autouse=True)
def session_env(monkeypatch):
    monkeypatch.delenv("ORALCOMPASS_DEV_AUTH", raising=False)
    monkeypatch.delenv("ORALCOMPASS_COGNITO_JWKS_URL", raising=False)
    monkeypatch.setenv("ORALCOMPASS_SESSION_SECRET", SECRET)
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "none")
    yield


def set_cookie_headers(r) -> list[str]:
    return [v for k, v in r.headers.multi_items() if k.lower() == "set-cookie"]


def test_first_request_issues_a_signed_httponly_lax_cookie_and_reuses_it():
    c = TestClient(app)
    r = c.get("/journeys")
    assert r.status_code == 200 and r.json() == {"items": []}
    [cookie] = set_cookie_headers(r)
    attrs = [a.strip() for a in cookie.split(";")]
    name, value = attrs[0].split("=", 1)
    assert name == "oc_session" and sessions.verify(value) is not None
    assert {"HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=31536000"} <= set(attrs) and "Secure" not in attrs      # plain http: no Secure
    assert set_cookie_headers(c.get("/journeys")) == []                                                              # an existing session is reused
    sid = sessions.verify(value)
    assert len(sid) >= 43                                                                                              # token_urlsafe(32): 256 bits
    audit = c.get("/me/audit").json()
    assert audit == [] or all(e["sub"] == sessions.session_sub(sid) != sid for e in audit)


def test_secure_flag_on_https_and_behind_a_tls_proxy():
    r = TestClient(app, base_url="https://testserver").get("/journeys")
    assert "Secure" in [a.strip() for a in set_cookie_headers(r)[0].split(";")]
    r = TestClient(app).get("/journeys", headers={"X-Forwarded-Proto": "https"})
    assert "Secure" in [a.strip() for a in set_cookie_headers(r)[0].split(";")]


def test_two_visitors_are_isolated_and_the_dev_header_is_ignored():
    a, b = TestClient(app), TestClient(app)
    j = a.post("/journeys", json={"from": "sample-alex"})
    assert j.status_code == 201
    jid = j.json()["id"]
    est = a.post("/me/estimates", json={"plan_code": "ML26"}).json()
    assert est["user_estimated_payment_cents"] == 90200 and est["insurer_estimated_payment_cents"] == 109800
    assert len(a.get("/journeys").json()["items"]) == 1
    # another visitor (and one claiming the dev user) sees nothing of it, and gets the constant 404
    assert b.get("/journeys").json() == {"items": []} and b.get("/me/estimates").json() == []
    for path in (f"/journeys/{jid}", f"/me/estimates/{est['id']}"):
        r = b.get(path)
        assert r.status_code == 404 and r.json() == {"detail": NOT_FOUND}
    spoof = TestClient(app).get("/journeys", headers={"X-Dev-User": a.get("/me/audit").json()[0]["sub"]})
    assert spoof.json() == {"items": []}


def test_tampered_or_foreign_signed_cookie_starts_a_new_session(monkeypatch):
    a = TestClient(app)
    a.post("/journeys", json={"from": "sample-alex"})
    value = a.cookies.get("oc_session")
    sid, sig = value.split(".")
    for bad in (f"{sid}.{sig[:-2]}AA", f"{sid[:-1]}X.{sig}", sid, "garbage", f"{sid}.{sig}.extra"):
        c = TestClient(app)
        c.cookies.set("oc_session", bad)
        r = c.get("/journeys")
        assert r.json() == {"items": []} and set_cookie_headers(r), bad
    monkeypatch.setenv("ORALCOMPASS_SESSION_SECRET", "a-different-secret-entirely-0123456789")
    c = TestClient(app)
    c.cookies.set("oc_session", value)
    assert c.get("/journeys").json() == {"items": []}


def test_delete_me_clears_data_files_and_the_cookie(monkeypatch, tmp_path):
    monkeypatch.setenv("ORALCOMPASS_DATA_DIR", str(tmp_path))
    a = TestClient(app)
    a.post("/journeys", json={"from": "sample-alex"})
    data = HB26_PDF.read_bytes()
    up = a.post("/me/documents/upload", files={"file": ("plan.pdf", data, "application/pdf")},
                data={"sha256": hashlib.sha256(data).hexdigest(), "pages": "14", "text_preview": ""})
    assert up.status_code == 201
    sub = a.get("/me/audit").json()[0]["sub"]
    stored = uploads.doc_path(sub, up.json()["id"])
    assert stored.exists() and stored.is_relative_to(tmp_path)
    r = a.delete("/me")
    assert r.status_code == 200 and r.json()["deleted"]["journey"] == 1 and r.json()["deleted"]["stored_file"] == 1
    assert not stored.exists() and not (tmp_path / sub).exists()
    [cookie] = set_cookie_headers(r)
    assert cookie.startswith("oc_session=;") and "Max-Age=0" in cookie
    a.cookies.clear()
    r = a.get("/journeys")
    assert r.json() == {"items": []} and set_cookie_headers(r)


def test_dev_auth_keeps_the_header_path_and_sets_no_cookie(monkeypatch):
    monkeypatch.setenv("ORALCOMPASS_DEV_AUTH", "1")
    c = TestClient(app)
    assert c.get("/journeys").status_code == 401
    r = c.get("/journeys", headers={"X-Dev-User": "dev-session-user"})
    assert r.status_code == 200 and set_cookie_headers(r) == []


def test_cognito_mode_is_unchanged_and_needs_a_bearer_token(monkeypatch):
    monkeypatch.setenv("ORALCOMPASS_COGNITO_JWKS_URL", "https://cognito-idp.invalid/jwks.json")
    monkeypatch.setenv("ORALCOMPASS_COGNITO_AUDIENCE", "aud")
    c = TestClient(app)
    r = c.get("/journeys")
    assert r.status_code == 401 and set_cookie_headers(r) == []
    assert c.get("/journeys", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_signing_helpers():
    sid = sessions.new_session_id()
    assert sessions.verify(sessions.sign(sid)) == sid
    assert sessions.verify(None) is None and sessions.verify("") is None and sessions.verify("a.b") is None
    assert sessions.session_sub(sid).startswith("s-") and sid not in sessions.session_sub(sid)
