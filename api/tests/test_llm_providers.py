"""Provider layer (llm_providers): ORALCOMPASS_LLM_PROVIDER chains, the Bedrock Converse request shape (URL, bearer header, forced tool for
the JSON schema, image blocks), toolUse parsing, usage accounting, the chain fallback 429 → OpenRouter → template with an honest notice,
and that the suite stays in demo mode by default. Never live: Bedrock goes through a fake urllib opener, OpenRouter through MockTransport."""
import email.message
import io
import json
import logging
import os
import sys
import urllib.error
from pathlib import Path

os.environ["ORALCOMPASS_DEV_AUTH"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import ai_support, explain, extraction, llm_guard, llm_providers  # noqa: E402
from app.main import app  # noqa: E402
from app.store import repo  # noqa: E402
from app.templates import EXPLAIN_LABEL_FALLBACK, LIVE_AI_PROVIDER_LIMIT  # noqa: E402

client = TestClient(app)
TOKEN = "test-bedrock-token-not-real"
MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["sentence"], "properties": {"sentence": {"type": "string"}}}
MESSAGES = [{"role": "system", "content": "You explain."}, {"role": "user", "content": "the clause"}]


class FakeResp:
    def __init__(self, payload):
        self._b = json.dumps(payload).encode()
        self.status = 200

    def read(self, *a):
        return self._b


def converse_ok(data, usage=(11, 7)):
    return {"output": {"message": {"role": "assistant", "content": [{"toolUse": {"toolUseId": "t1", "name": "plain_sentence", "input": data}}]}},
            "stopReason": "tool_use", "usage": {"inputTokens": usage[0], "outputTokens": usage[1], "totalTokens": sum(usage)}}


def http_error(status, message, etype="ThrottlingException"):
    h = email.message.Message()
    h["x-amzn-ErrorType"] = f"{etype}:http://internal.amazon.com/coral/com.amazon.bedrock/"
    return urllib.error.HTTPError("https://bedrock-runtime.us-east-2.amazonaws.com/x", status, "err", h, io.BytesIO(json.dumps({"message": message}).encode()))


@pytest.fixture
def bedrock(monkeypatch):
    """Bedrock configured with a fake key and a fake opener that records each request."""
    seen = []
    state = {"reply": lambda req: FakeResp(converse_ok({"sentence": "ok"}))}

    def opener(req, timeout):
        seen.append({"url": req.full_url, "auth": req.get_header("Authorization"), "body": json.loads(req.data), "timeout": timeout})
        return state["reply"](req)

    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "bedrock")
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", TOKEN)
    monkeypatch.setenv("AWS_REGION", "us-east-2")
    monkeypatch.setenv("ORALCOMPASS_BEDROCK_MODEL", MODEL)
    monkeypatch.setattr(llm_providers, "_OPENER_OVERRIDE", opener)
    ai_support.reset_rate_limits()
    return seen, state


def test_suite_defaults_to_demo_with_no_provider():
    assert os.environ.get("ORALCOMPASS_LLM_PROVIDER") == "none"
    assert not os.environ.get("AWS_BEARER_TOKEN_BEDROCK")
    assert llm_providers.configured() == [] and extraction.llm_mode() == "demo"
    h = client.get("/health").json()
    assert h["llm_mode"] == "demo" and h["llm_providers"] == []


def test_chain_parsing_and_credentials(monkeypatch):
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "Bedrock, openrouter,bogus,bedrock")
    assert llm_providers.chain() == ["bedrock", "openrouter"]
    assert llm_providers.configured() == [] and llm_providers.llm_mode() == "demo"
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    assert llm_providers.configured() == ["openrouter"] and llm_providers.llm_model() == "anthropic/claude-haiku-4.5"
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", TOKEN)
    monkeypatch.setenv("ORALCOMPASS_BEDROCK_MODEL", MODEL)
    assert llm_providers.configured() == ["bedrock", "openrouter"] and extraction.llm_mode() == "live" and extraction.llm_model() == MODEL
    h = client.get("/health").json()
    assert h["llm_providers"] == ["bedrock", "openrouter"] and TOKEN not in json.dumps(h)
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "none")
    assert llm_providers.llm_mode() == "demo"


def test_bedrock_request_shape_and_tool_use_parsing(bedrock, caplog):
    seen, _ = bedrock
    caplog.set_level(logging.DEBUG)
    out = ai_support.call_model(MESSAGES, "plain_sentence", SCHEMA, 200, 7.0, "explain")
    assert out == {"sentence": "ok"}
    (r,) = seen
    assert r["url"] == "https://bedrock-runtime.us-east-2.amazonaws.com/model/us.anthropic.claude-haiku-4-5-20251001-v1%3A0/converse"
    assert r["auth"] == f"Bearer {TOKEN}" and r["timeout"] == 7.0
    b = r["body"]
    assert b["system"] == [{"text": "You explain."}]
    assert b["messages"] == [{"role": "user", "content": [{"text": "the clause"}]}]
    assert b["inferenceConfig"] == {"maxTokens": 200, "temperature": 0}
    spec = b["toolConfig"]["tools"][0]["toolSpec"]
    assert spec["name"] == "plain_sentence" and spec["inputSchema"] == {"json": SCHEMA}
    assert b["toolConfig"]["toolChoice"] == {"tool": {"name": "plain_sentence"}}
    assert TOKEN not in caplog.text and "the clause" not in caplog.text


