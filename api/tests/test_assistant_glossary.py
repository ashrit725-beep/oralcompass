"""Plain-words glossary (design point 4): the contract shape, the information-only and no-numbers rules on every definition, reading level,
agreement with the plan documents and the engine's rule codes, and lookup_term (case, aka, plurals, possessives, punctuation, typos,
longest and earliest match, linear time on a 50 KB string)."""
import json
import os
import re
import sys
import time
from pathlib import Path

os.environ["ORALCOMPASS_DEV_AUTH"] = "1"
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "engine"))

import pytest  # noqa: E402

from advice_lint import lint_text  # noqa: E402
from app.assistant import MONEY_IN_TEXT  # noqa: E402
from app.assistant_glossary import COPAY_PLAN_NOTE, GLOSSARY, TERM_FOR_RULE, lookup_term  # noqa: E402
from app.assistant_templates import RULE_FROM_STEP_KEY  # noqa: E402
from app.lint_runtime import guard  # noqa: E402

REQUIRED = ("deductible", "plan_share", "allowed_amount", "annual_max", "waiting_period", "frequency_limit", "network", "alternate_benefit",
            "exclusion", "predetermination", "premium", "eob", "procedure_code", "copay", "balance_billing", "benefit_year")
NUMBER_WORDS = re.compile(r"\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|"
                          r"hundred|thousand|twice|half|percent|dollars?|cents?)\b", re.I)
SENTENCES = re.compile(r"(?<=[.!?])\s+")
# money fields that the assistant's gather() admits as field refs ("Your plan's deductible is {{ref:0}}.")
PLAN_MONEY_FIELDS = {"plan.deductible_individual", "plan.annual_max"}


def _syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    if len(w) <= 3:
        return 1
    w = re.sub(r"(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$", "", w)
    w = re.sub(r"^y", "", w)
    return max(1, len(re.findall(r"[aeiouy]{1,2}", w)))


def fk_grade(text: str) -> float:
    """Flesch-Kincaid grade level (a common vowel-group syllable estimate; good enough to keep definitions near 8th grade)."""
    sents = [s for s in SENTENCES.split(text.strip()) if s]
    words = re.findall(r"[A-Za-z][A-Za-z'\-]*", text)
    if not words:
        return 0.0
    return 0.39 * len(words) / max(1, len(sents)) + 11.8 * sum(_syllables(w) for w in words) / len(words) - 15.59


def _definitions():
    for key, e in GLOSSARY.items():
        yield key, "simple", e["simple"]
        yield key, "simpler", e["simpler"]


# ---------- contract shape ----------
def test_contract_shape_and_required_terms():
    for key in REQUIRED:
        assert key in GLOSSARY, key
    for key, e in GLOSSARY.items():
        assert set(e) == {"term", "aka", "simple", "simpler", "plan_field"}, key
        assert isinstance(e["term"], str) and e["term"].strip(), key
        assert isinstance(e["aka"], list) and all(isinstance(a, str) and a.strip() for a in e["aka"]), key
        assert isinstance(e["simple"], str) and isinstance(e["simpler"], str), key
        assert e["plan_field"] is None or isinstance(e["plan_field"], str), key


def test_plan_fields_are_money_fields_the_assistant_can_cite():
    from oralcompass_engine.loader import load_plan
    plan = load_plan(ROOT / "fixtures/plans/ml26.json")
    named = {e["plan_field"] for e in GLOSSARY.values() if e["plan_field"]}
    assert named == PLAN_MONEY_FIELDS
    for path in named:
        root, attr = path.split(".", 1)
        assert root == "plan" and hasattr(getattr(plan, attr), "known"), path
    assert GLOSSARY["deductible"]["plan_field"] == "plan.deductible_individual"
    assert GLOSSARY["annual_max"]["plan_field"] == "plan.annual_max"


