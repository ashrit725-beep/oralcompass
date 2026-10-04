"""Security middleware: CSP and security headers on every response, HSTS over https only, body limits (35 MB uploads, 1 MB elsewhere),
and request logs that carry ids and outcomes only."""
import json
import logging

from fastapi.testclient import TestClient

from app import security
from app.main import app

client = TestClient(app)
U = {"X-Dev-User": "security-user"}
EXPECTED_CSP = {
    "default-src": "'self'", "img-src": "'self' data: blob:", "style-src": "'self' 'unsafe-inline'", "script-src": "'self'",
    "worker-src": "'self' blob:", "frame-ancestors": "'none'", "base-uri": "'self'", "form-action": "'self'",
}


def csp_of(r) -> dict:
    return {d.split(" ", 1)[0]: d.split(" ", 1)[1] for d in (x.strip() for x in r.headers["content-security-policy"].split(";")) if d}


def test_security_headers_on_api_responses_including_errors():
    for r in (client.get("/health"), client.get("/journeys", headers=U), client.get("/journeys"), client.get("/no-such-route")):
        csp = csp_of(r)
        for k, v in EXPECTED_CSP.items():
            assert csp[k] == v, (k, csp.get(k))
        assert csp["connect-src"].startswith("'self'") and "'unsafe-eval'" not in r.headers["content-security-policy"]
        assert "'unsafe-inline'" not in csp["script-src"]
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
        assert r.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=()"
        assert r.headers["x-frame-options"] == "DENY" and len(r.headers["x-request-id"]) == 16
        assert "strict-transport-security" not in r.headers


def test_hsts_only_over_https():
    assert "max-age=31536000" in TestClient(app, base_url="https://testserver").get("/health").headers["strict-transport-security"]
    assert "max-age=" in client.get("/health", headers={"X-Forwarded-Proto": "https"}).headers["strict-transport-security"]


def test_route_headers_are_not_duplicated():
    r = client.get("/health")
    assert r.headers.get_list("x-content-type-options") == ["nosniff"] and len(r.headers.get_list("content-security-policy")) == 1


def test_json_bodies_over_one_megabyte_are_refused_before_reading():
    big = json.dumps({"from": "sample-alex", "pad": "x" * (1024 * 1024)})
    r = client.post("/journeys", content=big, headers={**U, "Content-Type": "application/json"})
    assert r.status_code == 413 and r.json() == {"detail": {"error": "body_too_large", "max_bytes": 1024 * 1024}}
    assert r.headers["x-content-type-options"] == "nosniff"
    ok = client.post("/journeys", json={"from": "empty", "pad": "x" * 1000}, headers=U)
    assert ok.status_code == 201


def test_chunked_bodies_are_counted_as_they_stream():
    def chunks():
        for _ in range(20):
            yield b"x" * (64 * 1024)                                        # 1.25 MB, no Content-Length
    r = client.post("/journeys", content=chunks(), headers={**U, "Content-Type": "application/json"})
    assert r.status_code == 413 and r.json()["detail"]["error"] == "body_too_large"


def test_upload_route_allows_35_megabytes():
    assert security.body_limit("/me/documents/upload") == 35 * 1024 * 1024 == security.body_limit("/api/me/documents/upload")
    assert security.body_limit("/api/me/treatment-plans/read") == 35 * 1024 * 1024        # the treatment-plan reader takes a photo or PDF
    assert security.body_limit("/api/me/treatment-plans/confirm") == 1024 * 1024
    assert security.body_limit("/me/documents/abc/review") == 1024 * 1024
    r = client.post("/me/documents/upload", headers={**U, "Content-Length": str(36 * 1024 * 1024), "Content-Type": "multipart/form-data; boundary=x"}, content=b"")
    assert r.status_code == 413 and r.json()["detail"]["max_bytes"] == 35 * 1024 * 1024
    # a 2 MB multipart body is fine on the upload route (the endpoint itself then rejects the non-PDF)
    r = client.post("/me/documents/upload", files={"file": ("x.pdf", b"not a pdf" + b"0" * (2 * 1024 * 1024), "application/pdf")},
                    data={"sha256": "0" * 64, "pages": "1"}, headers=U)
    assert r.status_code == 415


def test_large_body_paths_are_configurable(monkeypatch):
    monkeypatch.setenv("ORALCOMPASS_LARGE_BODY_PATHS", "/me/reader/photo, /me/other")
    assert security.body_limit("/api/me/reader/photo") == 35 * 1024 * 1024 and security.body_limit("/me/reader/text") == 1024 * 1024


def test_request_logs_carry_ids_and_outcomes_only(caplog):
    caplog.set_level(logging.INFO, logger="oralcompass.http")
    client.get("/journeys?secret_query=Sam%20Rivera", headers={**U, "Cookie": "oc_session=abc.def"})
    lines = [json.loads(r.getMessage()) for r in caplog.records if r.name == "oralcompass.http"]
    assert lines and set(lines[-1]) == {"event", "rid", "method", "path", "status", "ms", "bytes_in"}
    assert lines[-1]["path"] == "/journeys" and lines[-1]["status"] == 200
    text = " ".join(r.getMessage() for r in caplog.records)
    assert "Sam" not in text and "secret_query" not in text and "oc_session" not in text and "security-user" not in text
