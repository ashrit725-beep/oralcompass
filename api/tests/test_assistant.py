"""Grounded assistant (spec section 8): demo mode without keys, grounding of every sentence against the saved estimate / plan / benefits
payloads, the information-only guard, the advice template, scope lock (constant 404), the rate limit, and live mode (mocked, plus one
real call when the stored key and the network allow)."""
import json
import os
import re
import sys
from pathlib import Path

os.environ["ORALCOMPASS_DEV_AUTH"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app import assistant  # noqa: E402
from app.assistant_templates import ADVICE_LABEL, SUGGESTIONS  # noqa: E402
from app.store import NOT_FOUND  # noqa: E402
from app.templates import ASSIST_RIBBON_DEMO, ASSIST_RIBBON_LIVE_FALLBACK  # noqa: E402

client = TestClient(app)
A = {"X-Dev-User": "assist-alex"}
B = {"X-Dev-User": "assist-other"}
MONEY_TEXT = re.compile(r"\$\s?\d|\d\s?%|\d\s*(dollars|percent)", re.I)


@pytest.fixture(autouse=True)
def demo_mode(monkeypatch):
    """Demo mode means no key in the process environment (api/.env may have loaded one)."""
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    assistant.reset_rate_limits()


@pytest.fixture(scope="module")
def alex():
    client.post("/journeys", json={"from": "sample-alex"}, headers=A)
    est = client.post("/me/estimates", json={"plan_code": "ML26"}, headers=A).json()
    hyp = client.post("/me/estimates", json={"plan_code": "ML26", "hypotheticals": {"remaining_deductible_cents": 2500, "remaining_max_cents": 50000}}, headers=A).json()
    items = {i["id"]: i for i in client.get("/me/treatment-items", headers=A).json()}
    plan = client.get("/plans/ML26", headers=A).json()
    rules = client.get("/plans/ML26/rules", headers=A).json()["rules"]
    return {"est": est, "hyp": hyp, "items": items, "plan": {**plan["model"], **plan["summary"]}, "rules": rules,
            "benefits": client.get("/me/benefits/ML26", headers=A).json(), "evidence": client.get("/plans/ML26/evidence", headers=A).json()}


def ask(message, headers=A, **scope):
    return client.post("/me/assistant", json={"message": message, "scope": {"plan_ref": "ML26", **scope}}, headers=headers)


def _walk(payload, path):
    cur = payload
    for tok in re.findall(r"[^.\[\]]+|\[\d+\]", path):
        if tok.startswith("["):
            cur = cur[int(tok[1:-1])]
        else:
            assert isinstance(cur, dict) and tok in cur, f"{path}: {tok} missing"
            cur = cur[tok]
    return cur


def assert_grounded(block, est, ctx):
    """Every ref resolves against a payload the client already holds (estimate, plan, benefits, rules, evidence, treatment items)."""
    assert block["type"] == "sentence" and block["refs"], block
    assert not MONEY_TEXT.search(re.sub(r"\{\{ref:\d+\}\}", " ", block["text"])), block["text"]
    assert "—" not in block["text"]
    for n in re.findall(r"\{\{ref:(\d+)\}\}", block["text"]):
        assert int(n) < len(block["refs"])
    for r in block["refs"]:
        if r["kind"] == "step":
            s = est["ledger"]["lines"][r["line_index"]]["steps"][r["step_index"]]
            assert s["label"] == r["label"]
        elif r["kind"] == "line_total":
            assert ("patient_cents" if r["which"] == "patient" else "plan_cents") in est["ledger"]["lines"][r["line_index"]]
        elif r["kind"] == "clause":
            doc, page = r["stitch"].split("#p")
            assert any(c["doc"] == doc and c["page"] == int(page) for c in ctx["evidence"]["clauses"]), r
        elif r["kind"] == "field":
            root, rest = r["path"].split(".", 1)
            if root == "rules":
                assert any(rest.split(".")[0] in row for row in ctx["rules"]), r
            elif root == "treatment_item":
                assert any(rest in it for it in ctx["items"].values()), r
            else:
                _walk({"plan": ctx["plan"], "benefits": ctx["benefits"], "estimate": est}[root], rest)
        else:
            raise AssertionError(r)


def test_demo_mode_explains_each_checkpoint_grounded(alex):
    est, hyp = alex["est"], alex["hyp"]
    cases = [
        (est, 0, "D", "Why is the deductible what it is on this line?", "No deductible was applied"),
        (hyp, 0, "D", "Why is the deductible what it is on this line?", "This line applied {{ref:0}} to your deductible"),
        (est, 0, "CO", "What share does the plan pay?", "The plan's share for Type II is {{ref:0}}"),
        (est, 1, "CO", "What share does the plan pay?", "The plan's share for Type III is {{ref:0}}"),
        (est, 1, "M", "Does this stay within the maximum?", "stays within the remaining annual maximum of {{ref:0}}"),
        (hyp, 0, "M", "Does this exceed the maximum?", "{{ref:0}} of the plan's share exceeds the remaining annual maximum"),
        (est, 1, "AB", "Does an alternate benefit apply?", "alternate-benefit clause was not found"),
        (est, 0, "allowed", "Why do the fee and the allowed amount differ?", "not owed by you"),
        (est, 1, "total", "How does this line add up?", "What you pay on this line is {{ref:0}}"),
    ]
    for e, li, key, msg, expected in cases:
        r = ask(msg, estimate_id=e["id"], line_index=li, step_key=key)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["mode"] == "demo" and j["intent"] == "explain_step" and j["ribbon"] == ASSIST_RIBBON_DEMO
        assert j["guard"] == {"dropped": 0, "grounding_failures": 0}
        assert any(expected in b["text"] for b in j["blocks"]), (key, [b["text"] for b in j["blocks"]])
        for b in j["blocks"]:
            assert_grounded(b, e, alex)
        # the deterministic tools ran before any composition and are listed by id only
        assert f"get_estimate_line(line {li})" in j["tools_used"] and "get_benefits(ML26)" in j["tools_used"] and "resolve_procedure" in j["tools_used"]
        assert not any(re.search(r"\d{3,}", t) for t in j["tools_used"])
        rule = assistant.T.RULE_FROM_STEP_KEY[key]
        assert j["suggested"] == SUGGESTIONS.get(rule, SUGGESTIONS["default"])
    # the step whose clause is cited is stitched to the plan page the engine cites
    j = ask("What share does the plan pay?", estimate_id=est["id"], line_index=0, step_key="CO").json()
    assert any(r["kind"] == "clause" and r["stitch"] == "ML26#p25" and r.get("rule") == "CO" for b in j["blocks"] for r in b["refs"])


def test_explain_clause_where_from_clarify_and_out_of_scope(alex):
    est = alex["est"]
    j = ask("What does this sentence change in my estimate?", estimate_id=est["id"], line_index=1, stitch="ML26#p25", step_key="CO").json()
    assert j["intent"] == "explain_clause" and "get_clause(ML26#p25)" in j["tools_used"]
    assert j["blocks"][0]["text"] == "This sentence sets the plan's share for Type III." and any("In this estimate it changes {{ref:0}}" in b["text"] for b in j["blocks"])
    for b in j["blocks"]:
        assert_grounded(b, est, alex)
    assert j["suggested"] == SUGGESTIONS["clause"]
    j = ask("Where does the remaining deductible figure come from?", estimate_id=est["id"], line_index=0, step_key="D").json()
    assert j["intent"] == "where_from" and j["blocks"][0]["text"].startswith("{{ref:0}} comes from your records")
    paths = [r["path"] for r in j["blocks"][0]["refs"] if r["kind"] == "field"]
    assert paths == ["benefits.remaining_deductible_cents", "plan.deductible_individual", "benefits.deductible_met_cents"]
    for b in j["blocks"]:
        assert_grounded(b, est, alex)
    # two lines on the route and no line selected -> clarify with scope patches, never a guess
    j = ask("Why is my share what it is?", estimate_id=est["id"]).json()
    assert j["intent"] == "clarify" and j["blocks"][0]["type"] == "clarify"
    assert [o["scope_patch"] for o in j["blocks"][0]["options"]] == [{"line_index": 0}, {"line_index": 1}]
    # a named procedure that matches exactly one line is resolved to it
    j = ask("What is my share on the crown?", estimate_id=est["id"]).json()
    assert j["intent"] == "explain_step" and "get_plan_rules(crown)" in j["tools_used"] and j["tools_used"].count("get_benefits(ML26)") == 1
    # clinical question -> the fixed scope statement, no sentences
    j = ask("Does a root canal hurt?", estimate_id=est["id"], line_index=0).json()
    assert j["intent"] == "out_of_scope" and j["blocks"] == [{"type": "template", "key": "out_of_scope", "text": assistant.T.OUT_OF_SCOPE}]
    # a hypothetical request is pointed at the Harbor Light; the assistant never computes
    j = ask("What if the remaining maximum were $400?", estimate_id=est["id"], line_index=1).json()
    assert j["intent"] == "what_if_requested" and j["blocks"][0]["refs"] == [{"kind": "field", "path": "estimate.inputs.hypotheticals"}]


def test_advice_question_gets_the_fixed_information_template(alex):
    est = alex["est"]
    for q in ("Should I get the crown?", "Is the crown worth it?", "Which plan is better for me?", "Do I need the root canal first?"):
        j = ask(q, estimate_id=est["id"], line_index=1).json()
        assert j["intent"] == "advice_request", q
        assert len(j["blocks"]) == 1 and j["blocks"][0]["type"] == "template" and j["blocks"][0]["key"] == "advice_question"
        assert j["blocks"][0]["label"] == ADVICE_LABEL == "Information, not a choice"
        text = j["blocks"][0]["text"]
        assert text.startswith("OralCompass provides information, not a choice.")
        assert not MONEY_TEXT.search(text) and "{{ref" not in text and "—" not in text
        assert not any(b["type"] == "sentence" for b in j["blocks"])
        assert "get_estimate_line(line 1)" in j["tools_used"]           # facts were still gathered deterministically first


def test_demo_intent_follows_the_question_topic_before_the_selected_step(alex):
    """BUILD_FOLLOWUPS 8: the question names the annual maximum while the deductible step is selected -> the annual-maximum answer."""
    est = alex["est"]
    j = ask("What happens to the annual maximum on this line?", estimate_id=est["id"], line_index=1, step_key="deductible").json()
    assert j["intent"] == "explain_step" and j["mode"] == "demo"
    assert j["blocks"][0]["text"] == "This line stays within the remaining annual maximum of {{ref:0}}."
    refs = j["blocks"][0]["refs"]
    assert refs[0]["kind"] == "field" and refs[0]["path"].endswith("annual_max_cents")
    assert {"kind": "clause", "stitch": "ML26#p25", "rule": "M"} in refs
    assert j["suggested"] == SUGGESTIONS["M"]
    for b in j["blocks"]:
        assert_grounded(b, est, alex)
    # the question names nothing -> the selected step answers (unchanged behaviour)
    j = ask("Why is it what it is on this line?", estimate_id=est["id"], line_index=0, step_key="deductible").json()
    assert j["blocks"][0]["text"].startswith("No deductible was applied")
    # topic table: earliest mention wins; bare "my share" names no checkpoint
    assert assistant.question_topic("Is the deductible counted before the annual max?") == "D"
    assert assistant.question_topic("What percent does the plan pay?") == "CO"
    assert assistant.question_topic("Why is the allowed amount lower?") == "N"
    assert assistant.question_topic("Does a downgrade apply?") == "AB"
    assert assistant.question_topic("Which steps make up my share?") is None


def test_advice_template_reads_as_plain_sentences_from_engine_fields(alex):
    """BUILD_FOLLOWUPS 10: prose built from the line's status and its cited steps; no amounts; lint clean."""
    from app.lint_runtime import guard as lint_guard
    est = alex["est"]
    text = ask("Should I get the crown?", estimate_id=est["id"], line_index=1).json()["blocks"][0]["text"]
    assert text == ("OralCompass provides information, not a choice. Here is what the supplied documents and inputs show. "
                    "For Crown, porcelain/ceramic (tooth 19), the estimate is complete. "
                    "Its network and coinsurance steps are each tied to a sentence in the plan document (ML26, page 25). "
                    "Each amount is on the estimate line beside its evidence label.")
    assert "status estimate" not in text and ";" not in text.split("(ML26")[0]
    assert lint_guard(text)["dropped"] == []
    both = ask("Which is better?", estimate_id=est["id"]).json()["blocks"][0]["text"]
    assert both.count("the estimate is complete") == 2 and both.count("Each amount is on the estimate line") == 1


def test_guard_drops_planted_steering_sentence_and_grounding_drops_amounts():
    allowed = {"step:0:1", "clause:ML26#p25"}
    ok = {"kind": "step", "line_index": 0, "step_index": 1, "label": "x"}
    planted = [
        {"text": "You should schedule the crown now to save money.", "refs": [ok]},                           # steering -> guard drops it
        {"text": "This line stays within the remaining annual maximum of {{ref:0}}.", "refs": [ok]},          # kept
        {"text": "The deductible on this line is $25.", "refs": [ok]},                                        # amount as text -> grounding failure
        {"text": "The plan pays 60 percent of the amount after the deductible.", "refs": [ok]},               # amount as text -> grounding failure
        {"text": "This sentence carries no reference at all.", "refs": []},                                   # ungrounded
        {"text": "This sentence points outside the scope.", "refs": [{"kind": "step", "line_index": 7, "step_index": 0, "label": "x"}]},
    ]
    blocks, counts = assistant.finalize_sentences(planted, allowed)
    assert [b["text"] for b in blocks] == ["This line stays within the remaining annual maximum of {{ref:0}}."]
    assert counts == {"dropped": 1, "grounding_failures": 4}
    # a sentence that is half advice keeps only its information half, counted as one drop
    blocks, counts = assistant.finalize_sentences([{"text": "This line applied {{ref:0}} to your deductible. Consider waiting until January.", "refs": [ok]}], allowed)
    assert blocks[0]["text"] == "This line applied {{ref:0}} to your deductible." and counts["dropped"] == 1
    assert assistant.is_advice_question("which plan is right") and not assistant.is_advice_question("What does the plan document say about the deductible?")


def test_scope_lock_is_a_constant_404(alex):
    est = alex["est"]
    item_id = next(iter(alex["items"]))
    for scope in ({"estimate_id": est["id"], "line_index": 0}, {"treatment_item_id": item_id}, {"estimate_id": est["id"], "journey_id": "nope"}):
        r = ask("What share does the plan pay?", headers=B, **scope)
        assert r.status_code == 404 and r.json() == {"detail": NOT_FOUND}, scope
    assert client.post("/me/assistant", json={"message": "hi", "scope": {"plan_ref": "ZZ99"}}, headers=A).json() == {"detail": NOT_FOUND}
    assert client.post("/me/assistant", json={"message": "hi", "scope": {"plan_ref": "upload:nope"}}, headers=A).json() == {"detail": NOT_FOUND}
    # an estimate for another plan is not in this plan's scope; a line index past the ledger is not either
    assert ask("hi", plan_ref="HB26", estimate_id=est["id"]).status_code == 404
    assert ask("hi", estimate_id=est["id"], line_index=9).status_code == 404
    assert ask("x" * 401, estimate_id=est["id"]).status_code == 422
    denied = [e for e in client.get("/me/audit", headers=B).json() if e["outcome"] == "denied"]
    assert denied and all(set(e) == {"ts", "sub", "action", "type", "id", "outcome"} for e in denied)
    assert client.post("/me/assistant", json={"message": "hi", "scope": {"plan_ref": "ML26"}}).status_code == 401


def test_rate_limit_is_30_per_10_minutes_per_user(alex):
    H = {"X-Dev-User": "assist-ratelimit"}
    for _ in range(30):
        assert ask("What does the plan document say about the deductible?", headers=H).status_code == 200
    r = ask("One more question?", headers=H)
    assert r.status_code == 429 and r.json() == {"detail": {"error": "rate_limited"}}
    assert ask("Another user is not affected?", headers=A, estimate_id=alex["est"]["id"], line_index=0).status_code == 200


def _mock_live(monkeypatch, handler):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key-not-real")
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("ORALCOMPASS_LLM_MODEL", "anthropic/claude-haiku-4.5")
    monkeypatch.setattr(assistant, "live_client", lambda: httpx.Client(transport=httpx.MockTransport(handler)))


def test_live_mode_mocked_applies_guard_grounding_and_fallback(alex, monkeypatch):
    est = alex["est"]
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization", "")
        body = json.loads(request.content)
        seen["body"] = body
        content = {"intent": "explain_step", "sentences": [
            {"text": "Your share on this line is {{ref:0}}, the remainder after the plan's share.", "refs": ["step:0:1", "clause:ML26#p25"]},
            {"text": "You should get the crown done this year to save money.", "refs": ["step:0:1"]},
            {"text": "The plan pays 60% of the amount after the deductible.", "refs": ["step:0:1"]},
            {"text": "This figure is {{ref:0}}.", "refs": ["step:9:9"]},
        ]}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(content)}}]})

    _mock_live(monkeypatch, handler)
    j = ask("What share does the plan pay?", estimate_id=est["id"], line_index=0, step_key="CO").json()
    assert j["mode"] == "live" and j["model"] == "anthropic/claude-haiku-4.5" and j["intent"] == "explain_step" and j["ribbon"] is None
    assert seen["auth"].startswith("Bearer ") and seen["body"]["response_format"]["type"] == "json_schema" and seen["body"]["response_format"]["json_schema"]["strict"] is True
    data = json.loads(seen["body"]["messages"][1]["content"])["data"]
    assert data["line"]["line_index"] == 0 and any(r["id"] == "step:0:1" for r in data["allowed_refs"])     # facts gathered server-side, ids the model may cite
    assert [b["text"] for b in j["blocks"]] == ["Your share on this line is {{ref:0}}, the remainder after the plan's share."]
    assert j["guard"] == {"dropped": 1, "grounding_failures": 2}
    for b in j["blocks"]:
        assert_grounded(b, est, alex)
    # model-declared advice intent is honoured with the fixed template (and the keyword list is re-checked)
    _mock_live(monkeypatch, lambda req: httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"intent": "advice_request", "sentences": []})}}]}))
    j = ask("Tell me about the crown line.", estimate_id=est["id"], line_index=1, step_key="CO").json()
    assert j["intent"] == "advice_request" and j["blocks"][0]["type"] == "template" and j["blocks"][0]["key"] == "advice_question" and j["mode"] == "live"
    # timeout -> the demo template for the scope, labelled demo, with the section 8.4(5) ribbon

    def slow(request):
        raise httpx.ReadTimeout("slow", request=request)
    _mock_live(monkeypatch, slow)
    j = ask("What share does the plan pay?", estimate_id=est["id"], line_index=0, step_key="CO").json()
    assert j["mode"] == "demo" and j["ribbon"] == ASSIST_RIBBON_LIVE_FALLBACK and "model" not in j
    assert j["blocks"][0]["text"].startswith("The plan's share for Type II is {{ref:0}}")
    # nothing the model said survives -> demo template, honestly labelled
    _mock_live(monkeypatch, lambda req: httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"intent": "explain_step", "sentences": [{"text": "You should wait.", "refs": ["step:0:1"]}]})}}]}))
    j = ask("What share does the plan pay?", estimate_id=est["id"], line_index=0, step_key="CO").json()
    assert j["mode"] == "demo" and j["guard"]["dropped"] == 1 and j["blocks"] and j["ribbon"] == ASSIST_RIBBON_LIVE_FALLBACK
    # a 5xx from the provider is also a fallback, never an error to the user
    _mock_live(monkeypatch, lambda req: httpx.Response(502, json={"error": "bad gateway"}))
    j = ask("What share does the plan pay?", estimate_id=est["id"], line_index=0, step_key="CO").json()
    assert j["mode"] == "demo" and j["ribbon"] == ASSIST_RIBBON_LIVE_FALLBACK


