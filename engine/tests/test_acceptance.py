"""Acceptance example from the design brief (synthetic, fictional plan) + processing-order check. Exact cents."""
from datetime import date

from fineprint_engine import (AlternateBenefit, ClassRule, Evidence, EstimateLine, MemberState, PlanModel, V, compute_ledger)


def fictional_plan():
    return PlanModel(
        plan_code="FX", title="Fictional acceptance plan", carrier_text="—", is_fictional=True,
        benefit_year_start_month=V(1, Evidence.DOC), deductible_individual=V(10000, Evidence.DOC), deductible_waived_classes=["Prev"],
        annual_max=V(100000, Evidence.DOC),
        classes=[ClassRule("Prev", V(10000, Evidence.DOC), V(10000, Evidence.DOC), []), ClassRule("Basic", V(8000, Evidence.DOC), V(8000, Evidence.DOC), []),
                 ClassRule("Major", V(5000, Evidence.DOC), V(5000, Evidence.DOC), [])],
        class_of={"crown": V("Major", Evidence.DOC), "filling": V("Basic", Evidence.DOC)},
        allowed_amounts={}, alternate_benefit=AlternateBenefit(Evidence.DOC, []), waiting_months=V({}, Evidence.DOC),
        oon_rule=V({"in": "accepts allowed", "out": "may bill difference"}, Evidence.DOC), dos_rule=V("completion", Evidence.DOC))


def state(ded, mx, network="in", allowed=None):
    return MemberState(V(ded, Evidence.USER), V(mx, Evidence.USER), V(network, Evidence.USER), V(24, Evidence.USER),
                       allowed_overrides={k: V(v, Evidence.USER) for k, v in (allowed or {}).items()})


def test_in_network_600():
    L = compute_ledger(fictional_plan(), [EstimateLine("crown", "Crown", "4", 120000, date(2026, 10, 20))], state(10000, 30000, allowed={"crown": 90000}))
    assert L.status == "estimate"
    line = L.lines[0]
    by_rule = {s.rule: s.cents for s in line.steps if s.owner == "patient"}
    assert by_rule["D"] == 10000 and by_rule["CO"] == 40000 and by_rule["M"] == 10000
    assert line.patient_cents == 60000 and line.plan_cents == 30000
    assert any(s.label.startswith("Network adjustment") and s.cents == 30000 for s in line.steps)


def test_out_of_network_900():
    L = compute_ledger(fictional_plan(), [EstimateLine("crown", "Crown", "4", 120000, date(2026, 10, 20))], state(10000, 30000, "out", {"crown": 90000}))
    assert L.lines[0].patient_cents == 90000 and L.lines[0].plan_cents == 30000


def test_processing_order_attribution_and_totals():
    lines = [EstimateLine("filling", "Filling", "19", 30000, date(2026, 10, 10)), EstimateLine("crown", "Crown", "4", 120000, date(2026, 10, 20))]
    st = state(10000, 30000, allowed={"filling": 25000, "crown": 90000})
    L = compute_ledger(fictional_plan(), lines, st)
    assert [l.patient_cents for l in L.lines] == [13000, 72000]
    assert L.patient_total_cents == 85000
    assert "Order affects" in L.order_note and "$850.00 either way" in L.order_note
    R = compute_ledger(fictional_plan(), list(reversed(lines)), st)
    assert [l.patient_cents for l in R.lines] == [60000, 25000] and R.patient_total_cents == 85000


def test_usage_unknown_is_unresolved_not_guessed():
    st = MemberState(V(None, Evidence.UNKNOWN), V(None, Evidence.UNKNOWN), V("in", Evidence.USER), V(24, Evidence.USER), allowed_overrides={"crown": V(90000, Evidence.USER)})
    L = compute_ledger(fictional_plan(), [EstimateLine("crown", "Crown", "4", 120000, date(2026, 10, 20))], st)
    assert L.status == "unresolved" and L.patient_total_cents is None
    assert "remaining deductible" in L.not_provided and "remaining annual maximum" in L.not_provided
