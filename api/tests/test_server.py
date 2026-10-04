"""Single production server: API under /api, web/dist at / with SPA fallback and cache headers, public fixtures, production config checks."""
import pytest
from fastapi.testclient import TestClient

from app import server


@pytest.fixture
def dist(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>OralCompass</title><div id=root></div>")
    (tmp_path / "assets" / "index-AbC123.js").write_text("console.log(1)")
    (tmp_path / "sw.js").write_text("self.addEventListener('push', () => {})")
    (tmp_path / "manifest.webmanifest").write_text("{}")
    (tmp_path / "art").mkdir()
    (tmp_path / "art" / "emblem.png").write_bytes(b"\x89PNG\r\n")
    monkeypatch.setattr(server, "WEB_DIST", tmp_path.resolve())
    return tmp_path


def test_api_is_mounted_under_api_with_the_health_check(dist):
    c = TestClient(server.app)
    r = c.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True and "llm_cap_reached" in r.json()
    assert r.headers.get_list("content-security-policy").__len__() == 1 and r.headers["x-content-type-options"] == "nosniff"
    assert c.get("/api/journeys", headers={"X-Dev-User": "server-user"}).json() == {"items": []}


def test_index_assets_and_spa_fallback_with_cache_headers(dist):
    c = TestClient(server.app)
    for path in ("/", "/index.html", "/plan/ML26", "/documents"):
        r = c.get(path)
        assert r.status_code == 200 and "<div id=root>" in r.text and r.headers["cache-control"] == "no-cache", path
        assert "default-src 'self'" in r.headers["content-security-policy"] and r.headers["x-frame-options"] == "DENY"
    r = c.get("/assets/index-AbC123.js")
    assert r.status_code == 200 and r.headers["cache-control"] == "public, max-age=31536000, immutable" and "javascript" in r.headers["content-type"]
    assert c.get("/sw.js").headers["cache-control"] == "no-cache"
    assert c.get("/manifest.webmanifest").headers["content-type"].startswith("application/manifest+json")
    assert c.get("/art/emblem.png").headers["cache-control"] == "public, max-age=86400"
    assert c.head("/").status_code == 200


def test_missing_files_and_traversal_are_404_not_the_shell(dist):
    c = TestClient(server.app)
    for path in ("/assets/missing.js", "/missing.png", "/art/none.webp", "/..%2f..%2fetc/passwd", "/fixtures/plans/..%2f..%2fapi%2f.env",
                 "/fixtures/plans/nope.json", "/fixtures/documents/x.exe"):
        r = c.get(path)
        assert r.status_code == 404 and "<div id=root>" not in r.text, path


def test_public_fixtures_are_served_from_the_repository(dist):
    c = TestClient(server.app)
    r = c.get("/fixtures/plans/ml26.json")
    assert r.status_code == 200 and r.json()["plan_code"] == "ML26"
    r = c.get("/fixtures/documents/harborview_certificate.pdf")
    assert r.status_code == 200 and r.content.startswith(b"%PDF-") and r.headers["content-type"] == "application/pdf"


def test_unbuilt_web_is_an_honest_503(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "WEB_DIST", (tmp_path / "nothing").resolve())
    r = TestClient(server.app).get("/")
    assert r.status_code == 503 and "not built" in r.text


def test_session_cookie_is_issued_through_the_mount(dist, monkeypatch):
    monkeypatch.delenv("ORALCOMPASS_DEV_AUTH", raising=False)
    monkeypatch.setenv("ORALCOMPASS_SESSION_SECRET", "x" * 40)
    c = TestClient(server.app)
    r = c.get("/api/journeys")
    assert r.status_code == 200 and "oc_session=" in r.headers["set-cookie"] and "Path=/" in r.headers["set-cookie"]
    assert c.get("/").headers.get("set-cookie") is None                  # the static shell never issues sessions


def test_production_config_is_checked(monkeypatch):
    monkeypatch.setenv("ORALCOMPASS_ENV", "production")
    monkeypatch.delenv("ORALCOMPASS_DEV_AUTH", raising=False)
    monkeypatch.setenv("ORALCOMPASS_SESSION_SECRET", "short")
    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        server.check_production_config()
    monkeypatch.setenv("ORALCOMPASS_SESSION_SECRET", "s" * 48)
    server.check_production_config()
    monkeypatch.setenv("ORALCOMPASS_DEV_AUTH", "1")
    with pytest.raises(RuntimeError, match="DEV_AUTH"):
        server.check_production_config()
