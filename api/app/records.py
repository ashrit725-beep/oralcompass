"""Private records: user benefits (usage with source + date), treatment items, saved estimates, documents. Every read/write is
owner-scoped through the store. Remaining benefits are DERIVED from stored usage and the plan's stated limits — never stored as truth.

Plan references: a preset code ("ML26") or a published upload ("upload:<document_id>", URL-encoded in paths). Both resolve through
`uploads.resolve_plan_ref`; benefits and saved estimates are keyed by the plan reference, so nothing transfers between a preset
and an upload (or between two uploads)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from oralcompass_engine import Evidence, EstimateLine, MemberState, PlanModel, V, compute_ledger, range_and_movers
from oralcompass_engine.rules import coverage_rules

from .auth import User, current_user
from .data import (CODES_BY_KEY, FEE_BENCHMARKS, PLANS, PLAN_META, PROC_BY_KEY, PROCEDURES, PROCEDURE_CODES, SAMPLE_USERS, SOURCE_BY_ID, SOURCES,
                   INGEST_REPORT, AUDIT_REPORT, clauses, documents_for_meta, documents_for_plan, evidence_rows, plan_summary)
from .templates import BENCHMARK_NOTE
from .store import NOT_FOUND, repo
from .templates import FOOTER
from .uploads import norm_ref, resolve_plan_ref

router = APIRouter()


# ---------- schemas ----------
class ClaimIn(BaseModel):
    id: Optional[str] = None
    date: str
    procedure_key: str
    tooth: Optional[str] = None
    dentist_fee_cents: Optional[int] = None
    allowed_cents: Optional[int] = None
    plan_paid_cents: int
    patient_paid_cents: Optional[int] = None
    deductible_applied_cents: int = 0
    source: str


class BenefitsIn(BaseModel):
    """What the user (or a parsed statement) tells us about usage. Remaining amounts are derived, never entered."""
    coverage_start: Optional[str] = None
    coverage_end: Optional[str] = None
    network_default: Optional[str] = None            # in | out
    deductible_met_cents: Optional[int] = None       # None = not provided
    benefits_used_cents: Optional[int] = None        # insurer payments so far this benefit year; None = not provided
    deductible_met_out_cents: Optional[int] = None   # only for plans whose out-of-network deductible is tracked separately
    benefits_used_out_cents: Optional[int] = None    # only for plans whose out-of-network maximum is tracked separately
    source: dict = Field(default_factory=dict)       # {type, label, date, entered_by}
    last_updated: Optional[str] = None
    claims: list[ClaimIn] = []


class TreatmentItemIn(BaseModel):
    id: Optional[str] = None
    procedure_key: str
    procedure_name: Optional[str] = None             # as written on the estimate; defaults to the catalog name
    tooth: Optional[str] = None
    quantity: int = 1
    dentist_fee_cents: int                           # what the dentist charges — never mixed with the allowed amount
    allowed_cents: Optional[int] = None              # the plan's allowed amount if the user knows it (pre-treatment estimate, EOB); else UNKNOWN
    allowed_source: Optional[str] = None             # where the allowed amount came from, e.g. "pre-treatment estimate response 2026-09-30"
    code_as_written: Optional[str] = None            # procedure code printed on the user's own estimate/claim (USER) — never inferred
    network: Optional[str] = None                    # in | out | None (falls back to benefits.network_default, else UNKNOWN)
    appointment_date: Optional[str] = None
    planned_prep: Optional[str] = None
    planned_completion: Optional[str] = None
    status: str = "planned"                          # planned | scheduled | completed | cancelled | consultation_mentioned
    source: str = "typed"


class EstimateRequest(BaseModel):
    plan_code: str                                   # a plan reference: preset code or "upload:<document_id>"
    treatment_item_ids: list[str] = []               # defaults to all items with status planned/scheduled
    dos_rule: Optional[str] = None                   # defaults to the plan's stated rule (or completion)
    hypotheticals: dict = {}                         # {remaining_deductible_cents, remaining_max_cents, network, enrolled_months} — labeled ASSUMED


# ---------- helpers ----------
def derived_benefits(plan: PlanModel, b: dict, plan_ref: str) -> dict:
    out = {**b, "plan_code": plan_ref}
    ded = plan.deductible_individual
    mx = plan.annual_max
    src_label = (b.get("source") or {}).get("label", "not provided")
    out["remaining_deductible_cents"] = (ded.value - b["deductible_met_cents"]) if (ded.known and b.get("deductible_met_cents") is not None) else None
    out["remaining_max_cents"] = (mx.value - b["benefits_used_cents"]) if (mx.known and b.get("benefits_used_cents") is not None) else None
    out["annual_max_unlimited"] = plan.annual_max_unlimited
    out["derivation"] = {
        "remaining_deductible": (f"plan deductible ${ded.value/100:,.2f} (document) − met ${b.get('deductible_met_cents', 0)/100:,.2f} ({src_label}) = ${out['remaining_deductible_cents']/100:,.2f}"
                                 if out["remaining_deductible_cents"] is not None else ("plan deductible not stated in the document" if not ded.known else "deductible met: not provided")),
        "remaining_max": (f"annual maximum ${mx.value/100:,.2f} (document) − plan paid ${b.get('benefits_used_cents', 0)/100:,.2f} ({src_label}) = ${out['remaining_max_cents']/100:,.2f}"
                          if out["remaining_max_cents"] is not None else ("the document states no annual maximum (unlimited)" if plan.annual_max_unlimited else
                                                                           ("annual maximum not stated in the document" if not mx.known else "benefits used: not provided"))),
    }
    # separate out-of-network figures, only when the document states separate out-of-network limits
    if plan.deductible_individual_out.known:
        out["remaining_deductible_out_cents"] = (plan.deductible_individual_out.value - b["deductible_met_out_cents"]) if b.get("deductible_met_out_cents") is not None else None
        out["derivation"]["remaining_deductible_out"] = (f"out-of-network deductible ${plan.deductible_individual_out.value/100:,.2f} (document) − met ${b.get('deductible_met_out_cents', 0)/100:,.2f} ({src_label})"
                                                         if out["remaining_deductible_out_cents"] is not None else "out-of-network deductible met: not provided")
    if plan.annual_max_out.known:
        out["remaining_max_out_cents"] = (plan.annual_max_out.value - b["benefits_used_out_cents"]) if b.get("benefits_used_out_cents") is not None else None
        out["derivation"]["remaining_max_out"] = (f"out-of-network maximum ${plan.annual_max_out.value/100:,.2f} (document) − plan paid ${b.get('benefits_used_out_cents', 0)/100:,.2f} ({src_label})"
                                                  if out["remaining_max_out_cents"] is not None else "out-of-network benefits used: not provided")
    itemized = sum(c.get("plan_paid_cents", 0) for c in b.get("claims", []))
    if b.get("claims") and b.get("benefits_used_cents") is not None and itemized != b["benefits_used_cents"]:
        out["conflict"] = {"status": "CONFLICT", "note": f"itemized claims total {itemized/100:.2f} but the stated 'benefits used' is {b['benefits_used_cents']/100:.2f}; both are shown, neither is chosen"}
    return out


def months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month) - (1 if b.day < a.day else 0)


def member_state(plan_code: str, b: Optional[dict], items: list[dict], hypo: dict, as_of: date) -> tuple[MemberState, list[str]]:
    assumptions = []
    def v_usage(key_remaining, hypo_key):
        if hypo.get(hypo_key) is not None:
            assumptions.append(f"{hypo_key}: hypothetical you entered"); return V(hypo[hypo_key], Evidence.ASSUMED)
        if b and b.get(key_remaining) is not None:
            return V(b[key_remaining], Evidence.USER, None, b.get("source", {}).get("label", ""))
        return V(None, Evidence.UNKNOWN)
    rd = v_usage("remaining_deductible_cents", "remaining_deductible_cents")
    rm = v_usage("remaining_max_cents", "remaining_max_cents")
    net_vals = {i.get("network") for i in items if i.get("network")}
    if hypo.get("network"):
        net = V(hypo["network"], Evidence.ASSUMED); assumptions.append("network: hypothetical you entered")
    elif len(net_vals) == 1:
        net = V(net_vals.pop(), Evidence.USER)
    elif b and b.get("network_default"):
        net = V(b["network_default"], Evidence.USER)
    else:
        net = V(None, Evidence.UNKNOWN)
    if hypo.get("enrolled_months") is not None:
        em = V(hypo["enrolled_months"], Evidence.ASSUMED); assumptions.append("enrollment: hypothetical you entered")
    elif b and b.get("coverage_start"):
        em = V(months_between(date.fromisoformat(b["coverage_start"]), as_of), Evidence.USER, None, f"coverage start {b['coverage_start']}")
    else:
        em = V(None, Evidence.UNKNOWN)
    history: dict[str, list[date]] = {}
    for c in (b or {}).get("claims", []):
        history.setdefault(c["procedure_key"], []).append(date.fromisoformat(c["date"]))
    overrides = {i["procedure_key"]: V(i["allowed_cents"], Evidence.USER, None, i.get("allowed_source") or "entered by the user") for i in items if i.get("allowed_cents") is not None}
    rdo = v_usage("remaining_deductible_out_cents", "remaining_deductible_out_cents")
    rmo = v_usage("remaining_max_out_cents", "remaining_max_out_cents")
    return MemberState(rd, rm, net, em, history, overrides, {}, rdo, rmo), assumptions


def lines_from_items(items: list[dict]) -> list[EstimateLine]:
    """One EstimateLine per treatment item, in the items' order (the ledger keeps this order, so line i ↔ items[i])."""
    out = []
    for i in items:
        name = i.get("procedure_name") or PROC_BY_KEY.get(i["procedure_key"], {}).get("name", i["procedure_key"])
        comp = i.get("planned_completion") or i.get("appointment_date")
        out.append(EstimateLine(i["procedure_key"], name + (f" (tooth {i['tooth']})" if i.get("tooth") else ""), i.get("tooth"), i["dentist_fee_cents"] * i.get("quantity", 1),
                                date.fromisoformat(comp) if comp else None, date.fromisoformat(i["planned_prep"]) if i.get("planned_prep") else None, []))
    return out


