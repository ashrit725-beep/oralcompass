"""Real presets built from cited sources (tools/ingest_sources.py): rule behaviour the engine must show, never assume."""
from datetime import date

from oralcompass_engine import Evidence, EstimateLine, MemberState, V, compute_ledger, load_fixture_set
from oralcompass_engine.rules import coverage_rules

PLANS, _, _ = load_fixture_set()
CROWN = [EstimateLine("crown", "Crown tooth 19", "19", 125000, date(2026, 11, 24), date(2026, 11, 10))]
RCT = [EstimateLine("root_canal_molar", "Root canal tooth 19", "19", 115000, date(2026, 10, 27))]


def state(net="in", ded=0, mx=126000, months=33, **allowed):
    return MemberState(V(ded, Evidence.USER), V(mx, Evidence.USER), V(net, Evidence.USER), V(months, Evidence.USER),
                       allowed_overrides={k: V(v, Evidence.USER) for k, v in allowed.items()})


def test_ncflex_classic_rules_are_cited_to_the_2026_guide():
    ml = PLANS["ML26"]
    rows = {r["procedure_key"]: r for r in coverage_rules(ml, ["crown", "root_canal_molar", "night_guard", "scaling_root_planing"])}
    assert rows["crown"]["plan_pays_pct"] == 50 and rows["crown"]["coverage_cite"]["page"] == 25
    assert rows["root_canal_molar"]["plan_pays_pct"] == 60 and rows["root_canal_molar"]["deductible_applies"] is True
    assert rows["night_guard"]["covered"] is False and "bruxism" in rows["night_guard"]["exclusion"]["cite"]["quote"]
    assert rows["scaling_root_planing"]["category_status"] == "AMBIGUOUS" and rows["scaling_root_planing"]["plan_pays_pct"] == 50
    L = compute_ledger(ml, RCT + CROWN, state(crown=102000, root_canal_molar=98000))
    assert (L.patient_total_cents, L.plan_total_cents) == (90200, 109800)
    assert ml.premium_monthly["employee_only"].value == 3794 and ml.premium_monthly["employee_only"].cite.page_start == 24


def test_ncflex_low_option_excludes_major_services_as_printed():
    L = compute_ledger(PLANS["ML26L"], CROWN, state(crown=102000))
    assert L.lines[0].status == "not_covered" and L.lines[0].steps[0].stitch == "ML26#p25"   # stitch scope = the DOCUMENT label (the same guide backs all three options)


def test_delta_msu_waiting_period_is_procedure_scoped_and_ambiguous_for_crowns():
    dd = PLANS["DD24"]
    L = compute_ledger(dd, CROWN, state(ded=5000, mx=150000, months=6, crown=100000))
    assert L.lines[0].status == "not_covered" and any("AMBIGUOUS" in f for f in L.flags)        # 12-month wait applied to crowns, flagged
    ext = [EstimateLine("extraction_simple", "Extraction tooth 1", "1", 26000, date(2026, 10, 20))]
    L2 = compute_ledger(dd, ext, state(ded=5000, mx=150000, months=6, extraction_simple=20000))
    assert L2.lines[0].status == "estimate"                                                     # oral surgery is not named in the waiting-period sentence
    L3 = compute_ledger(dd, CROWN, state(ded=0, mx=150000, months=24, crown=100000))
    assert L3.lines[0].plan_is_upper_bound and any("alternate benefit applies" in f for f in L3.flags)   # mandibular molar: Optional Services clause, allowance not stated


def test_fedvip_unlimited_maximum_and_separate_out_of_network_limits():
    fm = PLANS["FM26H"]
    L = compute_ledger(fm, CROWN, MemberState(V(0, Evidence.USER), V(None, Evidence.UNKNOWN), V("in", Evidence.USER), V(12, Evidence.USER), allowed_overrides={"crown": V(100000, Evidence.USER)}))
    assert L.status == "estimate" and L.lines[0].plan_cents == 50000 and any("unlimited" in f for f in L.flags)
    assert any("alternate-benefit clause" in f for f in L.flags)                                 # clause present, scope not readable → flagged
    fd = PLANS["FD26S"]
    out = compute_ledger(fd, CROWN, state(net="out", ded=0, mx=150000, crown=100000))
    assert out.status == "unresolved" and "remaining out-of-network deductible" in out.not_provided and "remaining out-of-network annual maximum" in out.not_provided
    st = state(net="out", ded=0, mx=150000, crown=100000); st.remaining_deductible_out = V(7500, Evidence.USER); st.remaining_max_out = V(100000, Evidence.USER)
    out2 = compute_ledger(fd, CROWN, st)
    # out-of-network Standard: $75 deductible, you pay 80% of the allowance, plus $250 above the allowance
    assert out2.status == "estimate" and out2.lines[0].patient_cents == 25000 + 7500 + round((100000 - 7500) * 0.8) and out2.lines[0].steps[1].stitch == "FD26#p15"
    unresolved = compute_ledger(fd, [EstimateLine("implant", "Implant tooth 19", "19", 230000, date(2026, 12, 1))], state(implant=200000))
    assert unresolved.lines[0].status == "unresolved" and "not stated in this document" in unresolved.lines[0].flags[0]   # implant class unreadable → never guessed
