"""Baseline formula from the team's master prompt (docs/MASTER_PROMPT_UPLOADED.md §12) — an explicitly synthetic fixture, not any plan's fact:
allowed $200, remaining deductible $50, insurer 80% after deductible, sufficient maximum → insurer $120, member $80 (deductible inside, never added twice);
with a remaining insurer maximum of $60 → insurer $60, member $140."""
from datetime import date

from oralcompass_engine import (AlternateBenefit, ClassRule, EstimateLine, Evidence, MemberState, PlanModel, V, compute_ledger)


def synthetic_plan() -> PlanModel:
    basic = ClassRule("Basic", V(8000, Evidence.USER), V(8000, Evidence.USER), ["fillings"])
    return PlanModel("SYN", "Synthetic fixture plan (not a real plan)", "none", True, V(1, Evidence.USER), V(5000, Evidence.USER), [], V(100000, Evidence.USER),
                     [basic], {"composite": V("Basic", Evidence.USER)}, {"composite": V(20000, Evidence.USER)}, AlternateBenefit(Evidence.USER, []),
                     V({}, Evidence.USER))


def state(max_left: int) -> MemberState:
    return MemberState(V(5000, Evidence.USER), V(max_left, Evidence.USER), V("in", Evidence.USER), V(12, Evidence.USER))


LINE = [EstimateLine("composite", "Filling", "19", 20000, date(2026, 10, 20))]


def test_baseline_insurer_120_member_80():
    L = compute_ledger(synthetic_plan(), LINE, state(100000))
    assert (L.plan_total_cents, L.patient_total_cents) == (12000, 8000)
    steps = {s.rule: s.cents for s in L.lines[0].steps if s.owner == "patient"}
    assert steps["D"] == 5000 and steps["CO"] == 3000          # member = D + coinsurance share; deductible counted once


def test_capped_insurer_60_member_140():
    L = compute_ledger(synthetic_plan(), LINE, state(6000))
    assert (L.plan_total_cents, L.patient_total_cents) == (6000, 14000)
    assert any(s.rule == "M" and s.cents == 6000 for s in L.lines[0].steps)
