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