def test_image_blocks_and_role_merging():
    msgs = [{"role": "system", "content": "S"},
            {"role": "user", "content": [{"type": "text", "text": "read this"},
                                         {"type": "image_url", "image_url": {"url": "data:image/png;base64,QUJD"}},
                                         {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,REVG"}},
                                         {"type": "image_url", "image_url": {"url": "https://example.com/not-inline.png"}}]},
            {"role": "user", "content": "and this"}]
    b = llm_providers.converse_body(msgs, "treatment_plan_lines", SCHEMA, 4000)
    assert b["messages"] == [{"role": "user", "content": [{"text": "read this"},
                                                          {"image": {"format": "png", "source": {"bytes": "QUJD"}}},
                                                          {"image": {"format": "jpeg", "source": {"bytes": "REVG"}}},
                                                          {"text": "and this"}]}]


def test_text_answer_is_accepted_only_as_a_json_object():
    assert llm_providers.parse_converse({"output": {"message": {"content": [{"text": '{"a": 1}'}]}}}) == {"a": 1}
    with pytest.raises(llm_providers.ModelUnavailable):
        llm_providers.parse_converse({"output": {"message": {"content": [{"text": "[1, 2]"}]}}})


def test_usage_is_recorded_with_the_guard(bedrock, monkeypatch):
    calls = []
    monkeypatch.setattr(llm_guard, "record", lambda kind, i, o=0: calls.append((kind, i, o)))
    ai_support.call_model(MESSAGES, "plain_sentence", SCHEMA, 200, 5.0, "explain")
    assert calls == [("explainer", 11, 7)]


def test_429_falls_back_to_openrouter(bedrock, monkeypatch, caplog):
    seen, state = bedrock
    caplog.set_level(logging.DEBUG)

    def throttled(req):
        raise http_error(429, "Too many tokens per day, please wait before trying again.")
    state["reply"] = throttled
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "bedrock,openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key-not-real")
    hits = []

    def handler(req):
        hits.append(req.url.host)
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"sentence": "from openrouter"})}}]})
    monkeypatch.setattr(extraction, "_TRANSPORT_OVERRIDE", httpx.MockTransport(handler))
    assert ai_support.call_model(MESSAGES, "plain_sentence", SCHEMA, 200, 5.0, "explain") == {"sentence": "from openrouter"}
    assert len(seen) == 1 and hits == ["openrouter.ai"]
    assert "bedrock limit reached (http 429" in caplog.text and TOKEN not in caplog.text and "test-key-not-real" not in caplog.text


@pytest.mark.parametrize("status,etype,limited", [(429, "ThrottlingException", True), (400, "ValidationException", False),
                                                    (403, "AccessDeniedException", False), (404, "ResourceNotFoundException", False),
                                                    (503, "ServiceUnavailableException", False)])
def test_bedrock_errors_raise_model_unavailable(bedrock, status, etype, limited):
    _, state = bedrock

    def fail(req):
        raise http_error(status, "Model use case details have not been submitted" if status == 404 else "x", etype)
    state["reply"] = fail
    with pytest.raises(extraction.ModelUnavailable) as e:
        ai_support.call_model(MESSAGES, "plain_sentence", SCHEMA, 200, 5.0, "explain")
    assert e.value.limited is limited


def test_timeout_is_bounded_and_falls_back(bedrock):
    _, state = bedrock

    def slow(req):
        raise TimeoutError("timed out")
    state["reply"] = slow
    with pytest.raises(extraction.ModelUnavailable) as e:
        ai_support.call_model(MESSAGES, "plain_sentence", SCHEMA, 200, 5.0, "explain")
    assert e.value.limited is False


def test_every_provider_at_its_limit_shows_the_template_with_an_honest_notice(bedrock, monkeypatch):
    _, state = bedrock

    def throttled(req):
        raise http_error(429, "Too many tokens per day")
    state["reply"] = throttled
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "bedrock,openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key-not-real")
    monkeypatch.setattr(extraction, "_RETRY_BACKOFF_S", 0)
    monkeypatch.setattr(extraction, "_TRANSPORT_OVERRIDE", httpx.MockTransport(lambda req: httpx.Response(429, json={"error": "limit"})))
    for r in repo.list_owned(explain.PRESET_CACHE_OWNER, explain.CACHE_TYPE):
        repo.delete_owned(explain.PRESET_CACHE_OWNER, explain.CACHE_TYPE, r["id"])
    j = client.post("/me/explain", json={"plan_ref": "ML26", "stitch": "ML26#p25", "quote": "80% after deductible 60% after deductible 50% after deductible"},
                    headers={"X-Dev-User": "prov-a"}).json()
    assert j["mode"] == "demo" and j["label"] == EXPLAIN_LABEL_FALLBACK and j["reason"] == "provider_limit" and j["notice"] == LIVE_AI_PROVIDER_LIMIT