# ---------- every definition: information only, no numbers, short, plain ----------
@pytest.mark.parametrize("key,style,text", list(_definitions()), ids=[f"{k}-{s}" for k, s, _ in _definitions()])
def test_definition_is_information_only_without_numbers(key, style, text):
    assert lint_text(text) == [], (key, style, lint_text(text))
    assert guard(text) == {"text": text, "dropped": []}, (key, style)
    assert not re.search(r"\d", text), (key, style, "digits")
    assert not MONEY_IN_TEXT.search(text), (key, style)
    assert not NUMBER_WORDS.search(text), (key, style, NUMBER_WORDS.search(text).group(0))
    assert "—" not in text and "{{" not in text and "{" not in text, (key, style)
    for banned in ("you should", "you must", "you need to", "best", "recommend", "save", "worth", "cheapest", "better plan"):
        assert banned not in text.lower(), (key, style, banned)


@pytest.mark.parametrize("key", list(GLOSSARY))
def test_simple_is_at_most_two_short_sentences_and_simpler_is_one_plainer_sentence(key):
    e = GLOSSARY[key]
    simple = [s for s in SENTENCES.split(e["simple"].strip()) if s]
    simpler = [s for s in SENTENCES.split(e["simpler"].strip()) if s]
    assert 1 <= len(simple) <= 2, (key, simple)
    assert len(simpler) == 1, (key, simpler)
    assert e["simple"].rstrip().endswith(".") and e["simpler"].rstrip().endswith("."), key
    assert len(e["simpler"].split()) < len(e["simple"].split()), key
    assert all(len(s.split()) <= 30 for s in simple), key
    assert fk_grade(e["simple"]) <= 8.5, (key, round(fk_grade(e["simple"]), 1))
    assert fk_grade(e["simpler"]) <= 8.5, (key, round(fk_grade(e["simpler"]), 1))


def test_readability_with_the_assistants_own_check_when_it_exists():
    """The live-mode fallback uses a Flesch-Kincaid check in the assistant (grade above 9 -> template). Definitions stay under it."""
    from app import assistant
    fn = next((getattr(assistant, n) for n in ("fk_grade", "flesch_kincaid_grade", "readability_grade") if hasattr(assistant, n)), None)
    if fn is None:
        pytest.skip("app.assistant exposes no readability function yet; the local Flesch-Kincaid check above covers the glossary")
    for key, style, text in _definitions():
        assert fn(text) <= 9, (key, style, fn(text))


@pytest.mark.parametrize("key", list(GLOSSARY))
def test_each_definition_names_its_own_term_first(key):
    """The first glossary term a definition names is its own (so the answer is about what was asked)."""
    assert lookup_term(GLOSSARY[key]["simple"]) == key
    assert lookup_term(SENTENCES.split(GLOSSARY[key]["simple"].strip())[0]) == key
    assert lookup_term(GLOSSARY[key]["simpler"]) == key


# ---------- agreement with the repo's documents and engine ----------
def test_rule_codes_map_to_glossary_entries():
    assert set(TERM_FOR_RULE) >= {"D", "CO", "M", "N", "AB", "X", "W", "F"}
    assert set(TERM_FOR_RULE) >= set(RULE_FROM_STEP_KEY.values())
    for rule, key in TERM_FOR_RULE.items():
        assert key in GLOSSARY, (rule, key)


def test_copay_definition_matches_the_plan_documents():
    """Every plan in fixtures/plans states a plan share per class (no flat copay), which is what the copay entry and note say."""
    for f in sorted((ROOT / "fixtures/plans").glob("*.json")):
        plan = json.loads(f.read_text())
        assert plan["classes"], f.name
        for c in plan["classes"]:
            assert "plan_share_bp_in" in c and "copay" not in json.dumps(c).lower(), (f.name, c.get("name"))
    assert "plan share" in GLOSSARY["copay"]["simple"] and "plan share" in GLOSSARY["copay"]["simpler"]
    assert lint_text(COPAY_PLAN_NOTE) == [] and not re.search(r"\d", COPAY_PLAN_NOTE)


def test_definitions_agree_with_engine_wording():
    """The engine says a network adjustment is not owed by you, the annual maximum does not limit what you may owe, and a not-covered line
    is the full fee as your share: the plain words say the same."""
    assert "no one pays" in GLOSSARY["network_adjustment"]["simpler"] or "Nobody pays" in GLOSSARY["network_adjustment"]["simple"]
    assert "you pay the rest" in GLOSSARY["annual_max"]["simple"]
    assert "full cost" in GLOSSARY["exclusion"]["simple"]
    assert "not a promise" in GLOSSARY["predetermination"]["simple"]
    assert "starts over" in GLOSSARY["deductible"]["simple"]
    assert "some plans have no maximum" in GLOSSARY["annual_max"]["simple"]          # FM26H: 'Unlimited'


