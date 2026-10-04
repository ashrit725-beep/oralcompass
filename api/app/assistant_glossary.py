"""Plain-words glossary for the assistant's define_term intent (design point 4). Linted by tools/advice_lint.py.

GLOSSARY[key] = {"term", "aka", "simple", "simpler", "plan_field"}:
- term: the name shown to the reader.
- aka: other ways people write or say it (synonyms, the wording the plan documents in fixtures/ use, common misspellings). Matching is
  case-insensitive and tolerant of plurals, possessives, hyphens and punctuation (see lookup_term).
- simple: at most two short sentences in everyday words; the "plain" answer. The first sentence names the term and stands alone, so an
  answer can keep it and add the plan's own value after it ("Your plan's deductible is {{ref:0}}.") within two sentences.
- simpler: one even plainer sentence; the "Say it more simply" answer.
- plan_field: the plan model's money field that holds this plan's own value, as a field_ref path ("plan.<attribute>"), or None. When the
  plan states the value, the assistant adds a sentence such as "Your plan's deductible is {{ref:0}}." with the document's badge and stitch.
  Only money fields are named here (the client renders the ref as an amount); plan.annual_max_unlimited covers a plan with no maximum.

Rules for every definition: no numbers or amounts (figures come only from the engine as {{ref:n}} placeholders), no advice, no ranking,
no clinical words, accurate for US dental benefits and consistent with how the plan documents in fixtures/plans use the term and with the
engine's rule codes (D deductible, CO plan share, M annual maximum, N network and allowed amount, AB alternate benefit, X not covered,
W waiting period, F frequency limit).
"""
from __future__ import annotations

import re
from typing import Optional, TypedDict


class GlossaryEntry(TypedDict):
    term: str
    aka: list[str]
    simple: str
    simpler: str
    plan_field: Optional[str]