def test_live_mode_once_for_real_when_the_stored_key_and_network_allow(alex, monkeypatch):
    from dotenv import dotenv_values
    vals = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    key = vals.get("OPENROUTER_API_KEY")
    if not key:
        pytest.skip("no OPENROUTER_API_KEY in api/.env")
    monkeypatch.setenv("OPENROUTER_API_KEY", key)
    monkeypatch.setenv("ORALCOMPASS_LLM_PROVIDER", vals.get("ORALCOMPASS_LLM_PROVIDER", "openrouter"))
    monkeypatch.setenv("ORALCOMPASS_LLM_MODEL", vals.get("ORALCOMPASS_LLM_MODEL", "anthropic/claude-haiku-4.5"))
    est = alex["est"]
    j = ask("What share of this line does the plan pay?", estimate_id=est["id"], line_index=0, step_key="CO").json()
    if j["mode"] != "live":
        pytest.skip("live model unavailable (network or provider); fallback path exercised instead")
    assert j["model"] == os.environ["ORALCOMPASS_LLM_MODEL"] and j["intent"] in assistant.INTENTS
    assert j["blocks"] and all(b["type"] in ("sentence", "template") for b in j["blocks"])
    for b in j["blocks"]:
        if b["type"] == "sentence":
            assert_grounded(b, est, alex)


