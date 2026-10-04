"""Plain-words glossary for the assistant's define_term intent (design point 4). Linted by tools/advice_lint.py.

GLOSSARY[key] = {"term", "aka", "simple", "simpler", "plan_field"}:
- term: the name shown to the reader.
- aka: other ways people write or say it (synonyms, the wording the plan documents in fixtures/ use, common misspellings). Matching is
  case-insensitive and tolerant of plurals, possessives, hyphens and punctuation (see lookup_term).
- simple: at most two short sentences in everyday words; the "plain" answer.
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
        "simple": ("Your deductible is the part of the bill you pay yourself before the plan starts to pay. "
                   "It starts over each benefit year, and some plans skip it for some care, such as cleanings."),
        "simpler": "The deductible is what you pay first, before the plan pays anything.",
        "plan_field": "plan.deductible_individual",
    },
    "plan_share": {
        "term": "plan share",
        "aka": ["plan share", "plan's share", "coinsurance", "co-insurance", "co insurance", "coinsurence", "covered percentage",
                "plan percentage", "benefit percentage", "percentage the plan pays"],
        "simple": ("Plan share is the part of the allowed amount the plan pays, written as a percentage. "
                   "The rest is your part, often called coinsurance, and the split can differ for cleanings, fillings and crowns."),
        "simpler": "Plan share is the part the plan pays, and the rest is yours to pay.",
        "plan_field": None,
    },
    "allowed_amount": {
        "term": "allowed amount",
        "aka": ["allowed amount", "allowed charge", "allowed fee", "allowable charge", "maximum allowable charge", "maximum allowed charge",
                "mac", "plan allowance", "allowance", "negotiated fee", "contracted fee", "reasonable and customary", "r&c",
                "usual and customary", "usual customary and reasonable", "ucr"],
        "simple": ("The allowed amount is the price your plan counts for a service, which can be lower than what the dentist charges. "
                   "Your part and the plan's part are worked out from this price, not from the dentist's charge."),
        "simpler": "The allowed amount is the price your plan agrees to count for the work.",
        "plan_field": None,
    },
    "annual_max": {
        "term": "annual maximum",
        "aka": ["annual maximum", "annual max", "yearly maximum", "yearly max", "maximum", "max", "benefit maximum", "maximum benefit",
                "calendar year maximum", "annual limit", "yearly limit", "plan maximum", "annual benefit maximum"],
        "simple": ("The annual maximum is the most the plan will pay for your care in one benefit year. "
                   "Once the plan has paid that much, you pay the rest of the cost until the year starts over, and some plans have no maximum."),
        "simpler": "The annual maximum is the most the plan pays in a year, and after that you pay.",
        "plan_field": "plan.annual_max",
    },
    "waiting_period": {
        "term": "waiting period",
        "aka": ["waiting period", "wait period", "waiting time", "waiting periods"],
        "simple": ("A waiting period is a stretch of time after your coverage starts when the plan does not yet pay for some kinds of care. "
                   "It often applies to bigger work, such as crowns, and care done before it ends is not paid by the plan."),
        "simpler": "A waiting period is the time after you join before the plan pays for some care.",
        "plan_field": None,
    },
    "frequency_limit": {
        "term": "frequency limit",
        "aka": ["frequency limit", "frequency limitation", "frequency", "frequency rule", "limit on how often", "how often the plan pays"],
        "simple": ("A frequency limit is how often the plan will pay for the same kind of care, such as how many cleanings a year it covers. "
                   "If you have that care again sooner, the plan does not pay for the extra visit."),
        "simpler": "A frequency limit is how often the plan pays for the same kind of care.",
        "plan_field": None,
    },
    "network": {
        "term": "in-network and out-of-network",
        "aka": ["in-network", "in network", "out-of-network", "out of network", "network", "network dentist", "participating dentist",
                "participating provider", "non-participating dentist", "nonparticipating dentist", "non-network", "ppo network", "provider network"],
        "simple": ("An in-network dentist has signed up with your plan and takes its allowed amount as the full price. "
                   "An out-of-network dentist has not, so they may bill you for more than that."),
        "simpler": "In-network dentists take your plan's price, and out-of-network dentists may charge more.",
        "plan_field": None,
    },
    "alternate_benefit": {
        "term": "alternate benefit",
        "aka": ["alternate benefit", "alternative benefit", "alternate benefits", "least costly alternative", "least expensive alternative",
                "least costly alternative treatment", "lcat", "less costly service", "less costly alternative", "alternate treatment",
                "downgrade", "downgrading"],
        "simple": ("An alternate benefit means the plan pays only what a less costly treatment for the same problem would cost, such as "
                   "a metal crown in place of a white one. You pay the difference between the two."),
        "simpler": "The plan pays the price of a less costly option, and you pay the difference.",
        "plan_field": None,
    },
    "exclusion": {
        "term": "not covered (exclusion)",
        "aka": ["not covered", "exclusion", "exclusions", "excluded", "non-covered", "noncovered", "uncovered", "limitations and exclusions"],
        "simple": ("Not covered means the plan pays nothing for that kind of care, so you pay the full cost. "
                   "The plan document lists these, often in a part called exclusions."),
        "simpler": "Not covered means the plan pays nothing for it, so you pay all of it.",
        "plan_field": None,
    },
    "predetermination": {
        "term": "pre-treatment estimate",
        "aka": ["pre-treatment estimate", "pretreatment estimate", "pre treatment estimate", "predetermination", "pre-determination",
                "pre determination", "predetermination of benefits", "pre-estimate", "preestimate"],
        "simple": ("A pre-treatment estimate (or predetermination) is a note from your plan, before the work is done, about what it "
                   "expects to pay. It is not a promise, and the plan decides when the claim comes in."),
        "simpler": "A pre-treatment estimate is the plan's note, before the work, about what it may pay.",
        "plan_field": None,
    },
    "premium": {
        "term": "premium",
        "aka": ["premium", "premiums", "monthly premium", "monthly cost of the plan", "plan cost per month"],
        "simple": ("The premium is what you or your employer pay to have the plan, often each month or each paycheck. "
                   "It is paid even in months with no dental visits, and it does not count toward your deductible."),
        "simpler": "The premium is the regular price of having the plan, even when you have no visits.",
        "plan_field": None,
    },
    "eob": {
        "term": "explanation of benefits (EOB)",
        "aka": ["explanation of benefits", "explanation of benefit", "eob", "eobs", "benefit statement", "benefits statement",
                "claim statement"],
        "simple": ("An explanation of benefits (EOB) is the note your plan sends after a claim. "
                   "It shows the dentist's charge, what the plan paid and what is left for you to pay."),
        "simpler": "An EOB is the plan's note after a visit that shows who paid what.",
        "plan_field": None,
    },
    "procedure_code": {
        "term": "procedure code (CDT)",
        "aka": ["procedure code", "procedure codes", "cdt", "cdt code", "dental code", "billing code", "code", "ada code"],
        "simple": ("A procedure code is a short code that names one kind of dental work, taken from a list called CDT. "
                   "OralCompass shows a code only when your own estimate or a plan document prints it."),
        "simpler": "A procedure code is the short name dentists and plans use for each kind of dental work.",
        "plan_field": None,
    },
    "copay": {
        "term": "copay",
        "aka": ["copay", "co-pay", "co pay", "copayment", "co-payment", "co payment", "copays"],
        "simple": ("A copay is a set price you pay for a service, the same each time. "
                   "The plans in OralCompass use a plan share instead: the plan pays a part of the cost and you pay the rest."),
        "simpler": "A copay is a set price per visit, and the plans here use a plan share instead.",
        "plan_field": None,
    },
    "balance_billing": {
        "term": "balance billing",
        "aka": ["balance billing", "balance bill", "balance billed", "billed the difference", "surprise bill"],
        "simple": ("Balance billing is when a dentist bills you for the part of the charge above what your plan allows. "
                   "In-network dentists agree not to do this for covered care, and out-of-network dentists may."),
        "simpler": "Balance billing is when a dentist outside your network bills you for what the plan does not count.",
        "plan_field": None,
    },
    "benefit_year": {
        "term": "benefit year",
        "aka": ["benefit year", "plan year", "calendar year", "benefit period", "coverage year"],
        "simple": ("The benefit year is the year your plan uses to count your deductible and yearly maximum. "
                   "For many plans it runs from January to December, and both start over when a new one begins."),
        "simpler": "The benefit year is the plan's year, and your deductible starts over when a new one begins.",
        "plan_field": None,
    },
    "coverage_class": {
        "term": "coverage class",
        "aka": ["coverage class", "class of service", "service class", "class i", "class ii", "class iii", "class a", "class b", "class c",
                "type i", "type ii", "type iii", "preventive services", "basic services", "major services", "preventive care",
                "basic care", "major care"],
        "simple": ("Plans sort dental care into groups, often called classes or types, such as preventive, basic and major. "
                   "Each group has its own plan share, so a crown and a cleaning can be paid differently."),
        "simpler": "A coverage class is a group of dental care that the plan pays the same way.",
        "plan_field": None,
    },
    "network_adjustment": {
        "term": "network adjustment",
        "aka": ["network adjustment", "write off", "write-off", "writeoff", "network discount", "contractual adjustment"],
        "simple": ("A network adjustment is the part of an in-network dentist's charge above the allowed amount. "
                   "Nobody pays it: the dentist agreed to take it off the bill."),
        "simpler": "A network adjustment is the amount an in-network dentist takes off the bill, so no one pays it.",
        "plan_field": None,
    },
    "out_of_pocket": {
        "term": "out of pocket",
        "aka": ["out of pocket", "out-of-pocket", "oop", "out of pocket cost", "out of pocket costs"],
        "simple": ("Out of pocket means the money you pay yourself, not the plan. "
                   "In OralCompass it is the amount shown as what you pay."),
        "simpler": "Out of pocket is the money that comes from you, not the plan.",
        "plan_field": None,
    },
    "claim": {
        "term": "claim",
        "aka": ["claim", "claims", "dental claim", "insurance claim"],
        "simple": ("A claim is the bill sent to your plan after care, asking it to pay its part. "
                   "Your dentist's office usually sends it, and the plan answers with an explanation of benefits."),
        "simpler": "A claim is the bill sent to your plan so it pays its part.",
        "plan_field": None,
    },
    "dentist_fee": {
        "term": "dentist's fee",
        "aka": ["dentist's fee", "dentist fee", "dentists fee", "submitted fee", "submitted charge", "usual fee", "full fee",
                "billed amount", "sticker price"],
        "simple": ("The dentist's fee is the price the dentist charges, as written on the estimate. "
                   "The plan works from its allowed amount, which can be lower than this fee."),
        "simpler": "The dentist's fee is the price the dentist asks for the work.",
        "plan_field": None,
    },
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
