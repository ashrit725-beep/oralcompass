"""Load PlanModel / Estimate / MemberState from the JSON fixtures in ../fixtures (and from preset records)."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Optional

from .models import (AlternateBenefit, Citation, ClassRule, Evidence, EstimateLine, FrequencyRule, MemberState, PlanModel, V)

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures"


def _cite(d: Optional[dict], doc: dict) -> Optional[Citation]:
    if not d:
        return None
    return Citation(doc_sha256=doc.get("sha256", ""), doc_version_label=d.get("doc", doc["version_label"]),
                    page_start=d["page"], page_end=d.get("page_end", d["page"]), quote=d["quote"])


def _v(d: Optional[dict], doc: dict, default_status=Evidence.UNKNOWN) -> V:
    if d is None:
        return V(None, Evidence.UNKNOWN)
    return V(d.get("value"), Evidence(d.get("status", default_status.value)), _cite(d.get("cite"), doc), d.get("note", ""))


def load_plan(path: Path) -> PlanModel:
    j = json.loads(Path(path).read_text())
    doc = j["source_document"]
    classes = [ClassRule(c["name"], _v(c["plan_share_bp_in"], doc), _v(c.get("plan_share_bp_out", c["plan_share_bp_in"]), doc),
                         c.get("procedures_text", []), _cite(c.get("cite"), doc)) for c in j["classes"]]
    ab = j.get("alternate_benefit") or {"status": "UNKNOWN"}
    return PlanModel(
        plan_code=j["plan_code"], title=j["title"], carrier_text=j.get("carrier_text", ""), is_fictional=j.get("is_fictional", False),
        benefit_year_start_month=_v(j.get("benefit_year_start_month"), doc),
        deductible_individual=_v(j.get("deductible_individual"), doc), deductible_waived_classes=j.get("deductible_waived_classes", []),
        annual_max=_v(j.get("annual_max"), doc), classes=classes,
        class_of={k: _v(v, doc) for k, v in j.get("class_of", {}).items()},
        allowed_amounts={k: _v(v, doc) for k, v in j.get("allowed_amounts", {}).items()},
        alternate_benefit=AlternateBenefit(Evidence(ab.get("status", "UNKNOWN")), ab.get("conditions", []), _cite(ab.get("cite"), doc)),
        waiting_months=_v(j.get("waiting_months"), doc),
        frequency=[FrequencyRule(f["procedure_key"], f["clock"], f["n"], _cite(f.get("cite"), doc)) for f in j.get("frequency", [])],
        excluded={k: _v(v, doc) for k, v in j.get("excluded", {}).items()},
        oon_rule=_v(j.get("oon_rule"), doc), dos_rule=_v(j.get("dos_rule"), doc),
        premium_monthly={k: _v(v, doc) for k, v in j.get("premium_monthly", {}).items()},
        unsupported_rules=j.get("unsupported_rules", []),
        max_exempt_classes=j.get("annual_max_exempt_classes", []),
        deductible_family=_v(j.get("deductible_family"), doc),
        deductible_individual_out=_v(j.get("deductible_individual_out"), doc),
        annual_max_out=_v(j.get("annual_max_out"), doc),
        annual_max_unlimited=bool((j.get("annual_max") or {}).get("unlimited", False)),
        annual_max_out_unlimited=bool((j.get("annual_max_out") or {}).get("unlimited", False)),
        procedure_codes={k: {"code": c.get("code"), "descriptor_as_printed": c.get("descriptor_as_printed"), "cite": _cite(c.get("cite"), doc),
                             "review": c.get("review", False)} for k, c in j.get("procedure_codes", {}).items()},
    )


def load_estimate(path: Path) -> list[EstimateLine]:
    j = json.loads(Path(path).read_text())
    out = []
    for l in j["lines"]:
        out.append(EstimateLine(l["key"], l["label"], l.get("tooth"), l["charge_cents"],
                                date.fromisoformat(l["completion"]) if l.get("completion") else None,
                                date.fromisoformat(l["prep"]) if l.get("prep") else None, l.get("listed_fees", [])))
    return out


def load_state(path: Path) -> MemberState:
    j = json.loads(Path(path).read_text())
    def v(k):
        d = j.get(k)
        return V(None, Evidence.UNKNOWN) if d is None else V(d.get("value"), Evidence(d.get("status", "USER")), None, d.get("note", ""))
    return MemberState(v("remaining_deductible"), v("remaining_max"), v("network"), v("enrolled_months"),
                       {k: [date.fromisoformat(x) for x in vals] for k, vals in j.get("history", {}).items()},
                       {k: V(d["value"], Evidence(d.get("status", "USER"))) for k, d in j.get("allowed_overrides", {}).items()},
                       j.get("tooth_overrides", {}), v("remaining_deductible_out"), v("remaining_max_out"))


def load_fixture_set():
    plans = {p.stem.upper(): load_plan(p) for p in sorted((FIXTURES / "plans").glob("*.json"))}
    estimate = load_estimate(FIXTURES / "estimates" / "sam_estimate.json")
    state_hb = load_state(FIXTURES / "member_state" / "sam_hb26.json")
    return plans, estimate, state_hb
