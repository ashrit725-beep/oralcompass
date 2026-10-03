"""Deterministic ledger computation.

Rules implemented: exclusions, waiting periods (with unknown enrollment -> unresolved), frequency clocks
(calendar_count, interval_months, rolling12_count), alternate benefit (unknown alternate allowance -> plan payment is an
UPPER bound), deductible with class waivers, coinsurance (plan share), annual-maximum cap per benefit year, out-of-network
balance billing, processing-order note. Unknown inputs produce `unresolved`, never a guess.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from .models import (AlternateBenefit, Evidence, EstimateLine, Ledger, LedgerLine, MemberState, PlanModel, Step, V)

MOLARS = {"1", "2", "3", "14", "15", "16", "17", "18", "19", "30", "31", "32"}
MANDIBULAR_MOLARS = {"17", "18", "19", "30", "31", "32"}
POSTERIOR = MOLARS | {"4", "5", "12", "13", "20", "21", "28", "29"}


def stitch(plan: PlanModel, cite) -> Optional[str]:
    """Scoped stitch id: '<doc_version_label>#<page>' is a stable, human-readable stand-in for the stitch number.
    The UI maps (doc_version_label, page, quote) to its numbered stitch; the engine never invents numbers."""
    if cite is None:
        return None
    return f"{cite.doc_version_label}#p{cite.page_start}"


def benefit_year(plan: PlanModel, d: date) -> int:
    start = plan.benefit_year_start_month.value if plan.benefit_year_start_month.known else 1
    return d.year if d.month >= start else d.year - 1


def months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month) - (1 if b.day < a.day else 0)


def _frequency_ok(plan: PlanModel, line: EstimateLine, state: MemberState, planned_before: list[date]):
    rule = next((r for r in plan.frequency if r.procedure_key == line.key), None)
    if rule is None or line.completion is None:
        return True, None, None
    prior = [d for d in state.history.get(line.key, []) if d < line.completion] + [d for d in planned_before if d < line.completion]
    if rule.clock == "calendar_count":
        same = [d for d in prior if benefit_year(plan, d) == benefit_year(plan, line.completion)]
        return len(same) < rule.n, f"{len(same)} of {rule.n} used this benefit year", rule
    if rule.clock == "interval_months":
        if not prior:
            return True, None, rule
        last = max(prior)
        m = last.month - 1 + rule.n
        nxt = date(last.year + m // 12, m % 12 + 1, min(last.day, 28))
        return months_between(last, line.completion) >= rule.n, f"last service {last.isoformat()}; next covered date {nxt.isoformat()}", rule
    if rule.clock == "rolling12_count":
        window = [d for d in prior if months_between(d, line.completion) < 12]
        return len(window) < rule.n, f"{len(window)} of {rule.n} in the last 12 months", rule
    return True, None, rule


def _alternate_applies(ab: AlternateBenefit, line: EstimateLine, tooth: Optional[str]):
    for c in ab.conditions:
        if c.get("procedure_key") != line.key:
            continue
        cond = c.get("condition", "any")
        if cond == "any" or (cond == "molar" and tooth in MOLARS) or (cond == "mandibular_molar" and tooth in MANDIBULAR_MOLARS) \
                or (cond == "posterior" and tooth in POSTERIOR):
            return c
    return None


def compute_line(plan: PlanModel, line: EstimateLine, state: MemberState, ded_left: int, max_left: int,
                 planned_before: list[date], dos_rule: str) -> LedgerLine:
    L = LedgerLine(label=line.label, status="estimate")
    tooth = state.tooth_overrides.get(line.key, line.tooth)
    charge = line.charge_cents
    dos = line.prep if (dos_rule == "prep" and line.prep) else line.completion
    L.benefit_year = benefit_year(plan, dos) if dos else None

    # exclusion
    ex = plan.excluded.get(line.key)
    if ex and ex.known and ex.value:
        L.status = "not_covered"
        L.steps.append(Step("Not covered: excluded by the plan", charge, "patient", "X", stitch(plan, ex.cite)))
        L.patient_cents, L.plan_cents = charge, 0
        return L

    # class
    cls_v = plan.class_of.get(line.key)
    if cls_v is None or not cls_v.known:
        L.status = "unresolved"; L.flags.append(f"class of '{line.label}' is not stated in this document — unresolved")
        return L
    if cls_v.status == Evidence.AMBIGUOUS:
        L.flags.append(f"class of '{line.label}' is AMBIGUOUS ({cls_v.note}) — computed with {cls_v.value}")
    cls = plan.class_rule(cls_v.value)
    if cls is None:
        L.status = "unresolved"; L.flags.append(f"class '{cls_v.value}' has no coinsurance rule in this document — unresolved")
        return L

    # waiting period
    wm = plan.waiting_months
    if wm.status == Evidence.UNKNOWN:
        L.flags.append("waiting period: not found in the pages read — computed as none; could be higher if one applies")
    elif wm.known and wm.value.get(cls.name):
        months = wm.value[cls.name]
        if not state.enrolled_months.known:
            L.status = "unresolved"
            L.flags.append(f"enrollment date not provided and this plan has a {months}-month waiting period for {cls.name} — "
                           f"two branches: covered if enrolled ≥{months} months; otherwise not covered (${charge/100:,.2f} patient)")
            return L
        if state.enrolled_months.value < months:
            L.status = "not_covered"
            L.steps.append(Step(f"Not covered: {months}-month waiting period not satisfied", charge, "patient", "W", stitch(plan, wm.cite)))
            L.patient_cents, L.plan_cents = charge, 0
            return L

    # frequency
    ok, why, frule = _frequency_ok(plan, line, state, planned_before)
    if not ok:
        L.status = "not_covered"
        L.steps.append(Step(f"Not covered: frequency limit ({why})", charge, "patient", "F", stitch(plan, frule.cite if frule else None)))
        L.patient_cents, L.plan_cents = charge, 0
        return L

    # network
    if not state.network.known:
        L.status = "unresolved"; L.flags.append("network status not provided — unresolved"); return L
    allowed_v = state.allowed_overrides.get(line.key) or plan.allowed_amounts.get(line.key)
    if allowed_v is None or not allowed_v.known:
        L.status = "unresolved"
        L.flags.append(f"allowed amount for '{line.label}' is not stated in this document and was not provided — unresolved")
        return L
    allowed = allowed_v.value
    if state.network.value == "in":
        L.steps.append(Step("Network adjustment (not owed by you)", charge - allowed, "nobody", "N", stitch(plan, plan.oon_rule.cite)))
        balance = 0
    else:
        L.steps.append(Step("Amount above the allowed amount (may be billed to you out-of-network)", charge - allowed, "patient", "N", stitch(plan, plan.oon_rule.cite)))
        balance = charge - allowed

    # alternate benefit
    basis = allowed
    ab = plan.alternate_benefit
    if ab.status == Evidence.UNKNOWN:
        L.flags.append("alternate-benefit clause: not found in the pages read — plan payment could be lower if one applies")
    elif ab.status in (Evidence.DOC, Evidence.USER):
        cond = _alternate_applies(ab, line, tooth)
        if cond:
            bk = cond.get("basis_key")
            bv = plan.allowed_amounts.get(bk) if bk else None
            if bv is None or not bv.known:
                L.plan_is_upper_bound = True
                L.flags.append("alternate benefit applies to this line but the alternate allowance is not stated — plan payment shown is an UPPER bound")
            else:
                L.steps.append(Step("Alternate benefit: plan pays on the lower allowance", -(allowed - bv.value), "basis", "AB", stitch(plan, ab.cite)))
                basis = bv.value

    # deductible
    share_v = cls.plan_share_bp_in if state.network.value == "in" else cls.plan_share_bp_out
    ded = 0
    if cls.name not in plan.deductible_waived_classes and ded_left > 0:
        ded = min(ded_left, basis)
        L.steps.append(Step("Applied to deductible", ded, "patient", "D", stitch(plan, plan.deductible_individual.cite)))
    after = basis - ded
    share_bp = share_v.value
    plan_pre = round(after * share_bp / 10000)
    pat_coins = after - plan_pre
    L.steps.append(Step(f"Your share ({(10000 - share_bp) // 100}% of the amount after deductible)", pat_coins, "patient", "CO", stitch(plan, share_v.cite)))
    L.steps.append(Step(f"Plan pays {share_bp // 100}% before the annual maximum", plan_pre, "plan_pre", "CO", stitch(plan, share_v.cite)))
    plan_pay = min(plan_pre, max_left)
    beyond = plan_pre - plan_pay
    if beyond:
        L.steps.append(Step("Beyond the plan's remaining annual maximum (your share)", beyond, "patient", "M", stitch(plan, plan.annual_max.cite)))
    ab_diff = allowed - basis
    if ab_diff:
        L.steps.append(Step("Difference between the allowed amount and the alternate basis (your share)", ab_diff, "patient", "AB", stitch(plan, ab.cite)))
    for fee in line.listed_fees:
        L.steps.append(Step(f"Listed on your estimate: {fee['label']}", fee["cents"], "patient", "X", None))
    extra = sum(f["cents"] for f in line.listed_fees)
    patient = allowed - plan_pay + balance + extra
    assert patient == ded + pat_coins + beyond + ab_diff + balance + extra
    L.patient_cents, L.plan_cents = patient, plan_pay
    return L


def compute_ledger(plan: PlanModel, lines: list[EstimateLine], state: MemberState, dos_rule: str = "completion",
                   order: str = "listed") -> Ledger:
    not_provided, assumptions = [], []
    for name, v in (("remaining deductible", state.remaining_deductible), ("remaining annual maximum", state.remaining_max),
                    ("network status", state.network), ("enrollment date", state.enrolled_months)):
        if v.status == Evidence.UNKNOWN:
            not_provided.append(name)
        elif v.status == Evidence.ASSUMED:
            assumptions.append(f"{name}: {v.value} (hypothetical you entered)")
    for k, v in state.allowed_overrides.items():
        if v.status == Evidence.ASSUMED:
            assumptions.append(f"allowed amount for {k}: ${v.value/100:,.2f} (hypothetical you entered)")

    if not state.remaining_deductible.known or not state.remaining_max.known:
        return Ledger("unresolved", [], None, None, False, ["benefit usage not provided (remaining deductible / remaining annual maximum)"],
                      not_provided, assumptions, order_note="")

    seq = list(lines)
    if order == "date":
        seq.sort(key=lambda l: (l.prep if (dos_rule == "prep" and l.prep) else l.completion) or date.max)

    def run(seq_):
        ded_left, max_left, out, planned = state.remaining_deductible.value, state.remaining_max.value, [], {}
        for line in seq_:
            L = compute_line(plan, line, state, ded_left, max_left, planned.get(line.key, []), dos_rule)
            if line.completion:
                planned.setdefault(line.key, []).append(line.completion)
            if L.status == "estimate":
                ded_left -= sum(s.cents for s in L.steps if s.rule == "D")
                max_left -= L.plan_cents or 0
            L.remaining_after = {"deductible_cents": ded_left, "annual_max_cents": max_left}
            out.append(L)
        return out

    out = run(seq)
    unresolved = any(L.status == "unresolved" for L in out)
    flags = [f for L in out for f in L.flags]
    pt = sum(L.patient_cents for L in out if L.patient_cents is not None) if not unresolved else None
    pl = sum(L.plan_cents for L in out if L.plan_cents is not None) if not unresolved else None
    upper = any(L.plan_is_upper_bound for L in out)

    # processing-order note (only meaningful with ≥2 lines and a resolved ledger)
    order_note = ""
    if len(seq) > 1 and not unresolved:
        rev = run(list(reversed(seq)))
        by_label = {L.label: L.patient_cents for L in rev}
        differs = any(by_label.get(L.label) != L.patient_cents for L in out)
        rev_total = sum(L.patient_cents for L in rev if L.patient_cents is not None)
        order_note = (f"Processing order assumed: {'as listed on your estimate' if order == 'listed' else 'by service date'}. "
                      + ("Order affects how the deductible and maximum are attributed between lines"
                         + (f"; totals are ${pt/100:,.2f} either way." if rev_total == pt else f"; the reverse order totals ${rev_total/100:,.2f}.")
                         if differs else "Order does not change any line in this scenario."))
    return Ledger("unresolved" if unresolved else "estimate", out, pt, pl, upper, flags, not_provided, assumptions, order_note)
