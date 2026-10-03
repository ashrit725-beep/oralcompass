"""Public catalogs (read-only) and sample records.

Public = plan presets and their public/fictional documents, the procedure catalog, external-code mappings, published fee
benchmarks, the source inventory and its evidence rows, sample journeys. Private records (benefits, treatment items, estimates,
journeys, documents) live in the owner-scoped store and never appear here.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
from oralcompass_engine import load_plan  # noqa: E402

FIX = ROOT / "fixtures"


def _load(p: Path, default=None):
    return json.loads(p.read_text()) if p.exists() else default


PLAN_META: dict[str, dict] = {}
PLANS: dict = {}
for p in sorted((FIX / "plans").glob("*.json")):
    j = json.loads(p.read_text())
    PLAN_META[j["plan_code"]] = j
    PLANS[j["plan_code"]] = load_plan(p)

PROCEDURES: list[dict] = json.loads((FIX / "procedures.json").read_text())["items"]
PROC_BY_KEY = {p["key"]: p for p in PROCEDURES}
SAMPLE_JOURNEYS: dict[str, dict] = {j["id"]: j for j in (json.loads(p.read_text()) for p in sorted((FIX / "journeys").glob("sample_*.json")))}
EMPTY_JOURNEY: dict = json.loads((FIX / "journeys" / "empty.json").read_text())
SAMPLE_USERS: dict[str, dict] = {p.stem: json.loads(p.read_text()) for p in sorted((FIX / "users").glob("*.json"))}

SOURCES: dict = _load(FIX / "sources.json", {"items": []})
SOURCE_BY_ID = {s["source_id"]: s for s in SOURCES.get("items", [])}
PROCEDURE_CODES: dict = _load(FIX / "procedure_codes.json", {"items": []})
CODES_BY_KEY = {it["procedure_key"]: it for it in PROCEDURE_CODES.get("items", [])}
FEE_BENCHMARKS: dict = _load(FIX / "fee_benchmarks.json", {"rows": [], "source": {}})
INGEST_REPORT: dict = _load(FIX / "ingest_report.json", {})
AUDIT_REPORT: dict = _load(FIX / "audit_report.json", {})


def evidence_rows(source_id: str) -> list[dict]:
    j = _load(FIX / "evidence" / f"{source_id}.json")
    return j["rows"] if j else []


def plan_summary(code: str) -> dict:
    """Plan preset record: name, insurer, region, network, effective dates, premium, deductibles, annual max, source document(s)."""
    m = PLAN_META[code]; cat = m.get("catalog", {})
    src = m["source_document"]
    return {
        "plan_code": code, "title": m["title"], "insurer": cat.get("carrier"), "plan_name": cat.get("plan_name"), "option": cat.get("option"), "plan_year": cat.get("plan_year"),
        "region": cat.get("region") or (cat.get("where_offered") or {}).get("text"), "network": cat.get("network"),
        "effective_dates": cat.get("effective_dates") or {"text": "Not stated in this document"},
        "benefit_year_type": cat.get("benefit_year_type"), "where_offered": cat.get("where_offered"), "eligibility": cat.get("eligibility"), "currency_note": cat.get("currency_note"),
        "premium_monthly": m.get("premium_monthly", {}), "deductible_individual": m.get("deductible_individual"), "deductible_family": m.get("deductible_family") or {"value": None, "status": "UNKNOWN"},
        "deductible_individual_out": m.get("deductible_individual_out"), "deductible_waived_classes": m.get("deductible_waived_classes", []),
        "annual_max": m.get("annual_max"), "annual_max_out": m.get("annual_max_out"), "annual_max_exempt_classes": m.get("annual_max_exempt_classes", []),
        "source_document": {k: src.get(k) for k in ("title", "publisher", "url", "retrieved_at", "version_label", "document_type", "document_date", "pages", "path", "sha256", "source_id", "reuse_terms", "access_limits")},
        "secondary_documents": m.get("secondary_documents", []), "verification": cat.get("verification"), "is_fictional": m.get("is_fictional", False), "demo_label": m.get("demo_label"),
        "unsupported_rules": m.get("unsupported_rules", []), "conflicts": m.get("conflicts", []), "has_stored_pdf": bool(src.get("path")),
        "procedure_codes_printed": sorted(m.get("procedure_codes", {}).keys()), "allowed_amounts_note": m.get("allowed_amounts_note"),
    }


def document_pages(code: str) -> list[str]:
    """Extracted text per page of a plan's stored document (public samples only; private uploads are extracted per owner)."""
    path = PLAN_META[code]["source_document"].get("path")
    if not path or not (ROOT / path).exists():
        return []
    import fitz
    d = fitz.open(str(ROOT / path))
    return [d[i].get_text() for i in range(d.page_count)]


def clauses(code: str) -> list[dict]:
    """Every cited clause in a plan fixture: (field path, document label, page, page label, quote, fact id) — the plan's evidence list."""
    out = []
    meta = PLAN_META[code]
    default_doc = meta["source_document"]["version_label"]

    def walk(obj, path):
        if isinstance(obj, dict):
            if "quote" in obj and "page" in obj and obj.get("quote"):
                out.append({"field": path, "doc": obj.get("doc", default_doc), "page": obj["page"], "page_note": obj.get("page_note"), "section": obj.get("section"),
                            "quote": obj["quote"], "fact_id": obj.get("fact_id"), "review_status": obj.get("review_status")})
            for k, v in obj.items():
                walk(v, f"{path}.{k}" if path else k)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                walk(v, f"{path}[{i}]")
    walk(meta, "")
    # stable numbering in (document, page, field) order — the UI's stitch numbers
    out.sort(key=lambda c: (c["doc"] != default_doc, c["doc"], c["page"] or 0, c["field"]))
    for i, c in enumerate(out, 1):
        c["n"] = i
    return out


def documents_for_plan(code: str) -> list[dict]:
    """Primary + secondary documents behind a preset, with access status."""
    m = PLAN_META[code]
    src = m["source_document"]
    docs = [{"version_label": src.get("version_label"), "title": src.get("title"), "publisher": src.get("publisher"), "url": src.get("url"), "document_type": src.get("document_type"),
             "document_date": src.get("document_date"), "pages": src.get("pages"), "retrieved_at": src.get("retrieved_at"), "stored_path": src.get("path"),
             "has_stored_pdf": bool(src.get("path")), "sha256": src.get("sha256"), "access_limits": src.get("access_limits", []), "reuse_terms": src.get("reuse_terms"), "role": "primary",
             "source_id": src.get("source_id")}]
    for sd in m.get("secondary_documents", []):
        docs.append({**sd, "role": "secondary", "has_stored_pdf": False})
    return docs
