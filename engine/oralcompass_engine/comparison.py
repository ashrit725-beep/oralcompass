"""Side-by-side comparison: fixed topic rows, one column per plan in the USER's order, factual Differences sentences
with both percentages, and one Ledger per plan computed from that plan's OWN MemberState. Nothing is transferred.
"""
from __future__ import annotations

from .ledger import compute_ledger
from .models import Evidence, EstimateLine, MemberState, PlanModel, V

TOPICS = [
    "Premium (employee only, monthly)", "Deductible (individual)", "Deductible waived for", "Annual maximum",
    "Preventive: plan pays / you pay", "Basic: plan pays / you pay", "Major: plan pays / you pay",
    "Waiting periods", "Frequency limits", "Alternate-benefit clause", "In-network payment rule", "Out-of-network payment rule",
]



def _clock_words(clock: str) -> str:
    """A frequency clock in plain words for a compare cell: underscores become spaces and a leading "per" is dropped, so
    "per_tooth_months" reads "84 per tooth months", never "84 per per tooth months"."""
    words = clock.replace("_", " ").strip()
    return words[4:] if words.startswith("per ") else words

def _cell(v: V, fmt):
    if v is None or v.status == Evidence.UNKNOWN or v.value is None:
        return {"text": "Not stated in this document", "badge": "UNKNOWN", "cite": None}
    return {"text": fmt(v.value), "badge": v.status.value, "cite": (v.cite.label() if v.cite else None), "quote": (v.cite.quote if v.cite else None)}


def _money(c): return f"${c/100:,.2f}"


def _class_cell(plan: PlanModel, family: str):
    """family: preventive | basic | major — matched by common names since documents name classes differently."""
    names = {"preventive": ("Class I", "Diagnostic & Preventive", "Type I", "Type A", "Preventive", "DP"),
             "basic": ("Class II", "Basic", "Type II", "Type B"),
             "major": ("Class III", "Major", "Type III", "Type C")}[family]
    cr = next((c for c in plan.classes if c.name in names), None)
    if cr is None:
        return {"text": "Not stated in this document", "badge": "UNKNOWN", "cite": None}
    bp = cr.plan_share_bp_in.value
    return {"text": f"Plan pays {bp//100}% · you pay {(10000-bp)//100}% ({cr.name})", "badge": cr.plan_share_bp_in.status.value,
            "cite": cr.plan_share_bp_in.cite.label() if cr.plan_share_bp_in.cite else None, "pct": bp}


def grid(plans: list[PlanModel]) -> list[dict]:
    rows = []
    for topic in TOPICS:
        cells = []
        for p in plans:
            if topic.startswith("Premium"):
                cells.append(_cell(p.premium_monthly.get("employee_only"), _money))
            elif topic == "Deductible (individual)":
                cells.append(_cell(p.deductible_individual, _money))
            elif topic == "Deductible waived for":
                cells.append({"text": ", ".join(p.deductible_waived_classes) or "Not stated in this document",
                              "badge": "DOC" if p.deductible_waived_classes else "UNKNOWN", "cite": p.deductible_individual.cite.label() if p.deductible_individual.cite else None})
            elif topic == "Annual maximum":
                cells.append(_cell(p.annual_max, _money))
            elif topic.startswith("Preventive"):
                cells.append(_class_cell(p, "preventive"))
            elif topic.startswith("Basic"):
                cells.append(_class_cell(p, "basic"))
            elif topic.startswith("Major"):
                cells.append(_class_cell(p, "major"))
            elif topic == "Waiting periods":
                w = p.waiting_months
                if w.status == Evidence.UNKNOWN:
                    cells.append({"text": "Not found in the pages read (absence not confirmed)", "badge": "UNKNOWN", "cite": None})
                elif not w.value:
                    cells.append({"text": "None stated", "badge": w.status.value, "cite": w.cite.label() if w.cite else None})
                else:
                    cells.append({"text": "; ".join(f"{k}: {v} months" for k, v in w.value.items()), "badge": w.status.value, "cite": w.cite.label() if w.cite else None})
            elif topic == "Frequency limits":
                if not p.frequency:
                    cells.append({"text": "Not stated in this document", "badge": "UNKNOWN", "cite": None})
                else:
                    cells.append({"text": "; ".join(f"{r.procedure_key.replace('_', ' ')}: {r.n} per {_clock_words(r.clock)}" for r in p.frequency),
                                  "badge": "DOC", "cite": p.frequency[0].cite.label() if p.frequency[0].cite else None})
            elif topic == "Alternate-benefit clause":
                ab = p.alternate_benefit
                if ab.status == Evidence.UNKNOWN:
                    cells.append({"text": "Not found in the pages read", "badge": "UNKNOWN", "cite": None})
                else:
                    cells.append({"text": "; ".join(c.get("condition", "any") + (" → alternate allowance not stated" if not c.get("basis_key") else "") for c in ab.conditions) or "Clause present",
                                  "badge": ab.status.value, "cite": ab.cite.label() if ab.cite else None})
            elif topic == "In-network payment rule":
                cells.append(_cell(p.oon_rule, lambda t: t.get("in", "Not stated") if isinstance(t, dict) else str(t)))
            elif topic == "Out-of-network payment rule":
                cells.append(_cell(p.oon_rule, lambda t: t.get("out", "Not stated") if isinstance(t, dict) else str(t)))
        rows.append({"topic": topic, "cells": cells, "differences": differences_sentence(topic, plans, cells)})
    return rows


def column_names(plans: list[PlanModel]) -> list[str]:
    """The carrier-level name before " — ", widened with the option ("MetLife NCFlex Dental — High Option") when two columns would
    otherwise read the same, and with the plan code as a last resort, so every figure in a differences sentence names its own column."""
    short = [p.title.split(" — ")[0] if " — " in p.title else p.title for p in plans]
    out = []
    for p, s in zip(plans, short):
        if short.count(s) > 1:
            rest = p.title.split(" — ", 1)[1].split(",")[0].split(" (")[0].strip() if " — " in p.title else ""
            s = f"{s} — {rest}" if rest else s
        out.append(s)
    return [f"{s} ({p.plan_code})" if out.count(s) > 1 else s for p, s in zip(plans, out)]


def differences_sentence(topic: str, plans: list[PlanModel], cells: list[dict]) -> str:
    """Factual, both percentages for coinsurance rows, unknowns named, no adjectives. Plans in the user's order."""
    parts = []
    names = column_names(plans)
    for name, c in zip(names, cells):
        if c["badge"] == "UNKNOWN":
            parts.append(f"{name}: {c['text'].lower()}")
        elif "pct" in c:
            parts.append(f"{name} pays {c['pct']//100}% of the allowed amount (you pay {(10000-c['pct'])//100}%)")
        else:
            parts.append(f"{name}: {c['text']}")
    return "; ".join(parts) + "."


def compare(plans: list[PlanModel], lines: list[EstimateLine], states: dict[str, MemberState]) -> dict:
    """states is keyed by plan_code; a missing state means nothing was entered for that plan (unresolved ledger)."""
    ledgers = {}
    for p in plans:
        st = states.get(p.plan_code)
        if st is None:
            st = MemberState(V(None, Evidence.UNKNOWN), V(None, Evidence.UNKNOWN), V(None, Evidence.UNKNOWN), V(None, Evidence.UNKNOWN))
        ledgers[p.plan_code] = compute_ledger(p, lines, st)
    return {"columns": [p.plan_code for p in plans], "grid": grid(plans), "ledgers": ledgers,
            "note": "Columns are in the order you selected. Inputs are entered for each plan separately; nothing is copied between plans."}