def _benefits_record(sub: str, plan_ref: str) -> Optional[dict]:
    return next((x for x in repo.list_owned(sub, "benefits") if x["plan_code"] == plan_ref), None)


# ---------- public catalogs ----------
@router.get("/plans")
def list_plans(q: str = "", user: User = Depends(current_user)):
    items = [plan_summary(c) for c in PLANS]
    if q:
        items = [i for i in items if q.lower() in " ".join(str(v) for v in i.values()).lower()]
    return {"items": items, "banner": "Listed here means the document is public — not that you are eligible to enroll."}


@router.get("/plans/{code}")
def get_plan(code: str, user: User = Depends(current_user)):
    if code.upper() not in PLANS:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return {"summary": plan_summary(code.upper()), "model": PLAN_META[code.upper()]}


@router.get("/plans/{code}/rules")
def get_rules(code: str, procedure_keys: str = "", user: User = Depends(current_user)):
    if code.upper() not in PLANS:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    keys = [k for k in procedure_keys.split(",") if k] or None
    return {"plan_code": code.upper(), "rules": coverage_rules(PLANS[code.upper()], keys)}


def _code_summary(key: str) -> dict:
    c = CODES_BY_KEY.get(key)
    if not c:
        return {"primary_code": None, "review_required": True, "distinct_codes_seen": [], "candidates": 0}
    return {"primary_code": c["primary_code"], "review_required": c["review_required"], "review_reason": c.get("review_reason"), "distinct_codes_seen": c["distinct_codes_seen"], "candidates": len(c["candidates"])}