def test_assistant_on_an_uploaded_plan_uses_benefits_versions_and_never_the_ignored_wording():
    """api-correctness-1/-2: benefits for an upload ref reach the assistant; an estimate saved under UP1 keeps UP1 clauses after UP2 is
    published; the document's ignored (injected) wording is never a citable clause or a fact."""
    from urllib.parse import quote
    import test_uploads as tu
    from app.auth import User
    sub = "assist-upload"
    h = {"X-Dev-User": sub}
    doc_id, _ = tu.hb26_published(sub)
    ref = f"upload:{doc_id}"
    assert client.put(f"/me/benefits/{quote(ref, safe='')}", json=tu.SAM_BENEFITS, headers=h).status_code == 200
    ctx = assistant.load_scope(User(sub), assistant.AssistScope(plan_ref=ref))
    facts = assistant.gather(ctx, "How much of my deductible is left?")
    assert ctx.benefits is not None and ctx.benefits["plan_code"] == ref and ctx.benefits["remaining_deductible_cents"] is not None
    assert not any(c["field"].startswith(("upload", "security_test")) for c in ctx.clauses)
    assert "automated readers" not in json.dumps(facts).lower() and "automated readers" not in json.dumps(ctx.clauses).lower()
    client.post("/journeys", json={"from": "sample-sam"}, headers=h)
    est1 = client.post("/me/estimates", json={"plan_code": ref}, headers=h).json()
    assert est1["plan_version_label"] == "UP1"
    stitch = next(s["stitch"] for L in est1["ledger"]["lines"] for s in L["steps"] if s.get("stitch"))
    client.put(f"/me/documents/{doc_id}/review", json={"decisions": [{"field_path": "deductible_individual", "decision": "edited", "value": 7500, "source": "x"}]}, headers=h)
    assert client.post(f"/me/documents/{doc_id}/publish", headers=h).json()["version_label"] == "UP2"
    ctx2 = assistant.load_scope(User(sub), assistant.AssistScope(plan_ref=ref, estimate_id=est1["id"], line_index=0))
    assert {c["doc"] for c in ctx2.clauses} == {"UP1"} and assistant.get_clause(ctx2, stitch) is not None


