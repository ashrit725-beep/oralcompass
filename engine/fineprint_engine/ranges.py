"""Ranges from enumerated unknowns, and 'what moves these numbers' (dollar impact per unknown).

No distributions, no guesses: candidate values come from the document (deductible met or not; remaining maximum from 0 to
the stated maximum in $50 steps; ambiguous classes from the document's class list) or from the user's hypotheticals.
Movers are reported sorted by stitch/topic order in the UI; the impact column is informational only.
"""
from __future__ import annotations

from copy import deepcopy
from itertools import product
from typing import Callable

from .ledger import compute_ledger
from .models import Evidence, EstimateLine, MemberState, PlanModel, V


def candidate_values(plan: PlanModel, state: MemberState) -> dict[str, list]:
    cands: dict[str, list] = {}
    if not state.remaining_deductible.known and plan.deductible_individual.known:
        cands["remaining deductible"] = [0, plan.deductible_individual.value]
    if not state.remaining_max.known and plan.annual_max.known:
        step = 5000
        cands["remaining annual maximum"] = list(range(0, plan.annual_max.value + 1, step))
    if not state.network.known:
        cands["network status"] = ["in", "out"]
    if plan.waiting_months.known and plan.waiting_months.value and not state.enrolled_months.known:
        months = max(plan.waiting_months.value.values())
        cands["enrollment date"] = [months, 0]      # ≥ waiting period vs brand-new
    return cands


def _apply(state: MemberState, name: str, val) -> MemberState:
    s = deepcopy(state)
    if name == "remaining deductible":
        s.remaining_deductible = V(val, Evidence.ASSUMED)
    elif name == "remaining annual maximum":
        s.remaining_max = V(val, Evidence.ASSUMED)
    elif name == "network status":
        s.network = V(val, Evidence.ASSUMED)
    elif name == "enrollment date":
        s.enrolled_months = V(val, Evidence.ASSUMED)
    return s


def range_and_movers(plan: PlanModel, lines: list[EstimateLine], state: MemberState, dos_rule: str = "completion") -> dict:
    """Returns {'range': (min,max)|None, 'movers': [{'unknown', 'impact_cents', 'zero_impact'}], 'unresolved_reasons': [...]}.
    The range is over patient totals across all combinations of candidate values for the unknowns that have candidates.
    Unknowns without document-derived candidates (e.g. allowed amounts) stay unresolved and are listed."""
    cands = candidate_values(plan, state)
    names = list(cands)
    totals = []
    unresolved_reasons: set[str] = set()
    for combo in product(*[cands[n] for n in names]) if names else [()]:
        s = state
        for n, v in zip(names, combo):
            s = _apply(s, n, v)
        L = compute_ledger(plan, lines, s, dos_rule)
        if L.status == "estimate" and L.patient_total_cents is not None:
            totals.append(L.patient_total_cents)
        else:
            unresolved_reasons.update(L.flags or ["unresolved"])
    movers = []
    for n in names:
        vals = []
        for v in cands[n]:
            L = compute_ledger(plan, lines, _apply(state, n, v), dos_rule)
            if L.status == "estimate" and L.patient_total_cents is not None:
                vals.append(L.patient_total_cents)
        impact = (max(vals) - min(vals)) if len(vals) >= 2 else None
        movers.append({"unknown": n, "impact_cents": impact, "zero_impact": impact == 0})
    rng = (min(totals), max(totals)) if totals else None
    return {"range": rng, "movers": movers, "unresolved_reasons": sorted(unresolved_reasons)}