@router.get("/procedures")
def list_procedures(user: User = Depends(current_user)):
    items = [{**p, "external_codes": _code_summary(p["key"])} for p in PROCEDURES]
    return {"items": items, "note": "Internal procedure identifiers are fixed. Dentist fees listed here are fictional demo figures. External codes are shown only as printed in the cited public documents; "
                                    "a code printed on your own estimate takes precedence.", "codes_policy": PROCEDURE_CODES.get("policy")}


@router.get("/procedures/{key}")
def get_procedure(key: str, user: User = Depends(current_user)):
    if key not in PROC_BY_KEY:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return {**PROC_BY_KEY[key], "external_codes": CODES_BY_KEY.get(key, {"primary_code": None, "candidates": []}),
            "plans": {code: ({"covered": r.get("covered"), "category": r.get("category"), "category_status": r.get("category_status") or r.get("status"), "plan_pays_pct": r.get("plan_pays_pct")}
                             if (r := next(iter(coverage_rules(PLANS[code], [key])), None)) else None) for code in PLANS}}


@router.get("/procedures/{key}/codes")
def get_procedure_codes(key: str, user: User = Depends(current_user)):
    if key not in PROC_BY_KEY:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return {"procedure_key": key, "mapping": CODES_BY_KEY.get(key, {"primary_code": None, "candidates": []}), "reuse_terms": PROCEDURE_CODES.get("reuse_terms"), "policy": PROCEDURE_CODES.get("policy")}