def test_one_live_switch_redacted_question_and_bare_amounts_dropped(alex, monkeypatch):
    """api-correctness-25 (provider unset = demo everywhere), security-4 (question and upload title redacted before the model) and
    info-only-2 (amounts written as 1,500 / USD 392 / fifty percent / 392.00 are not grounded)."""
    from app import extraction
    monkeypatch.delenv("ORALCOMPASS_LLM_PROVIDER", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    assert assistant.llm_mode() == extraction.llm_mode() == "demo"
    r = [assistant.step_ref(0, 0, "x")]
    allowed = {assistant.ref_id(r[0])}
    for bad in ("The annual maximum is 1,500 for the year {{ref:0}}.", "The plan pays fifty percent of {{ref:0}}.", "You pay USD 392 on this line {{ref:0}}.",
                "You owe 392.00 here {{ref:0}}.", "You owe 392 here {{ref:0}}.", "The plan pays $1,500 {{ref:0}}."):
        assert assistant.check_grounding(bad, r, allowed) is False, bad
    assert assistant.check_grounding("Tooth 19, statement dated 2026-09-20: your share is {{ref:0}}.", r, allowed) is True
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"intent": "explain_step", "sentences": []})}}]})

    _mock_live(monkeypatch, handler)
    ask("My member ID: ABC123456, call 919-555-0100. What share does the plan pay?", estimate_id=alex["est"]["id"], line_index=0, step_key="CO")
    sent = json.loads(seen["body"]["messages"][1]["content"])
    assert "ABC123456" not in sent["question"] and "919-555-0100" not in sent["question"] and "What share" in sent["question"]
    assert "Harbor Light" not in assistant.T.WHAT_IF and "does not compute hypotheticals" in assistant.T.WHAT_IF          # info-only-7
