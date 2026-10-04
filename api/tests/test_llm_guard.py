"""Live-AI cost guard (addendum §D.2): per-visitor limits per kind, global daily request and spend caps, UTC-midnight reset, persistence in
the store, and honest demo fallbacks in the assistant and extraction; /health reports the cap without ever exposing the key."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app import assistant, extraction, llm_guard
from app.llm_guard import LLMGuard
from app.main import app
from app.store import InMemoryRepo
from app.store_sqlite import SqliteRepo
from app.templates import LLM_LIMIT_EXTRACTION_RIBBON, LLM_LIMIT_RIBBON

client = TestClient(app)
HB26_PDF = Path(__file__).resolve().parents[2] / "fixtures" / "documents" / "harborview_certificate.pdf"
DAY1 = datetime(2026, 10, 3, 23, 59, 30, tzinfo=timezone.utc).timestamp()


class Clock:
    def __init__(self, t: float) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


@pytest.fixture(params=["memory", "sqlite"])
def g(request, tmp_path):
    repo = InMemoryRepo() if request.param == "memory" else SqliteRepo(tmp_path / "guard.db")
    yield LLMGuard(repo=repo, clock=Clock(DAY1))


def test_per_session_daily_limits_per_kind(g):
    for kind, n in (("extraction", 5), ("reader", 10), ("explainer", 60)):
        assert all(g.allow("visitor-1", kind) == (True, None) for _ in range(n)), kind
        assert g.allow("visitor-1", kind) == (False, "session_limit")
        assert g.allow("visitor-2", kind) == (True, None)                     # another visitor is not affected


def test_assistant_limit_is_per_ten_minute_window(g):
    assert all(g.allow("v", "assistant")[0] for _ in range(30))
    assert g.allow("v", "assistant") == (False, "session_limit")
    g._clock.t += 600
    assert g.allow("v", "assistant") == (True, None)


def test_limits_reset_at_utc_midnight_and_stale_keys_are_pruned(g):
    assert all(g.allow("v", "extraction")[0] for _ in range(5)) and not g.allow("v", "extraction")[0]
    g._clock.t = DAY1 + 31                                                  # 00:00:01 UTC the next day
    assert g.allow("v", "extraction") == (True, None)
    assert g.status()["requests_today"] == 1
    assert not any(":2026-10-03" in k for k in getattr(g.repo, "_counters", {}))


def test_global_daily_request_cap(g, monkeypatch):
    monkeypatch.setenv("ORALCOMPASS_LLM_DAILY_REQUESTS", "3")
    assert [g.allow(f"v{i}", "explainer")[0] for i in range(3)] == [True, True, True]
    assert g.allow("v9", "explainer") == (False, "daily_requests_cap")
    assert g.status()["cap_reached"] is True and g.status()["requests_today"] == 3


def test_estimated_spend_cap_uses_the_price_table(g, monkeypatch):
    monkeypatch.setenv("ORALCOMPASS_LLM_DAILY_USD", "0.01")
    monkeypatch.setenv("ORALCOMPASS_LLM_MODEL", "anthropic/claude-haiku-4.5")
    assert g.prices() == (0.001, 0.005)
    assert g.allow("v", "assistant") == (True, None)
    assert g.record("assistant", 2000, 1000) == 7000                     # 2k in at $0.001/1k + 1k out at $0.005/1k = $0.007
    assert g.allow("v", "assistant") == (True, None) and not g.status()["cap_reached"]
    g.record("assistant", 1000, 400)                                       # +$0.003 → $0.010
    assert g.status()["spend_usd_today"] == 0.01 and g.status()["cap_reached"] is True
    assert g.allow("other", "reader") == (False, "daily_spend_cap")
    monkeypatch.setenv("ORALCOMPASS_LLM_PRICE_OUT_PER_1K", "0.010")         # configurable by env
    assert g.prices() == (0.001, 0.010)
    monkeypatch.setenv("ORALCOMPASS_LLM_DAILY_USD", "0")
    assert g.allow("fresh", "reader") == (False, "daily_spend_cap")


def test_refusal_changes_no_counter(g, monkeypatch):
    monkeypatch.setenv("ORALCOMPASS_LLM_LIMIT_READER", "1")
    g.allow("v", "reader")
    before = g.status()["requests_today"]
    assert g.allow("v", "reader") == (False, "session_limit")
    assert g.status()["requests_today"] == before


def test_counters_persist_in_sqlite(tmp_path):
    path = tmp_path / "persist.db"
    g1 = LLMGuard(repo=SqliteRepo(path), clock=Clock(DAY1))
    for _ in range(5):
        g1.allow("v", "extraction")
    g1.record("extraction", 10_000, 2_000)
    g1.repo.close()
    g2 = LLMGuard(repo=SqliteRepo(path), clock=Clock(DAY1))                # a restart keeps the day's counters
    assert g2.allow("v", "extraction") == (False, "session_limit")
    assert g2.status()["requests_today"] == 5 and g2.status()["spend_usd_today"] == 0.02


def test_usage_tokens_prefers_reported_usage():
    assert llm_guard.usage_tokens({"usage": {"prompt_tokens": 120, "completion_tokens": 30}}, 9, 9) == (120, 30)
    assert llm_guard.usage_tokens({"choices": []}, 50, 600) == (50, 600)
    assert llm_guard.usage_tokens(None, 1, 2) == (1, 2)


# ---------------------------------------------------------------- callers fall back to demo behaviour, honestly labelled
@pytest.fixture
def alex():
    A = {"X-Dev-User": "guard-alex"}
    client.post("/journeys", json={"from": "sample-alex"}, headers=A)
    est = client.post("/me/estimates", json={"plan_code": "ML26"}, headers=A).json()
    return A, est


def test_assistant_falls_back_to_the_template_when_the_limit_is_reached(alex, monkeypatch):
    A, est = alex
    calls = []

    def handler(request):
        calls.append(1)
        content = {"intent": "explain_step", "sentences": [{"text": "Your share on this line is {{ref:0}}.", "refs": ["step:0:1"]}]}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(content)}}], "usage": {"prompt_tokens": 1500, "completion_tokens": 80}})
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key-not-real")
    monkeypatch.setenv("ORALCOMPASS_LLM_LIMIT_ASSISTANT", "1")
    monkeypatch.setattr(assistant, "live_client", lambda: httpx.Client(transport=httpx.MockTransport(handler)))
    assistant.reset_rate_limits()
    body = {"message": "What share does the plan pay?", "scope": {"plan_ref": "ML26", "estimate_id": est["id"], "line_index": 0, "step_key": "CO"}}
    first = client.post("/me/assistant", json=body, headers=A).json()
    assert first["mode"] == "live" and len(calls) == 1
    assert llm_guard.status()["spend_usd_today"] == pytest.approx(0.0019, abs=1e-6)   # 1500 in + 80 out at Haiku 4.5 prices
    second = client.post("/me/assistant", json=body, headers=A).json()
    assert len(calls) == 1                                                           # no second provider call
    assert second["mode"] == "demo" and second["ribbon"] == LLM_LIMIT_RIBBON and second["limit"] == "session_limit" and second["blocks"]
    h = client.get("/health").json()
    assert h["llm_mode"] == "live" and h["llm_cap_reached"] is False and "test-key-not-real" not in json.dumps(h)


def test_extraction_falls_back_to_demo_when_the_daily_cap_is_reached(monkeypatch, tmp_path):
    U = {"X-Dev-User": "guard-extract"}
    monkeypatch.setenv("ORALCOMPASS_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key-not-real")
    monkeypatch.setenv("ORALCOMPASS_LLM_DAILY_REQUESTS", "0")

    def no_network(request):
        raise AssertionError("the provider must not be called when the cap is reached")
    monkeypatch.setattr(extraction, "_TRANSPORT_OVERRIDE", httpx.MockTransport(no_network))
    data = HB26_PDF.read_bytes()
    up = client.post("/me/documents/upload", files={"file": ("plan.pdf", data, "application/pdf")},
                     data={"sha256": hashlib.sha256(data).hexdigest(), "pages": "14", "text_preview": ""}, headers=U).json()
    started = client.post(f"/me/documents/{up['id']}/extract", headers=U).json()
    assert started["mode"] == "demo" and started["status"] == "ready"
    st = client.get(f"/me/documents/{up['id']}/extraction", headers=U).json()
    assert st["mode"] == "demo" and st["ribbon"] == LLM_LIMIT_EXTRACTION_RIBBON and st["limit_reached"] == "daily_requests_cap"
    h = client.get("/health").json()
    assert h["llm_cap_reached"] is True and "OPENROUTER" not in json.dumps(h) and "test-key" not in json.dumps(h)


def test_local_limiter_has_a_network_key_and_forgets_expired_sessions(monkeypatch):
    """api-correctness-26 / security-6: dropping the cookie does not reset the per-network allowance; expired keys are swept."""
    from types import SimpleNamespace
    from fastapi import HTTPException
    from app import ai_support
    ai_support.reset_rate_limits()
    monkeypatch.setattr(ai_support, "dev_mode", lambda: False)
    req = SimpleNamespace(headers={"x-forwarded-for": "198.51.100.7, 203.0.113.9"}, client=SimpleNamespace(host="10.0.0.1"))
    assert ai_support.client_key(req) == "203.0.113.9"
    for i in range(3 * 2):                                  # n=2 per session, 3x per network: six fresh "sessions" pass
        ai_support.local_rate_limit(f"fresh-session-{i}", "assistant", 2, 600, req)
    with pytest.raises(HTTPException) as e:
        ai_support.local_rate_limit("fresh-session-new", "assistant", 2, 600, req)
    assert e.value.status_code == 429
    clock = [1000.0]
    monkeypatch.setattr(ai_support.time, "monotonic", lambda: clock[0])
    ai_support.reset_rate_limits()
    for i in range(300):
        ai_support.local_rate_limit(f"s{i}", "explain", 5, 60)
    clock[0] += 120
    for i in range(ai_support._PRUNE_EVERY):
        ai_support.local_rate_limit("one-active", "explain", 10_000, 60)
    assert len(ai_support._RATE) <= 2