@router.get("/procedures/{key}/benchmarks")
def get_procedure_benchmarks(key: str, user: User = Depends(current_user)):
    if key not in PROC_BY_KEY:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    rows = [r for r in FEE_BENCHMARKS.get("rows", []) if key in r.get("mapped_internal_keys", [])]
    mapping = CODES_BY_KEY.get(key, {})
    return {"procedure_key": key, "rows": rows, "source": FEE_BENCHMARKS.get("source"), "mapping_review_required": mapping.get("review_required", True), "note": BENCHMARK_NOTE}


# ---------- source inventory and evidence (public) ----------
@router.get("/sources")
def list_sources(user: User = Depends(current_user)):
    return {"items": [{k: v for k, v in s.items() if k != "gaps"} | {"gaps_count": len(s.get("gaps", []))} for s in SOURCES.get("items", [])], "retrieval_note": SOURCES.get("retrieval_note")}


@router.get("/sources/{sid}")
def get_source(sid: str, user: User = Depends(current_user)):
    s = SOURCE_BY_ID.get(sid)
    if not s:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return s


@router.get("/sources/{sid}/evidence")
def get_source_evidence(sid: str, field: str = "", procedure_key: str = "", user: User = Depends(current_user)):
    if sid not in SOURCE_BY_ID:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    rows = evidence_rows(sid)
    if field:
        rows = [r for r in rows if r.get("field") == field]
    if procedure_key:
        rows = [r for r in rows if r.get("procedure_key") == procedure_key]
    return {"source_id": sid, "rows": rows}


@router.get("/plans/{code}/evidence")
def get_plan_evidence(code: str, user: User = Depends(current_user)):
    if code.upper() not in PLANS:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return {"plan_code": code.upper(), "documents": documents_for_plan(code.upper()), "clauses": clauses(code.upper()), "conflicts": PLAN_META[code.upper()].get("conflicts", [])}


@router.get("/plans/{code}/documents")
def get_plan_documents(code: str, user: User = Depends(current_user)):
    if code.upper() not in PLANS:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return {"plan_code": code.upper(), "documents": documents_for_plan(code.upper())}


@router.get("/data/report")
def data_report(user: User = Depends(current_user)):
    """Import and audit summary: actual record counts, matched/unmatched procedure ids, conflicts, gaps (public, no personal data)."""
    return {"ingest": {k: v for k, v in INGEST_REPORT.items() if k != "per_plan"}, "per_plan": INGEST_REPORT.get("per_plan", {}),
            "audit": {"counts": AUDIT_REPORT.get("counts"), "findings_by_severity": AUDIT_REPORT.get("findings_by_severity")}}


# ---------- user benefits (keyed by plan reference; nothing transfers between a preset and an upload) ----------
@router.get("/me/benefits")
def list_benefits(user: User = Depends(current_user)):
    out = []
    for b in repo.list_owned(user.sub, "benefits"):
        try:
            res = resolve_plan_ref(user, b["plan_code"])
        except HTTPException:
            continue                      # a benefits record whose plan can no longer be resolved is not shown as derived truth
        out.append(derived_benefits(res.plan, b, res.ref))
    return out


@router.get("/me/benefits/{plan_ref:path}")
def get_benefits(plan_ref: str, user: User = Depends(current_user)):
    res = resolve_plan_ref(user, plan_ref)           # a foreign upload ref is a denied, audited read before anything else
    b = _benefits_record(user.sub, res.ref)
    if not b:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return derived_benefits(res.plan, b, res.ref)


