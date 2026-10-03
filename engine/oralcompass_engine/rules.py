"""Coverage rules normalized per procedure: the 'Coverage rules' data group (procedure, coverage %, deductible applicability,
waiting period, frequency limit, exclusion, alternate benefit) — each with its exact supporting clause and location."""
from __future__ import annotations

from .models import Evidence, PlanModel


def _cite(c):
    return None if c is None else {"doc": c.doc_version_label, "page": c.page_start, "quote": c.quote}


def coverage_rules(plan: PlanModel, procedure_keys: list[str] | None = None) -> list[dict]:
    keys = procedure_keys or sorted(set(plan.class_of) | set(plan.excluded))
    rows = []
    for key in keys:
        row = {"procedure_key": key, "plan_code": plan.plan_code}
        ex = plan.excluded.get(key)
        if ex and ex.known and ex.value:
            row.update({"covered": False, "category": "Excluded", "plan_pays_pct": 0, "you_pay_pct": 100, "exclusion": {"text": "Not covered", "cite": _cite(ex.cite)}})
        else:
            cv = plan.class_of.get(key)
            if cv is None or not cv.known:
                row.update({"covered": None, "category": None, "status": "UNKNOWN", "note": "class not stated in this document"})
            else:
                cr = plan.class_rule(cv.value)
                bp = cr.plan_share_bp_in.value if cr else None
                row.update({"covered": True, "category": cv.value, "category_status": cv.status.value, "category_cite": _cite(cv.cite),
                            "plan_pays_pct": bp // 100 if bp is not None else None, "you_pay_pct": (10000 - bp) // 100 if bp is not None else None,
                            "coverage_cite": _cite(cr.plan_share_bp_in.cite) if cr else None,
                            "plan_pays_pct_out": (cr.plan_share_bp_out.value // 100) if cr and cr.plan_share_bp_out.known else None,
                            "deductible_applies": (cv.value not in plan.deductible_waived_classes) if plan.deductible_individual.known else None,
                            "deductible_cite": _cite(plan.deductible_individual.cite),
                            "counts_toward_annual_max": cv.value not in plan.max_exempt_classes, "annual_max_cite": _cite(plan.annual_max.cite)})
                wm = plan.waiting_months
                if wm.status == Evidence.UNKNOWN:
                    row["waiting"] = {"months": None, "status": "UNKNOWN", "note": wm.note or "not found in the pages read"}
                else:
                    from .ledger import waiting_months_for
                    row["waiting"] = {"months": waiting_months_for(wm, key, cv.value), "status": wm.status.value, "cite": _cite(wm.cite), "note": wm.note}
                code = plan.procedure_codes.get(key)
                if code:
                    row["code_as_printed"] = {"code": code.get("code"), "descriptor": code.get("descriptor_as_printed"), "cite": _cite(code.get("cite")), "review": code.get("review", False)}
                row["allowed_amount"] = ({"value": plan.allowed_amounts[key].value, "status": plan.allowed_amounts[key].status.value, "note": plan.allowed_amounts[key].note}
                                         if key in plan.allowed_amounts else {"value": None, "status": "UNKNOWN", "note": "no fee schedule or allowance is printed in this document"})
        fr = [f for f in plan.frequency if f.procedure_key == key]
        row["frequency"] = [{"clock": f.clock, "n": f.n, "cite": _cite(f.cite)} for f in fr] or None
        ab = plan.alternate_benefit
        conds = [c for c in ab.conditions if c.get("procedure_key") == key] if ab.status != Evidence.UNKNOWN else []
        row["alternate_benefit"] = ({"status": ab.status.value, "conditions": conds, "cite": _cite(ab.cite)} if conds else
                                    ({"status": "UNKNOWN", "note": "clause not found in the pages read"} if ab.status == Evidence.UNKNOWN else None))
        rows.append(row)
    return rows