# ---------- lookup_term ----------
@pytest.mark.parametrize("message,expected", [
    ("What is a deductible?", "deductible"),
    ("WHAT IS A DEDUCTIBLE", "deductible"),
    ("whats my deductable", "deductible"),                         # typo
    ("deductibles?", "deductible"),                                # plural
    ("my plan's deductible", "deductible"),
    ("What does plan share mean?", "plan_share"),
    ("What does the plan’s share mean?", "plan_share"),       # curly possessive
    ("what is co-insurance", "plan_share"),
    ("coinsurance!!!", "plan_share"),
    ("What does 'allowed amount' mean?", "allowed_amount"),
    ("Allowed amounts", "allowed_amount"),
    ("what is the maximum allowable charge", "allowed_amount"),     # longest match beats "maximum"
    ("What is an annual maximum?", "annual_max"),
    ("How much of my yearly max is left?", "annual_max"),
    ("annual maximums", "annual_max"),
    ("What is a waiting period?", "waiting_period"),
    ("waiting-periods", "waiting_period"),
    ("What is a frequency limit?", "frequency_limit"),
    ("frequency limitations", "frequency_limit"),
    ("Is my dentist in-network?", "network"),
    ("out of network", "network"),
    ("Out-Of-Network dentists", "network"),
    ("what's an alternate benefit", "alternate_benefit"),
    ("least costly alternative treatment (LCAT)", "alternate_benefit"),
    ("Why was it not covered?", "exclusion"),
    ("exclusions", "exclusion"),
    ("What is a predetermination?", "predetermination"),
    ("pre-treatment estimates", "predetermination"),
    ("pretreatment estimate", "predetermination"),
    ("what's a premium", "premium"),
    ("What is an EOB?", "eob"),
    ("what is an e.o.b.", "eob"),
    ("explanation of benefits", "eob"),
    ("What is a CDT code?", "procedure_code"),
    ("procedure codes", "procedure_code"),
    ("copay", "copay"),
    ("What is a co-pay?", "copay"),
    ("co-payments", "copay"),
    ("What is balance billing?", "balance_billing"),
    ("balance-billed", "balance_billing"),
    ("When does the benefit year start?", "benefit_year"),
    ("benefit years", "benefit_year"),
    ("calendar year maximum", "annual_max"),                         # longest at the first position
    ("What does Type III mean?", "coverage_class"),
    ("dentists’ fees", "dentist_fee"),
    ("write-offs", "network_adjustment"),
    ("What is the deductible and the annual maximum?", "deductible"),  # earliest mention wins
    ("annual maximum and deductible", "annual_max"),
    ("\tDeductible\n", "deductible"),
])
def test_lookup_term(message, expected):
    assert lookup_term(message) == expected


@pytest.mark.parametrize("message", ["", "   ", "will it hurt", "how much do i owe", "why so expensive crown", "hello", "is it worth it",
                                     "?!.,'", "share", "the plan"])
def test_lookup_term_none(message):
    assert lookup_term(message) is None


def test_every_aka_finds_its_own_entry():
    for key, e in GLOSSARY.items():
        for phrase in [e["term"], *e["aka"]]:
            assert lookup_term(phrase) == key, (key, phrase, lookup_term(phrase))
            assert lookup_term(f"What does '{phrase.upper()}' mean?") == key, (key, phrase)


@pytest.mark.parametrize("filler", [
    "how much will the plan pay for my root canal and crown this year ",   # ordinary words
    "a." * 8,                                                              # dotted-acronym runs
    "plan's dentists' " * 3,                                               # possessives
    "&&&& '''' ---- ",                                                     # punctuation
    "x" * 60 + " ",                                                        # one long word
])
def test_lookup_term_is_linear_on_50kb(filler):
    big = (filler * (50_000 // len(filler) + 1))[:50_000]
    for text, expected in ((big, None), (big + " deductible", "deductible")):
        start = time.perf_counter()
        got = lookup_term(text)
        elapsed = time.perf_counter() - start
        assert got == expected, (filler[:20], got)
        assert elapsed < 1.0, (filler[:20], elapsed)