@router.put("/me/benefits/{plan_ref:path}")
def put_benefits(plan_ref: str, body: BenefitsIn, user: User = Depends(current_user)):
    res = resolve_plan_ref(user, plan_ref)
    existing = _benefits_record(user.sub, res.ref)
    rec = {**(existing or {}), "plan_code": res.ref, **body.model_dump(), "plan_version_sha256": res.sha256, "plan_version_label": res.version_label,
           "updated_at": datetime.now(timezone.utc).isoformat()}
    rec["claims"] = [c if isinstance(c, dict) else c.model_dump() for c in rec["claims"]]
    item = repo.put(user.sub, "benefits", rec)
    return derived_benefits(res.plan, item, res.ref)


# ---------- treatment items ----------
@router.get("/me/treatment-items")
def list_items(user: User = Depends(current_user)):
    return repo.list_owned(user.sub, "treatment_item")


@router.post("/me/treatment-items", status_code=201)
def add_item(body: TreatmentItemIn, user: User = Depends(current_user)):
    if body.procedure_key not in PROC_BY_KEY:
        raise HTTPException(status_code=422, detail={"error": "unknown_procedure_key"})
    return repo.put(user.sub, "treatment_item", body.model_dump())


@router.patch("/me/treatment-items/{tid}")
def patch_item(tid: str, body: dict, user: User = Depends(current_user)):
    item = repo.get_owned(user.sub, "treatment_item", tid)
    allowed = {"tooth", "quantity", "dentist_fee_cents", "allowed_cents", "network", "appointment_date", "planned_prep", "planned_completion", "status", "source", "procedure_name"}
    item.update({k: v for k, v in body.items() if k in allowed})
    return repo.put(user.sub, "treatment_item", item)


# ---------- saved estimates from records ----------
@router.post("/me/estimates", status_code=201)
def estimate_from_records(body: EstimateRequest, user: User = Depends(current_user)):
    res = resolve_plan_ref(user, body.plan_code)
    plan, ref = res.plan, res.ref
    items = repo.list_owned(user.sub, "treatment_item")
    if body.treatment_item_ids:
        items = [i for i in items if i["id"] in body.treatment_item_ids]
    else:
        items = [i for i in items if i.get("status") in ("planned", "scheduled")]
    if not items:
        raise HTTPException(status_code=422, detail={"error": "no_treatment_items"})
    b_raw = _benefits_record(user.sub, ref)
    b = derived_benefits(plan, b_raw, ref) if b_raw else None
    as_of = date.today()
    state, assumptions = member_state(ref, b, items, body.hypotheticals, as_of)
    dos = body.dos_rule or (plan.dos_rule.value if plan.dos_rule.known else "completion")
    lines = lines_from_items(items)
    ledger = compute_ledger(plan, lines, state, dos)
    movers = range_and_movers(plan, lines, state, dos)
    unknowns = list(ledger.not_provided) + [f for f in ledger.flags if "not stated" in f or "not found" in f]
    missing_inputs = []
    for name in ledger.not_provided:
        missing_inputs.append({"input": name, "how": "Enter the figure from your most recent benefit statement or Explanation of Benefits (with its date)." if "deductible" in name or "maximum" in name
                               else ("Enter whether the dentist participates in this plan's network (from the dentist's office or the plan's directory)." if "network" in name
                                     else "Enter your coverage start date (from your enrollment confirmation).")})
    for L in ledger.lines:
        for f in L.flags:
            if "allowed amount" in f and "not stated" in f:
                missing_inputs.append({"input": f"allowed amount — {L.label}", "how": "The plan document prints no fee schedule. Enter the allowed amount from a pre-treatment estimate response or an EOB, with its source; without it the line stays unresolved.", "line": L.label})
            if "class of" in f and "not stated" in f:
                missing_inputs.append({"input": f"coverage class — {L.label}", "how": "The pages read do not place this procedure in a class. The line stays unresolved until the plan document (or the plan) states it.", "line": L.label})
    ledger_json = jsonable_encoder(ledger)
    # the engine keeps the listed order, so ledger line i is treatment item i: stamp the record ids on the serialized lines (engine untouched)
    for line_json, item in zip(ledger_json["lines"], items):
        line_json["treatment_item_id"] = item["id"]
        line_json["procedure_key"] = item["procedure_key"]
    rec = {
        "plan_code": ref, "plan_ref": ref, "plan_version_label": res.version_label, "plan_version_sha256": res.sha256, "calculated_at": datetime.now(timezone.utc).isoformat(),
        "inputs": {"treatment_item_ids": [i["id"] for i in items], "benefits_snapshot": b, "hypotheticals": body.hypotheticals, "dos_rule": dos,
                   "network": state.network.value, "network_status": state.network.status.value},
        "ledger": ledger_json, "movers": jsonable_encoder(movers),
        "insurer_estimated_payment_cents": ledger.plan_total_cents, "user_estimated_payment_cents": ledger.patient_total_cents,
        "plan_payment_is_upper_bound": ledger.plan_total_is_upper_bound, "assumptions": assumptions + ledger.assumptions, "unknowns": unknowns, "missing_inputs": missing_inputs,
        "status": ledger.status, "footer": FOOTER,
        "sources": {"plan_document": documents_for_meta(res.meta)[0], "evidence_endpoint": res.evidence_endpoint},
    }
    return repo.put(user.sub, "saved_estimate", rec)


