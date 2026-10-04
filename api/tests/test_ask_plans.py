"""Prompt box plan dropdown (Plan A/B/C), procedure_cost with quick_estimate refs, and the model-written lead (fake model only)."""
import json
import re
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app import ask_plans, assistant
from app import quick_estimate as QE
from app.main import app
from oralcompass_engine import load_plan

client = TestClient(app)
H = {"X-Dev-User": "askplans-alex"}
FIX = Path(__file__).resolve().parents[2] / "fixtures" / "plans"
ADVICE = re.compile(r"\b(should|recommend|consider|best|better|worth|wait|skip|schedule|call|ask|check|choose|compare)\b", re.I)


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "none")
    assistant.reset_rate_limits()


@pytest.fixture(scope="module")
def journey():
    r = client.post("/journeys", json={"from": "sample-alex"}, headers=H)
    assert r.status_code in (200, 201), r.text


def ask(msg, choice=None, plan_ref="ML26"):
    body = {"message": msg, "scope": {"plan_ref": plan_ref}}
    if choice:
        body["plan_choice"] = choice
    r = client.post("/me/assistant", json=body, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def test_mapping_has_exactly_three_plans_mirrored_in_web_config():
    assert ask_plans.ASK_PLANS == {"A": "DD24", "B": "DD24L", "C": "FD26H"}
    assert ask_plans.plan_code("Plan B") == "DD24L" and ask_plans.plan_code("D") is None
    ts = (Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "ask-plans.ts")
    if ts.exists():
        txt = ts.read_text()
        for code in ask_plans.ASK_PLANS.values():
            assert f'"{code}"' in txt
        # item 30: each letter maps to the same code and kid-simple name in both files
        for c, code in ask_plans.ASK_PLANS.items():
            row = f'{{ choice: "{c}", label: "{ask_plans.ASK_PLAN_LABELS[c]}", code: "{code}", name: "{ask_plans.ASK_PLAN_NAMES[c]}" }}'
            assert row in txt, row
        assert txt.count("{ choice: \"") == 3


PHRASES = [("how much is a crown", "crown"), ("cleaning?", "cleaning"), ("root canal cost", "root_canal_molar"), ("x-rays", "bitewing_xrays"),
           ("my checkup", "exam"), ("pulling a tooth", "extraction_simple"), ("deep cleaning price", "scaling_root_planing"),
           ("night guard", "night_guard"), ("an implant", "implant"), ("dentures", "denture_partial"), ("a fillling", "composite"),
           ("crwon", "crown"), ("rootcanal", "root_canal_molar"), ("wisdom tooth out", "extraction_surgical"), ("xray please", "bitewing_xrays"),
           ("sealants for my kid", "sealant"), ("extration", "extraction_simple"), ("cleanning", "cleaning"), ("implnat", "implant"),
           ("check-up price", "exam"), ("bridge", "unpriced:bridge")]


@pytest.mark.parametrize("msg,key", PHRASES)
def test_procedure_matching_everyday_words_and_typos(msg, key):
    assert QE.match_procedure(msg) == key


def test_no_match_for_unrelated_words():
    assert QE.match_procedure("what is the weather") is None


@pytest.mark.parametrize("choice", ["A", "B", "C"])
@pytest.mark.parametrize("key,msg", [("crown", "How much is a crown?"), ("cleaning", "how much is a cleaning"), ("root_canal_molar", "root canal")])
def test_estimate_for_each_plan_equals_the_engine_run(journey, choice, key, msg):
    j = ask(msg, choice)
    assert j["intent"] == "procedure_cost" and j["plan_choice"] == choice
    code = ask_plans.ASK_PLANS[choice]
    plan = load_plan(FIX / f"{code.lower()}.json")
    want = QE.estimate(plan, key)
    qb = next(b for b in j["blocks"] if b.get("type") == "quick_estimate")
    assert qb["plan_ref"] == code and qb["plan_label"] == f"Plan {choice}"
    assert qb["price"]["cents"] == want["fee"] and qb["price"]["evidence"] == "ASSUMED"
    assert qb["insurance_pays"]["cents"] == want["plan"] and qb["you_pay"]["cents"] == want["patient"]
    lead = j["blocks"][0]
    assert lead["kind"] == "simple" and not re.search(r"\$|\d", assistant.PLACEHOLDER.sub("", lead["text"]))
    if want["patient"] is not None:
        assert "You pay {{ref:2}}" in lead["text"] and "Insurance pays {{ref:1}}" in lead["text"]
        assert want["fee"] == want["plan"] + want["patient"]
    assert not ADVICE.search(lead["text"]) and assistant.fk_grade(assistant.PLACEHOLDER.sub("it", lead["text"])) <= 4


def test_plans_give_one_plan_per_answer_never_side_by_side(journey):
    j = ask("how much is a crown", "A")
    plans = {r.get("plan_ref") for b in j["blocks"] for r in (b.get("refs") or []) if r.get("kind") == "quick_estimate"}
    assert plans == {"DD24"}


def test_unpriced_word_says_so_plainly(journey):
    j = ask("how much is a bridge", "A")
    assert j["intent"] == "procedure_cost" and "do not have a price" in j["blocks"][0]["text"]


def test_advice_question_is_never_answered_with_advice(journey):
    j = ask("should I get a crown", "A")
    assert j["intent"] == "advice_request"


def test_bad_plan_choice_is_rejected(journey):
    r = client.post("/me/assistant", json={"message": "crown cost", "scope": {"plan_ref": "ML26"}, "plan_choice": "D"}, headers=H)
    assert r.status_code == 422


# ---------- live lead (fake model client) ----------
def _mock(monkeypatch, reply):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key-not-real")
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("ORALCOMPASS_LLM_MODEL", "anthropic/claude-haiku-4.5")
    seen = []

    def handler(req):
        body = json.loads(req.content)
        seen.append(body)
        out = reply(body) if callable(reply) else reply
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(out)}}]})
    monkeypatch.setattr(assistant, "live_client", lambda: httpx.Client(transport=httpx.MockTransport(handler)))
    try:
        assistant.llm_guard.guard.reset()
    except Exception:
        pass
    return seen