GLOSSARY: dict[str, GlossaryEntry] = {
    "deductible": {
        "term": "deductible",
        "aka": ["deductibles", "deductable", "deductibel", "deducible", "individual deductible", "family deductible", "yearly deductible",
                "annual deductible"],
        "simple": ("Your deductible is the first part of the bill that you pay. It starts over each year, and then the plan helps."),
        "simpler": "The deductible is what you pay first.",
        "plan_field": "plan.deductible_individual",
    },
    "plan_share": {
        "term": "plan share",
        "aka": ["plan share", "plan's share", "coinsurance", "co-insurance", "co insurance", "coinsurence", "covered percentage",
                "plan percentage", "benefit percentage", "percentage the plan pays"],
        "simple": ("Plan share is the part the plan pays, and coinsurance is the part you pay. Your plan has a list of both."),
        "simpler": "Plan share is the part the plan pays.",
        "plan_field": None,
    },
    "allowed_amount": {
        "term": "allowed amount",
        "aka": ["allowed amount", "alowed amount", "allowed ammount", "allowed charge", "allowed fee", "allowable charge", "maximum allowable charge", "maximum allowed charge",
                "mac", "plan allowance", "allowance", "negotiated fee", "contracted fee", "reasonable and customary", "r&c",
                "usual and customary", "usual customary and reasonable", "ucr"],
        "simple": ("The allowed amount is the price your plan uses for the work. It can be less than what the dentist asks."),
        "simpler": "The allowed amount is your plan's price.",
        "plan_field": None,
    },
    "annual_max": {
        "term": "annual maximum",
        "aka": ["annual maximum", "annual max", "yearly maximum", "yearly max", "maximum", "max", "benefit maximum", "maximum benefit",
                "calendar year maximum", "annual limit", "yearly limit", "plan maximum", "annual benefit maximum", "maximun", "maxium",
                "yearly maximun"],
        "simple": ("The annual maximum is the most the plan will pay in one year, and you pay the rest. But some plans have no maximum."),
        "simpler": "The annual maximum is the top the plan pays each year.",
        "plan_field": "plan.annual_max",
    },
    "waiting_period": {
        "term": "waiting period",
        "aka": ["waiting period", "wait period", "waiting time", "waiting periods"],
        "simple": ("A waiting period is the time after your plan starts. In that time, it does not pay for some work."),
        "simpler": "A waiting period is time before the plan pays.",
        "plan_field": None,
    },
    "frequency_limit": {
        "term": "frequency limit",
        "aka": ["frequency limit", "frequency limitation", "frequency", "frequency rule", "limit on how often", "how often the plan pays"],
        "simple": ("A frequency limit is how often the plan pays for the same work, like cleanings."),
        "simpler": "A frequency limit is how often the plan pays.",
        "plan_field": None,
    },
    "network": {
        "term": "in-network and out-of-network",
        "aka": ["in-network", "in network", "out-of-network", "out of network", "network", "network dentist", "participating dentist",
                "participating provider", "non-participating dentist", "nonparticipating dentist", "non-network", "ppo network", "provider network"],
        "simple": ("An in-network dentist has signed up with your plan. They take the plan's price as the whole price."),
        "simpler": "In-network dentists take your plan's price.",
        "plan_field": None,
    },
    "alternate_benefit": {
        "term": "alternate benefit",
        "aka": ["alternate benefit", "alternative benefit", "alternate benefits", "least costly alternative", "least expensive alternative",
                "least costly alternative treatment", "lcat", "less costly service", "less costly alternative", "alternate treatment",
                "downgrade", "downgrading"],
        "simple": ("An alternate benefit means the plan only pays what a cheaper fix would cost. You pay the rest."),
        "simpler": "An alternate benefit pays for a cheap fix.",
        "plan_field": None,
    },
    "exclusion": {
        "term": "not covered (exclusion)",
        "aka": ["not covered", "exclusion", "exclusions", "excluded", "non-covered", "noncovered", "uncovered", "limitations and exclusions"],
        "simple": ("Not covered means the plan pays nothing for that work. So you pay the full cost."),
        "simpler": "Not covered means you pay all of it.",
        "plan_field": None,
    },
    "predetermination": {
        "term": "pre-treatment estimate",
        "aka": ["pre-treatment estimate", "pretreatment estimate", "pre treatment estimate", "predetermination", "pre-determination",
                "pre determination", "predetermination of benefits", "pre-estimate", "preestimate"],
        "simple": ("A pre-treatment estimate is a note from your plan before the work. It says what the plan may pay, but it is not a promise."),
        "simpler": "A pre-treatment estimate is a note before the work.",
        "plan_field": None,
    },
    "premium": {
        "term": "premium",
        "aka": ["premium", "premiums", "monthly premium", "monthly cost of the plan", "plan cost per month"],
        "simple": ("The premium is what is paid to have the plan, like each month. It is not part of the price of any work."),
        "simpler": "The premium is the price to have the plan.",
        "plan_field": None,
    },
    "eob": {
        "term": "explanation of benefits (EOB)",
        "aka": ["explanation of benefits", "explanation of benefit", "eob", "eobs", "benefit statement", "benefits statement",
                "claim statement"],
        "simple": ("An explanation of benefits (EOB) is a note your plan sends after a visit. It shows who paid what."),
        "simpler": "An EOB is the plan's note after a visit.",
        "plan_field": None,
    },
    "procedure_code": {
        "term": "procedure code (CDT)",
        "aka": ["procedure code", "procedure codes", "cdt", "cdt code", "dental code", "billing code", "code", "ada code"],
        "simple": ("A procedure code is a short code for one kind of dental work. Dentists and plans both use it."),
        "simpler": "A procedure code is a short name for the work.",
        "plan_field": None,
    },
    "copay": {
        "term": "copay",
        "aka": ["copay", "co-pay", "co pay", "copayment", "co-payment", "co payment", "copays"],
        "simple": ("A copay is a set price you pay at each visit, not a plan share. The plans here use a plan share."),
        "simpler": "A copay is a set price per visit, not a plan share.",
        "plan_field": None,
    },
    "balance_billing": {
        "term": "balance billing",
        "aka": ["balance billing", "balance bill", "balance billed", "billed the difference", "surprise bill"],
        "simple": ("Balance billing is when a dentist bills you for the part over your plan's price."),
        "simpler": "Balance billing is a bill for the extra part.",
        "plan_field": None,
    },
    "benefit_year": {
        "term": "benefit year",
        "aka": ["benefit year", "plan year", "calendar year", "benefit period", "coverage year"],
        "simple": ("The benefit year is the year your plan uses to count what was used. Then the count starts over."),
        "simpler": "The benefit year is the plan's year.",
        "plan_field": None,
    },
    "coverage_class": {
        "term": "coverage class",
        "aka": ["coverage class", "class of service", "service class", "class i", "class ii", "class iii", "class a", "class b", "class c",
                "type i", "type ii", "type iii", "preventive services", "basic services", "major services", "preventive care",
                "basic care", "major care"],
        "simple": ("A coverage class is a group of dental work that the plan pays the same way."),
        "simpler": "A coverage class is a group of work.",
        "plan_field": None,
    },
    "network_adjustment": {
        "term": "network adjustment",
        "aka": ["network adjustment", "write off", "write-off", "writeoff", "network discount", "contractual adjustment"],
        "simple": ("A network adjustment is the part of an in-network price over what the plan allows. It comes off the bill, so no one pays it."),
        "simpler": "A network adjustment comes off the bill, so no one pays it.",
        "plan_field": None,
    },
    "out_of_pocket": {
        "term": "out of pocket",
        "aka": ["out of pocket", "out-of-pocket", "oop", "out of pocket cost", "out of pocket costs"],
        "simple": ("Out of pocket means the money you pay yourself. It is not paid by the plan."),
        "simpler": "Out of pocket is money from you.",
        "plan_field": None,
    },
    "claim": {
        "term": "claim",
        "aka": ["claim", "claims", "dental claim", "insurance claim"],
        "simple": ("A claim is the bill sent to your plan after the work. It asks the plan to pay its part."),
        "simpler": "A claim is the bill sent to your plan.",
        "plan_field": None,
    },
    "dentist_fee": {
        "term": "dentist's fee",
        "aka": ["dentist's fee", "dentist fee", "dentists fee", "submitted fee", "submitted charge", "usual fee", "full fee",
                "billed amount", "sticker price"],
        "simple": ("The dentist's fee is the price the dentist asks for the work. It is on the estimate."),
        "simpler": "The dentist's fee is the dentist's price.",
        "plan_field": None,
    },
}