@router.get("/me/estimates")
def list_estimates(user: User = Depends(current_user)):
    return repo.list_owned(user.sub, "saved_estimate")


@router.get("/me/estimates/{eid}")
def get_saved_estimate(eid: str, user: User = Depends(current_user)):
    return repo.get_owned(user.sub, "saved_estimate", eid)


# ---------- documents (private records; public sample documents are served by /plans) ----------
@router.get("/me/documents")
def list_documents(user: User = Depends(current_user)):
    return repo.list_owned(user.sub, "document")


# ---------- demo seeding (dev only): copy a sample user's records into the caller's private space ----------
def seed_user_records(sub: str, sample_user: str) -> dict:
    u = SAMPLE_USERS[sample_user]
    counts = {"benefits": 0, "treatment_item": 0, "document": 0}
    existing_items = {i.get("seed_id") for i in repo.list_owned(sub, "treatment_item")}
    b = dict(u["benefits"])
    nd = b.get("network_default")
    if isinstance(nd, dict):                       # fixture form {value, source, note} → stored value + its source
        b["network_default"] = nd.get("value"); b["network_default_source"] = {k: v for k, v in nd.items() if k != "value"}
    if not any(x["plan_code"] == b["plan_code"] for x in repo.list_owned(sub, "benefits")):
        repo.put(sub, "benefits", {**b, "seeded_from_sample": sample_user, "plan_version_sha256": PLAN_META[b["plan_code"]]["source_document"].get("sha256", "")}); counts["benefits"] += 1
    for ti in u["treatment_items"]:
        if ti["id"] in existing_items:
            continue
        allowed = ti.get("allowed_cents")
        rec = {**ti, "seed_id": ti["id"], "id": None,
               "allowed_cents": (allowed.get("value") if isinstance(allowed, dict) else allowed),
               "allowed_status": (allowed.get("status") if isinstance(allowed, dict) else ("USER" if allowed is not None else "UNKNOWN")),
               "allowed_source": ti.get("allowed_source") or (allowed.get("note") if isinstance(allowed, dict) else None),
               "appointment_date": (ti["appointment_date"] or {}).get("value") if isinstance(ti.get("appointment_date"), dict) else ti.get("appointment_date"),
               "planned_prep": (ti.get("planned_dates") or {}).get("prep"), "planned_completion": (ti.get("planned_dates") or {}).get("completion"),
               "seeded_from_sample": sample_user}
        # the engine's allowed override is only for USER-known amounts; DOC amounts come from the plan schedule
        if rec["allowed_status"] != "USER":
            rec["allowed_cents"] = None
        repo.put(sub, "treatment_item", rec); counts["treatment_item"] += 1
    for d in u.get("documents", []):
        if not any(x.get("seed_id") == d["id"] for x in repo.list_owned(sub, "document")):
            repo.put(sub, "document", {**d, "seed_id": d["id"], "id": None, "seeded_from_sample": sample_user}); counts["document"] += 1
    return counts