def test_live_lead_is_written_by_the_model_for_procedure_cost(journey, monkeypatch):
    seen = _mock(monkeypatch, {"text": "A crown costs about {{ref:0}}. Insurance pays {{ref:1}}. You pay {{ref:2}}.",
                               "refs": ["quick_estimate:fee", "quick_estimate:plan", "quick_estimate:patient"]})
    j = ask("how much is a crown", "A")
    assert j["mode"] == "live" and j["model"] == "anthropic/claude-haiku-4.5"
    assert j["blocks"][0].get("by") == "model" and [r["which"] for r in j["blocks"][0]["refs"]] == ["fee", "plan", "patient"]
    assert seen and seen[-1]["response_format"]["json_schema"]["name"] == "assist_lead"


def test_live_lead_for_journey_intent_is_model_written(journey, monkeypatch):
    def reply(body):
        data = json.loads(body["messages"][1]["content"])["data"]
        ids = [r["id"] for r in data["allowed_refs"]][:1]
        return {"text": "This is the part you pay first {{ref:0}}." if ids else "This word is in your plan papers.", "refs": ids}
    _mock(monkeypatch, reply)
    j = ask("What is a deductible?")
    assert j["mode"] == "live" and j["blocks"][0].get("by") == "model"


@pytest.mark.parametrize("bad", [
    {"text": "You should get the crown. You pay {{ref:0}}.", "refs": ["quick_estimate:patient"]},            # advice
    {"text": "You pay $300 for it.", "refs": ["quick_estimate:patient"]},                                    # a written amount
    {"text": "You pay {{ref:0}}.", "refs": ["field:plan.secret"]},                                           # ungrounded ref
    {"text": "The comprehensive prosthodontic reimbursement methodology determines {{ref:0}}.", "refs": ["quick_estimate:patient"]},  # too hard to read
    "not json",
])
def test_live_lead_falls_back_to_the_template_on_any_guard_failure(journey, monkeypatch, bad):
    _mock(monkeypatch, bad)
    j = ask("how much is a crown", "A")
    assert j["intent"] == "procedure_cost" and j["mode"] == "demo" and "model" not in j
    assert j["blocks"][0]["text"].startswith("A crown costs about {{ref:0}}.")


def test_live_lead_falls_back_on_http_error(journey, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key-not-real")
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "openrouter")
    monkeypatch.setattr(assistant, "live_client", lambda: httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500))))
    j = ask("how much is a crown", "B")
    assert j["mode"] == "demo" and j["blocks"][0]["kind"] == "simple"


def test_clinical_question_with_a_plan_picked_is_not_a_cost_answer(journey):
    assert ask("does a root canal hurt", "A")["intent"] != "procedure_cost"
