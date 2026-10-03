"""The ONE demo fixture (spec §7): every number shown in the demo and the comparison beat must equal these."""
from copy import deepcopy

from fineprint_engine import Evidence, MemberState, V, compare, compute_ledger, load_fixture_set, range_and_movers

PLANS, EST, SAM = load_fixture_set()
HB, DD, ML = PLANS["HB26"], PLANS["DD24"], PLANS["ML26"]


def test_harborview_scenarios():
    s1 = compute_ledger(HB, EST, SAM)
    assert (s1.patient_total_cents, s1.plan_total_cents) == (66500, 53500)
    crown = s1.lines[0]
    assert crown.patient_cents == 62500 and crown.plan_cents == 37500
    labels = [s.label for s in crown.steps]
    assert any("Alternate benefit" in l for l in labels) and any("Network adjustment" in l for l in labels)
    s2 = deepcopy(SAM); s2.network = V("out", Evidence.USER)
    assert compute_ledger(HB, EST, s2).patient_total_cents == 96500
    s3 = deepcopy(SAM); s3.tooth_overrides = {"crown": "4"}
    L3 = compute_ledger(HB, EST, s3)
    assert (L3.patient_total_cents, L3.plan_total_cents) == (56500, 63500)


def test_harborview_deductible_unknown_range():
    s = deepcopy(SAM); s.remaining_deductible = V(None, Evidence.UNKNOWN)
    r = range_and_movers(HB, EST, s)
    assert r["range"] == (64000, 66500)
    m = {x["unknown"]: x for x in r["movers"]}
    assert m["remaining deductible"]["impact_cents"] == 2500


def test_comparison_nothing_transferred():
    out = compare([HB, DD, ML], EST, {"HB26": SAM})
    assert out["columns"] == ["HB26", "DD24", "ML26"]
    assert out["ledgers"]["HB26"].patient_total_cents == 66500
    assert out["ledgers"]["DD24"].status == "unresolved" and out["ledgers"]["ML26"].status == "unresolved"
    assert "remaining deductible" in out["ledgers"]["DD24"].not_provided


def test_delta_with_user_hypotheticals_is_upper_bound():
    st = MemberState(V(5000, Evidence.ASSUMED), V(150000, Evidence.ASSUMED), V("in", Evidence.ASSUMED), V(24, Evidence.ASSUMED),
                     allowed_overrides={"crown": V(120000, Evidence.ASSUMED), "composite": V(30000, Evidence.ASSUMED)})
    L = compute_ledger(DD, EST, st)
    assert (L.patient_total_cents, L.plan_total_cents) == (68500, 81500)
    assert L.plan_total_is_upper_bound and any("UPPER bound" in f for f in L.flags)
    st6 = deepcopy(st); st6.enrolled_months = V(6, Evidence.ASSUMED)
    L6 = compute_ledger(DD, EST, st6)
    assert (L6.patient_total_cents, L6.plan_total_cents) == (150000, 0)
    assert all(l.status == "not_covered" for l in L6.lines)


def test_delta_enrollment_unknown_is_unresolved_with_two_branches():
    st = MemberState(V(5000, Evidence.ASSUMED), V(150000, Evidence.ASSUMED), V("in", Evidence.ASSUMED), V(None, Evidence.UNKNOWN),
                     allowed_overrides={"crown": V(120000, Evidence.ASSUMED), "composite": V(30000, Evidence.ASSUMED)})
    L = compute_ledger(DD, EST, st)
    assert L.status == "unresolved" and any("two branches" in f for f in L.flags)


def test_metlife_with_hypotheticals_flags_unknowns():
    st = MemberState(V(2500, Evidence.ASSUMED), V(150000, Evidence.ASSUMED), V("in", Evidence.ASSUMED), V(24, Evidence.ASSUMED),
                     allowed_overrides={"crown": V(120000, Evidence.ASSUMED), "composite": V(30000, Evidence.ASSUMED)})
    L = compute_ledger(ML, EST, st)
    assert (L.patient_total_cents, L.plan_total_cents) == (73250, 76750)
    joined = " ".join(L.flags)
    assert "waiting period" in joined and "alternate-benefit" in joined and "AMBIGUOUS" in joined


def test_grid_differences_print_both_percentages_and_unknowns():
    out = compare([HB, DD, ML], EST, {"HB26": SAM})
    basic = next(r for r in out["grid"] if r["topic"].startswith("Basic"))
    assert "pays 80% of the allowed amount (you pay 20%)" in basic["differences"] and "pays 60% of the allowed amount (you pay 40%)" in basic["differences"]
    waiting = next(r for r in out["grid"] if r["topic"] == "Waiting periods")
    assert waiting["cells"][0]["text"] == "None stated" and "12 months" in waiting["cells"][1]["text"] and waiting["cells"][2]["badge"] == "UNKNOWN"
    premium = next(r for r in out["grid"] if r["topic"].startswith("Premium"))
    assert premium["cells"][0]["text"] == "$31.00" and premium["cells"][1]["badge"] == "UNKNOWN"