# The engine's rule codes (ledger steps, assistant_templates.RULE_FROM_STEP_KEY) and the glossary entry that explains each in plain words.
TERM_FOR_RULE: dict[str, str] = {
    "D": "deductible", "CO": "plan_share", "M": "annual_max", "N": "allowed_amount", "AB": "alternate_benefit", "X": "exclusion",
    "W": "waiting_period", "F": "frequency_limit", "fee": "dentist_fee", "total": "out_of_pocket",
}

# Said in one sentence when a define_term answer is about a copay and the plan document states plan shares (design point 4).
COPAY_PLAN_NOTE = "This plan document lists a plan share for each kind of care, not a set copay."


# ---------- lookup ----------
_DOTTED_ACRONYM = re.compile(r"\b(?:[a-z]\.){2,}")          # "e.o.b." -> "eob"
_TOKEN = re.compile(r"[a-z0-9&]+(?:'[a-z]+)?")               # words, with one trailing apostrophe part ("plan's", "dentists'")


def _singular(tok: str) -> str:
    """A light, deterministic plural folding applied to BOTH the message and the glossary phrases, so only consistency matters."""
    if len(tok) <= 3:
        return tok
    if tok.endswith("ies"):
        return tok[:-3] + "y"
    if tok.endswith("sses"):
        return tok[:-2]
    if tok.endswith(("xes", "ches", "shes")):
        return tok[:-2]
    if tok.endswith("s") and not tok.endswith(("ss", "us", "is")):
        return tok[:-1]
    return tok


def _tokens(text: str) -> list[str]:
    """Lower-case word tokens with possessives removed and plurals folded. One pass of each linear regex over the text."""
    low = (text or "").lower().replace("’", "'").replace("‘", "'").replace("`", "'")
    low = _DOTTED_ACRONYM.sub(lambda m: m.group(0).replace(".", ""), low)
    out = []
    for m in _TOKEN.finditer(low):
        tok = m.group(0)
        if "'" in tok:
            head, tail = tok.split("'", 1)
            tok = head if tail in ("s", "") else head + tail      # "plan's" -> "plan"; "don't" -> "dont"
        if tok.endswith("'"):
            tok = tok[:-1]
        if tok:
            out.append(_singular(tok))
    return out


def _build_index() -> tuple[dict[tuple[str, ...], str], int]:
    index: dict[tuple[str, ...], str] = {}
    for key, entry in GLOSSARY.items():
        for phrase in [entry["term"], *entry["aka"]]:
            toks = tuple(_tokens(phrase))
            if toks and toks not in index:                      # the first entry to claim a phrase keeps it (dict order)
                index[toks] = key
    return index, max(len(k) for k in index)


_INDEX, _MAX_PHRASE = _build_index()


def lookup_term(message: str) -> Optional[str]:
    """The glossary key the message names, or None. The earliest mention wins; at one position the longest phrase wins
    ("maximum allowable charge" is the allowed amount, not the annual maximum). Linear in the message length: one tokenizing pass,
    then at most _MAX_PHRASE dictionary lookups per token."""
    toks = _tokens(message)
    n = len(toks)
    for i in range(n):
        for length in range(min(_MAX_PHRASE, n - i), 0, -1):
            key = _INDEX.get(tuple(toks[i:i + length]))
            if key is not None:
                return key
    return None


def term_entry(key: str) -> Optional[GlossaryEntry]:
    return GLOSSARY.get(key)
