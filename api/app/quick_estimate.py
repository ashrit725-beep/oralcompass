"""procedure_cost: what one procedure costs on one plan, from the engine. Information only; no advice.

The dentist's price is the typical price from fixtures/fee_benchmarks.json (ASSUMED, "Our guess of the price"); benefits are the person's
records when the chosen plan is their journey plan, otherwise "nothing used yet this year" (ASSUMED). The engine does all the math.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

from oralcompass_engine import Evidence, EstimateLine, MemberState, V, compute_ledger
from oralcompass_engine.models import PlanModel

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"

# everyday words -> internal procedure key (longest phrase wins; typos covered by a small edit-distance match)
ALIASES = {
    "deep cleaning": "scaling_root_planing", "scaling and root planing": "scaling_root_planing", "scaling": "scaling_root_planing",
    "root canal": "root_canal_molar", "rootcanal": "root_canal_molar",
    "pulling a tooth": "extraction_simple", "pull a tooth": "extraction_simple", "tooth pulled": "extraction_simple", "pulled": "extraction_simple",
    "wisdom tooth": "extraction_surgical", "surgical extraction": "extraction_surgical", "extraction": "extraction_simple", "extract": "extraction_simple",
    "night guard": "night_guard", "nightguard": "night_guard", "mouth guard": "night_guard", "grinding guard": "night_guard",
    "metal crown": "cast_crown", "gold crown": "cast_crown", "crown": "crown", "cap": "crown",
    "silver filling": "amalgam", "amalgam": "amalgam", "white filling": "composite", "filling": "composite", "cavity": "composite",
    "x-rays": "bitewing_xrays", "x-ray": "bitewing_xrays", "xrays": "bitewing_xrays", "xray": "bitewing_xrays", "bitewing": "bitewing_xrays",
    "checkup": "exam", "check-up": "exam", "check up": "exam", "exam": "exam", "evaluation": "exam",
    "cleaning": "cleaning", "teeth cleaning": "cleaning", "fluoride": "fluoride_child", "sealant": "sealant", "sealants": "sealant",
    "dentures": "denture_partial", "denture": "denture_partial", "partial": "denture_partial",
    "implant": "implant", "implants": "implant",
}
# words with no internal procedure: matched so the answer can say so plainly
UNPRICED = {"bridge": "bridge", "braces": "braces", "veneer": "veneer", "whitening": "whitening"}

PLAIN_NAMES = {
    "exam": "a checkup", "cleaning": "a cleaning", "bitewing_xrays": "x-rays", "fluoride_child": "fluoride for a child", "sealant": "a sealant",
    "composite": "a filling", "amalgam": "a silver filling", "extraction_simple": "pulling a tooth", "extraction_surgical": "pulling a hard tooth",
    "scaling_root_planing": "a deep cleaning", "root_canal_molar": "a root canal", "crown": "a crown", "cast_crown": "a metal crown",
    "denture_partial": "a partial denture", "implant": "an implant", "night_guard": "a night guard",
}

_TOKEN = re.compile(r"[a-z][a-z\-]*")


def _edit1(a: str, b: str) -> bool:
    """True when a and b differ by at most one edit (insert, delete, swap of neighbours, or change)."""
    if a == b:
        return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    if la == lb:
        diff = [i for i in range(la) if a[i] != b[i]]
        return len(diff) == 1 or (len(diff) == 2 and diff[1] == diff[0] + 1 and a[diff[0]] == b[diff[1]] and a[diff[1]] == b[diff[0]])
    if la > lb:
        a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]:
        i += 1
    return a[i:] == b[i + 1:]


def match_procedure(message: str) -> Optional[str]:
    """The internal procedure key the question names, 'unpriced:<word>' for a known word with no price, or None."""
    low = " " + re.sub(r"[^a-z\- ]", " ", (message or "").lower()) + " "
    low = re.sub(r"\s+", " ", low)
    for phrase in sorted(ALIASES, key=len, reverse=True):
        if f" {phrase} " in low or (" " in phrase and phrase in low):
            return ALIASES[phrase]
    for w in UNPRICED:
        if f" {w} " in low or f" {w}s " in low:
            return f"unpriced:{w}"
    words = _TOKEN.findall(low)
    singles = [p for p in ALIASES if " " not in p and len(p) >= 5]
    for w in words:
        if len(w) < 5:
            continue
        for p in sorted(singles, key=len, reverse=True):
            if _edit1(w, p):
                return ALIASES[p]
    pairs = [" ".join(words[i:i + 2]) for i in range(len(words) - 1)]
    for pw in pairs:
        for p in ALIASES:
            if " " in p and len(p) >= 8 and _edit1(pw, p):
                return ALIASES[p]
    return None


@lru_cache(maxsize=1)
def _benchmarks() -> dict:
    codes = {i["procedure_key"]: i.get("primary_code") for i in json.loads((FIXTURES / "procedure_codes.json").read_text())["items"]}
    rows = json.loads((FIXTURES / "fee_benchmarks.json").read_text())["rows"]
    by_code: dict[str, int] = {}
    for r in rows:
        if r.get("code") and isinstance(r.get("rate_cents"), int) and r["code"] not in by_code:
            by_code[r["code"]] = r["rate_cents"]
    procs = {i["key"]: i for i in json.loads((FIXTURES / "procedures.json").read_text())["items"]}
    out = {}
    for key, p in procs.items():
        cents = by_code.get(codes.get(key) or "")
        out[key] = {"cents": cents if cents is not None else p.get("dentist_fee_cents"), "name": p.get("name", key)}
    return out


def typical_fee(key: str) -> Optional[int]:
    row = _benchmarks().get(key)
    return row["cents"] if row else None


def fresh_state(plan: PlanModel) -> MemberState:
    """'Nothing used yet this year' (ASSUMED): the whole deductible and the whole yearly limit are still there; in network."""
    def full(v):
        return V(v.value, Evidence.ASSUMED) if getattr(v, "known", False) else V(None, Evidence.UNKNOWN)
    return MemberState(full(plan.deductible_individual), full(plan.annual_max), V("in", Evidence.ASSUMED), V(24, Evidence.ASSUMED))


def estimate(plan: PlanModel, key: str, state: Optional[MemberState] = None) -> dict:
    """One line through the engine. Returns {fee, plan, patient} cents (None when the engine leaves a figure open) and the line status."""
    fee = typical_fee(key)
    if fee is None:
        return {"fee": None, "plan": None, "patient": None, "status": "unresolved"}
    st = state or fresh_state(plan)
    if key not in st.allowed_overrides:              # the typical price stands in for the plan's allowed amount too (ASSUMED)
        st.allowed_overrides = {**st.allowed_overrides, key: V(fee, Evidence.ASSUMED)}
    ledger = compute_ledger(plan, [EstimateLine(key, PLAIN_NAMES.get(key, key), None, fee)], st)
    line = ledger.lines[0] if ledger.lines else None
    return {"fee": fee, "plan": getattr(line, "plan_cents", None), "patient": getattr(line, "patient_cents", None),
            "status": getattr(line, "status", "unresolved"), "plan_is_upper_bound": bool(getattr(line, "plan_is_upper_bound", False))}
