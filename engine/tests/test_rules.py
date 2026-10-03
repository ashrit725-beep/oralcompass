"""Rule semantics from the research: frequency clocks, benefit-year straddle with date-of-service scenarios, excluded service."""
from datetime import date

from oralcompass_engine import (AlternateBenefit, ClassRule, Evidence, EstimateLine, FrequencyRule, MemberState, PlanModel, V, compute_ledger)


def plan(clock, **kw):
    return PlanModel(
        plan_code="T", title="test", carrier_text="", is_fictional=True,
        benefit_year_start_month=V(kw.get("start", 1), Evidence.DOC), deductible_individual=V(5000, Evidence.DOC), deductible_waived_classes=["Prev"],
        annual_max=V(150000, Evidence.DOC),
        classes=[ClassRule("Prev", V(10000, Evidence.DOC), V(10000, Evidence.DOC), []), ClassRule("Major", V(5000, Evidence.DOC), V(5000, Evidence.DOC), [])],
        class_of={"cleaning": V("Prev", Evidence.DOC), "crown": V("Major", Evidence.DOC), "implant": V("Major", Evidence.DOC)},
        allowed_amounts={"cleaning": V(10700, Evidence.DOC), "crown": V(145400, Evidence.DOC), "cast": V(110000, Evidence.DOC), "implant": V(227100, Evidence.DOC)},
        alternate_benefit=AlternateBenefit(Evidence.DOC, [{"procedure_key": "crown", "condition": "mandibular_molar", "basis_key": "cast"}]),
        waiting_months=V({}, Evidence.DOC), frequency=[FrequencyRule("cleaning", clock, 2 if clock != "interval_months" else 6)],
        excluded={"implant": V(True, Evidence.DOC)}, oon_rule=V({"in": "", "out": ""}, Evidence.DOC), dos_rule=V("completion", Evidence.DOC))


def st(**kw):
    return MemberState(V(kw.get("ded", 0), Evidence.USER), V(kw.get("mx", 150000), Evidence.USER), V("in", Evidence.USER), V(24, Evidence.USER),
                       history=kw.get("hist", {}))


def test_frequency_clocks_differ():
    hist = {"cleaning": [date(2026, 6, 20)]}
    nov1 = [EstimateLine("cleaning", "Cleaning", None, 10700, date(2026, 11, 1))]
    assert compute_ledger(plan("calendar_count"), nov1, st(hist=hist)).patient_total_cents == 0           # 1 of 2 used this calendar year
    L = compute_ledger(plan("interval_months"), nov1, st(hist=hist))
    assert L.patient_total_cents == 10700 and "next covered date 2026-12-20" in L.lines[0].steps[0].label
    dec21 = [EstimateLine("cleaning", "Cleaning", None, 10700, date(2026, 12, 21))]
    assert compute_ledger(plan("interval_months"), dec21, st(hist=hist)).patient_total_cents == 0


def test_benefit_year_straddle_and_dos_rule():
    p = plan("calendar_count")
    rct = EstimateLine("crown", "Crown A", "30", 145400, date(2026, 12, 10), date(2026, 11, 20))     # same year
    jan = EstimateLine("crown", "Crown B", "30", 145400, date(2027, 1, 8), date(2026, 12, 12))       # straddles
    s = st(ded=5000, mx=70000)
    dec = compute_ledger(p, [rct], s)
    assert dec.lines[0].benefit_year == 2026
    comp = compute_ledger(p, [jan], s, dos_rule="completion")
    prep = compute_ledger(p, [jan], s, dos_rule="prep")
    assert comp.lines[0].benefit_year == 2027 and prep.lines[0].benefit_year == 2026
    # completion rule: new year -> new full max and new deductible (state carries 2026 values; a real app re-keys per year)


def test_excluded_service_is_patient_full_fee():
    L = compute_ledger(plan("calendar_count"), [EstimateLine("implant", "Implant", "14", 227100, date(2026, 10, 1))], st())
    assert L.lines[0].status == "not_covered" and L.lines[0].patient_cents == 227100 and L.lines[0].plan_cents == 0


def test_policy_year_start_month():
    p = plan("calendar_count", start=7)
    L = compute_ledger(p, [EstimateLine("crown", "Crown", "4", 145400, date(2026, 12, 10))], st(ded=5000))
    assert L.lines[0].benefit_year == 2026      # July 2026 – June 2027 benefit year keyed as 2026
