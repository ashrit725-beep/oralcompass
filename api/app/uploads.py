"""Uploads → extraction → review → publish, and the owner-scoped plan endpoints for published uploads (spec §7.3 to §7.6).

Every private read goes through `repo.get_owned` (constant 404). Files live under api/.data/<sub>/docs/<id>.pdf (gitignored),
never under web/public; the only way to the bytes is GET /me/documents/{id}/file with the owner check and
`Cache-Control: private, no-store`. Logs carry ids and stage names only: no filenames, no document text, no quotes, no amounts.

Published plan versions are immutable records (`plan_version`): UP1, UP2, ... numbered per owner. A published plan dict has the
same shape as fixtures/plans/*.json and loads through the engine's `load_plan`, so stitches read "UP1#p6" and the records router
treats "upload:<document_id>" exactly like a preset code.
"""
from __future__ import annotations

import copy
import hashlib
import json
import logging
import os
import re
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

from starlette.concurrency import run_in_threadpool
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from .auth import User, current_user
from .data import PLANS, PLAN_META, PROC_BY_KEY, clauses_from_meta, documents_for_meta, plan_summary_from_meta   # also puts engine/ on sys.path

from oralcompass_engine import PlanModel, load_plan  # noqa: E402
from oralcompass_engine.rules import coverage_rules  # noqa: E402
from .extraction import (REQUIRED_PATHS, FixtureExtractor, llm_mode, llm_model, new_status, normalize, page_count, read_text, run_extraction, verify_quote)
from .redaction import redact
from .store import NOT_FOUND, repo
from . import llm_guard
from .templates import (DEMO_EXTRACTION_RIBBON, DEMO_NO_MODEL_NOTE, EXTRACTION_FAILED_MODEL, EXTRACTION_FAILED_UNREADABLE, IGNORED_WORDING_NOTE,
                        LIVE_EXTRACTION_RIBBON, LLM_LIMIT_EXTRACTION_RIBBON, PARAPHRASE_NOTE, PUBLISH_NOTE, REDACTION_NOTE, UNMATCHED_WORDING_NOTE, UPLOAD_PLAN_BANNER, UPLOAD_VERSION_NOTE)

router = APIRouter()
log = logging.getLogger("oralcompass.uploads")

MAX_BYTES = 32 * 1024 * 1024
MAX_PAGES = 100
MAX_PREVIEW_IN = 400_000
PREVIEW_CHARS = 4000
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / ".data"          # api/.data (gitignored); production: S3 users/<sub>/docs/
fixtures = FixtureExtractor()
_PLAN_CACHE: dict[str, PlanModel] = {}      # plan_version id → PlanModel (versions are immutable)


# ---------------------------------------------------------------- helpers
def data_dir() -> Path:
    return Path(os.getenv("ORALCOMPASS_DATA_DIR") or DEFAULT_DATA_DIR)


def doc_path(sub: str, doc_id: str) -> Path:
    return data_dir() / sub / "docs" / f"{doc_id}.pdf"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_name(name: Optional[str]) -> str:
    base = Path(name or "document.pdf").name
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip() or "document.pdf"
    return base[:200]


def _owned_upload(user: User, doc_id: str) -> dict:
    doc = repo.get_owned(user.sub, "document", doc_id)
    if doc.get("kind") != "upload":
        raise HTTPException(status_code=409, detail={"error": "not_an_upload"})
    return doc


def _preview(pages: list[str], extra_terms: list[str], fallback: str = "") -> dict:
    text = "\n".join(pages).strip() or fallback
    redacted, removed = redact(text, extra_terms)
    return {"text": redacted[:PREVIEW_CHARS], "removed": removed, "note": REDACTION_NOTE}


def plan_from_dict(d: dict) -> PlanModel:
    """The existing loader path: a plan dict → temp JSON → `load_plan` (same as main.load_plan_from_dict)."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(d, f)
        name = f.name
    try:
        return load_plan(Path(name))
    finally:
        try:
            os.unlink(name)
        except OSError:
            pass


def _status_view(doc: dict) -> dict:
    st = doc.get("extraction")
    if not st:
        raise HTTPException(status_code=409, detail={"error": "not_extracted"})
    ribbon = DEMO_EXTRACTION_RIBBON if (st["mode"] == "demo" and st.get("demo_fixture_match")) else (DEMO_NO_MODEL_NOTE if st["mode"] == "demo" else LIVE_EXTRACTION_RIBBON)
    if st.get("limit_reached"):                 # the live-AI cost guard refused the call; the demo path ran instead
        ribbon = LLM_LIMIT_EXTRACTION_RIBBON
    return {**st, "ribbon": ribbon, "notes_for_review": {"paraphrase": PARAPHRASE_NOTE, "publish": PUBLISH_NOTE, "ignored_wording": IGNORED_WORDING_NOTE,
                                                         "unmatched_wording": UNMATCHED_WORDING_NOTE},
            "undecided_required": undecided_required(st.get("fields") or [])}


def undecided_required(fields: list[dict]) -> list[str]:
    """Required rows without a decision. class_of rows count as a group: at least one must be decided."""
    out = [f["field_path"] for f in fields if f.get("required") and not f.get("decision") and not f["field_path"].startswith("class_of.")]
    class_rows = [f for f in fields if f["field_path"].startswith("class_of.")]
    if class_rows and not any(f.get("decision") for f in class_rows):
        out.append("class_of")
    return out


# ---------------------------------------------------------------- schemas
class RedactionIn(BaseModel):
    extra_terms: list[str] = Field(default_factory=list, max_length=20)

    def clean(self) -> list[str]:
        terms = [t.strip() for t in self.extra_terms]
        if any(len(t) > 64 for t in terms):
            raise HTTPException(status_code=422, detail={"error": "term_too_long", "max_chars": 64})
        return [t for t in terms if t]


class ReviewDecision(BaseModel):
    field_path: str
    decision: Literal["confirmed", "edited", "not_in_document", "candidate"]
    value: Any = None
    source: Optional[str] = None
    candidate_index: Optional[int] = None


class ReviewIn(BaseModel):
    decisions: list[ReviewDecision] = Field(min_length=1, max_length=400)


# ---------------------------------------------------------------- upload + redaction
@router.post("/me/documents/upload", status_code=201)
async def upload_document(file: UploadFile = File(...), sha256: str = Form(...), pages: int = Form(...), text_preview: str = Form(""),
                          user: User = Depends(current_user)):
    chunks, size = [], 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_BYTES:
            raise HTTPException(status_code=413, detail={"error": "file_too_large", "max_bytes": MAX_BYTES})
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=415, detail={"error": "not_a_pdf"})
    if pages > MAX_PAGES or pages < 1:
        raise HTTPException(status_code=422, detail={"error": "too_many_pages", "max_pages": MAX_PAGES})
    if len(text_preview) > MAX_PREVIEW_IN:
        raise HTTPException(status_code=422, detail={"error": "text_preview_too_large", "max_chars": MAX_PREVIEW_IN})
    digest = await run_in_threadpool(lambda: hashlib.sha256(data).hexdigest())     # hashing and PDF parsing stay off the event loop
    if digest != sha256.strip().lower():
        raise HTTPException(status_code=422, detail={"error": "sha256_mismatch"})
    try:
        n_pages = await run_in_threadpool(page_count, data)
    except Exception:
        raise HTTPException(status_code=415, detail={"error": "unreadable_pdf"})
    if n_pages > MAX_PAGES:
        raise HTTPException(status_code=422, detail={"error": "too_many_pages", "max_pages": MAX_PAGES})

    doc_id = uuid.uuid4().hex
    path = doc_path(user.sub, doc_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    page_texts, _ = await run_in_threadpool(read_text, path)
    preview = await run_in_threadpool(_preview, page_texts, [], text_preview)
    filename = _safe_name(file.filename)
    item = repo.put(user.sub, "document", {
        "id": doc_id, "kind": "upload", "type": "plan_document_upload", "filename": filename, "label": filename, "sha256": digest, "pages": n_pages,
        "size_bytes": size, "uploaded_at": _now(), "extraction_status": "uploaded", "redaction_preview": preview,
        "extra_terms": [], "demo_fixture_match": fixtures.extract(digest) is not None, "extraction": None, "plan_model": None,
        "published_versions": [], "latest_version_id": None, "fields_needing_confirmation": [],
    })
    log.info("upload stored id=%s pages=%d bytes=%d", doc_id, n_pages, size)
    return {"id": item["id"], "sha256": digest, "pages": n_pages, "filename": filename, "extraction_status": "uploaded",
            "redaction_preview": item["redaction_preview"], "demo_fixture_match": item["demo_fixture_match"], "mode": llm_mode()}


@router.put("/me/documents/{doc_id}/redaction")
def put_redaction(doc_id: str, body: RedactionIn, user: User = Depends(current_user)):
    doc = _owned_upload(user, doc_id)
    current = (doc.get("extraction") or {}).get("status")
    if current and current not in ("ready", "failed", "demo_no_model"):
        # the running extraction already redacted with the earlier terms; changing them now would not match what was sent (api-correctness-8)
        raise HTTPException(status_code=409, detail={"error": "extraction_in_progress", "status": current})
    terms = body.clean()
    page_texts, _ = read_text(doc_path(user.sub, doc_id))
    doc["extra_terms"] = terms
    doc["redaction_preview"] = _preview(page_texts, terms)
    repo.put(user.sub, "document", doc)
    return {"redaction_preview": doc["redaction_preview"]}


# ---------------------------------------------------------------- extraction
class _DocumentGone(Exception):
    """The document was deleted while its extraction ran ('Delete all my data' or a document delete): the task stops quietly."""


def _run(sub: str, doc_id: str, mode: str, limit_reason: Optional[str] = None) -> None:
    doc = repo.find_owned(sub, "document", doc_id)
    if doc is None:                             # deleted before the task started: nothing to do, nothing to re-create
        return

    def set_status(st: dict) -> None:
        extraction = copy.deepcopy(st)
        if limit_reason:
            extraction["limit_reached"] = limit_reason
        # merge only the extraction fields into the CURRENT record (never re-create a deleted one, never overwrite a newer redaction)
        if repo.patch_if_exists(sub, "document", doc_id, {"extraction": extraction, "extraction_status": st["status"]}) is None:
            raise _DocumentGone()
        log.info("extraction id=%s stage=%s", doc_id, st["status"])

    try:
        run_extraction(doc_path(sub, doc_id), doc["sha256"], doc.get("extra_terms") or [], set_status, mode=mode, fixtures=fixtures)
    except _DocumentGone:
        log.info("extraction id=%s stopped: document deleted", doc_id)
    except Exception as e:                      # never leak document content; the type name is enough for the operator
        log.warning("extraction id=%s failed type=%s", doc_id, type(e).__name__)
        st = new_status(mode)
        st.update({"status": "failed", "reason": EXTRACTION_FAILED_MODEL if mode == "live" else EXTRACTION_FAILED_UNREADABLE, "stage_index": len(st["stages"]) - 1})
        try:
            set_status(st)
        except _DocumentGone:
            pass


@router.post("/me/documents/{doc_id}/extract", status_code=202)
def start_extraction(doc_id: str, background: BackgroundTasks, user: User = Depends(current_user)):
    doc = _owned_upload(user, doc_id)
    current = (doc.get("extraction") or {}).get("status")
    if current and current not in ("ready", "failed", "demo_no_model"):
        raise HTTPException(status_code=409, detail={"error": "extraction_in_progress", "status": current})
    mode = llm_mode()
    limit_reason = None
    if mode == "live":
        allowed, limit_reason = llm_guard.allow(user.sub, "extraction")
        if not allowed:                         # per-visitor or daily limit: the demo path, with an honest ribbon
            mode = "demo"
    st = new_status(mode)
    doc["extraction"], doc["extraction_status"] = st, "queued"
    repo.put(user.sub, "document", doc)
    if mode == "demo":                          # the fixture path (and the demo_no_model path) complete synchronously: no network
        _run(user.sub, doc_id, mode, limit_reason)
        return {"status": repo.get_owned(user.sub, "document", doc_id)["extraction"]["status"], "mode": mode}
    background.add_task(_run, user.sub, doc_id, mode)
    return {"status": "queued", "mode": mode, "model": llm_model()}


@router.get("/me/documents/{doc_id}/extraction")
def get_extraction(doc_id: str, user: User = Depends(current_user)):
    return _status_view(_owned_upload(user, doc_id))


# ---------------------------------------------------------------- review
_UNIT_CHECK = {
    "cents": lambda v: isinstance(v, int) and not isinstance(v, bool) and v >= 0,
    "bp": lambda v: isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 10000,
    "months": lambda v: isinstance(v, int) and not isinstance(v, bool) and v >= 0,
    "month_index": lambda v: isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 12,
    "text": lambda v: isinstance(v, (str, dict)) and bool(v),
    "bool": lambda v: isinstance(v, bool),
    "list": lambda v: isinstance(v, (list, dict)),
}


def apply_decision(f: dict, d: ReviewDecision, pages_n: list[str], at: str) -> None:
    kind = d.decision
    if kind == "confirmed":
        if f["confidence"] not in ("confirmed", "likely") or f.get("proposed_value") is None:
            raise HTTPException(status_code=422, detail={"error": "nothing_to_confirm", "field_path": f["field_path"]})
        if f["confidence"] == "likely":
            f["review_status"] = "user_confirmed"            # quote_verified_in_text is never granted by a click
        f["confidence"], f["evidence_status"] = "confirmed", "DOC"
        f["decision"] = {"kind": "confirmed", "at": at}
    elif kind == "edited":
        if not (d.source or "").strip():
            raise HTTPException(status_code=422, detail={"error": "source_required", "field_path": f["field_path"]})
        if not _UNIT_CHECK[f["unit"]](d.value):
            raise HTTPException(status_code=422, detail={"error": "invalid_value", "field_path": f["field_path"], "unit": f["unit"]})
        if f["field_path"].startswith("class_of.") and d.value not in {c.get("name") for c in (f.get("_class_names") or [])} and f.get("_class_names") is not None:
            raise HTTPException(status_code=422, detail={"error": "unknown_class", "field_path": f["field_path"]})
        f["evidence_status"], f["review_status"] = "USER", None
        f["decision"] = {"kind": "edited", "value": d.value, "source": d.source.strip(), "at": at}
    elif kind == "not_in_document":
        f.update({"confidence": "not_found", "evidence_status": "UNKNOWN", "review_status": None, "quote_verified": False})
        f["decision"] = {"kind": "not_in_document", "at": at}
    elif kind == "candidate":
        cands = f.get("candidates") or []
        if d.candidate_index is None or not (0 <= d.candidate_index < len(cands)):
            raise HTTPException(status_code=422, detail={"error": "candidate_index_out_of_range", "field_path": f["field_path"]})
        c = cands[d.candidate_index]
        v = verify_quote(c.get("quote"), c.get("page"), pages_n)
        f.update({"proposed_value": c.get("value"), "quote": c.get("quote"), "page": v["page"] if v["result"] != "not_found" else c.get("page")})
        if v["result"] == "confirmed":                       # an exactly verified candidate quote is DOC
            f.update({"quote_verified": True, "confidence": "confirmed", "evidence_status": "DOC", "review_status": "quote_verified_in_text"})
        else:
            f.update({"quote_verified": False, "confidence": "needs_review", "evidence_status": "AMBIGUOUS", "review_status": None})
        f["decision"] = {"kind": "candidate", "candidate_index": d.candidate_index, "value": c.get("value"), "at": at}


@router.put("/me/documents/{doc_id}/review")
def put_review(doc_id: str, body: ReviewIn, user: User = Depends(current_user)):
    doc = _owned_upload(user, doc_id)
    st = doc.get("extraction")
    if not st or st["status"] not in ("ready", "failed", "demo_no_model"):
        raise HTTPException(status_code=409, detail={"error": "extraction_not_finished"})
    by_path = {f["field_path"]: f for f in st["fields"]}
    class_names = st.get("structure", {}).get("classes") or []
    pages_n: Optional[list[str]] = None
    at = _now()
    for d in body.decisions:
        f = by_path.get(d.field_path)
        if not f:
            raise HTTPException(status_code=422, detail={"error": "unknown_field", "field_path": d.field_path})
        if d.decision == "candidate" and pages_n is None:
            pages_n = [normalize(p) for p in read_text(doc_path(user.sub, doc_id))[0]]
        f["_class_names"] = class_names
        apply_decision(f, d, pages_n or [], at)
        f.pop("_class_names", None)
    st["counts"] = {k: sum(1 for f in st["fields"] if f["confidence"] == k) for k in ("confirmed", "likely", "needs_review", "not_found")}
    doc["fields_needing_confirmation"] = undecided_required(st["fields"])
    repo.put(user.sub, "document", doc)
    return {"fields": st["fields"], "counts": st["counts"], "undecided_required": doc["fields_needing_confirmation"]}


# ---------------------------------------------------------------- publish
def _vdict(f: dict) -> Optional[dict]:
    """The decided ExtractedField → a plan-dict value {value, status, cite, note}; None when the row enters nothing."""
    d = f.get("decision")
    if not d:
        return None
    if d["kind"] == "not_in_document":
        return {"value": None, "status": "UNKNOWN"}
    if d["kind"] == "edited":
        return {"value": d["value"], "status": "USER", "note": d.get("source", "")}
    cite = {"page": f["page"], "quote": f["quote"], "review_status": f.get("review_status")}
    if f.get("page_note"):
        cite["page_note"] = f["page_note"]
    if d["kind"] == "candidate" and f["evidence_status"] == "AMBIGUOUS":
        others = "; ".join(f"{c.get('value')} (p.{c.get('page')})" for c in f.get("candidates") or [])
        return {"value": f["proposed_value"], "status": "AMBIGUOUS", "cite": cite, "note": f"candidates in the document: {others}"}
    return {"value": f["proposed_value"], "status": "DOC", "cite": cite}


def build_plan_dict(doc: dict, st: dict, version_label: str, published_at: str) -> dict:
    fields = st["fields"]
    structure = st.get("structure") or {}
    fixture = fixtures.extract(doc["sha256"]) if st.get("demo_fixture_match") else None
    by_path = {f["field_path"]: f for f in fields}
    v = lambda path: _vdict(by_path[path]) if path in by_path else None
    plan: dict = {
        "plan_code": version_label, "title": doc["filename"], "carrier_text": structure.get("carrier_text") or "",
        "is_fictional": bool(fixture and fixture.get("is_fictional")), "demo_label": fixture.get("demo_label") if fixture else None,
        "catalog": {"carrier": structure.get("carrier_text") or None, "plan_name": doc["filename"], "option": None, "plan_year": None, "network": None,
                    "effective_dates": {"text": "Not stated in this document"}, "eligibility": {"text": "Not stated in this document"},
                    "verification": {"date": published_at[:10], "method": "quotes verified against the uploaded document's text layer; decisions by the owner",
                                     "fields_verified": [f["field_path"] for f in fields if f.get("decision") and f["decision"]["kind"] in ("confirmed", "candidate")],
                                     "fields_unknown": [f["field_path"] for f in fields if f.get("decision") and f["decision"]["kind"] == "not_in_document"]}},
        "source_document": {"title": doc["filename"], "publisher": None, "url": None, "retrieved_at": doc.get("uploaded_at", published_at)[:10], "sha256": doc["sha256"],
                            "pages": doc["pages"], "version_label": version_label, "path": None, "document_type": "uploaded_plan_document"},
        "upload": {"document_id": doc["id"], "version_label": version_label, "published_at": published_at, "mode": st.get("mode"), "model": st.get("model"),
                   "ignored_wording": structure.get("ignored_wording", []), "unmatched_wording": structure.get("unmatched_wording", []),
                   "wording_matches": structure.get("wording_matches", []), "notes": st.get("notes", []), "banner": UPLOAD_PLAN_BANNER, "version_note": UPLOAD_VERSION_NOTE},
        "deductible_waived_classes": [], "annual_max_exempt_classes": [], "classes": [], "class_of": {}, "allowed_amounts": {}, "frequency": [], "excluded": {},
        "premium_monthly": {}, "unsupported_rules": [], "conflicts": [],
    }
    for path in ("benefit_year_start_month", "deductible_individual", "deductible_family", "annual_max", "waiting_months", "oon_rule", "dos_rule"):
        val = v(path)
        if val is not None:
            plan[path] = val
    if plan.get("deductible_individual", {}).get("status") in ("DOC", "USER", "AMBIGUOUS"):
        plan["deductible_waived_classes"] = list(structure.get("deductible_waived_classes") or [])
    am = plan.get("annual_max")
    if am and am.get("status") in ("DOC", "USER", "AMBIGUOUS"):
        plan["annual_max_exempt_classes"] = list(structure.get("annual_max_exempt_classes") or [])
        # the extraction's "unlimited" flag only stands while the row keeps the document's value; an owner's edit wins (api-correctness-10)
        if am.get("value") == "unlimited" or (structure.get("annual_max_unlimited") and am.get("status") in ("DOC", "AMBIGUOUS") and am.get("value") is None):
            am["value"], am["unlimited"] = None, True
    for i, c in enumerate(structure.get("classes") or []):
        share_in = v(f"classes[{i}].plan_share_bp_in") or {"value": None, "status": "UNKNOWN"}
        share_out = v(f"classes[{i}].plan_share_bp_out") or (c.get("plan_share_bp_out") if share_in.get("status") == "DOC" and c.get("plan_share_bp_out") else share_in)
        entry = {"name": c["name"], "plan_share_bp_in": share_in, "plan_share_bp_out": share_out, "procedures_text": c.get("procedures_text", [])}
        if c.get("cite"):
            entry["cite"] = c["cite"]
        plan["classes"].append(entry)
    class_names = {c["name"] for c in plan["classes"]}
    for f in fields:
        p = f["field_path"]
        val = _vdict(f)
        if val is None:
            continue
        if p.startswith("class_of."):
            if val.get("value") in class_names or val.get("status") == "UNKNOWN":
                plan["class_of"][p.split(".", 1)[1]] = val
        elif p.startswith("allowed_amounts.") and val.get("value") is not None:
            plan["allowed_amounts"][p.split(".", 1)[1]] = val
        elif p.startswith("excluded.") and val.get("value"):
            plan["excluded"][p.split(".", 1)[1]] = val
        elif p.startswith("premium_monthly.") and val.get("value") is not None:
            plan["premium_monthly"][p.split(".", 1)[1]] = val
        elif p.startswith("frequency[") and isinstance(val.get("value"), dict) and val["value"].get("procedure_key") in PROC_BY_KEY:
            fr = val["value"]
            plan["frequency"].append({"procedure_key": fr["procedure_key"], "clock": fr.get("clock"), "n": fr.get("n"), "cite": val.get("cite")})
        elif p == "alternate_benefit":
            if val.get("status") == "UNKNOWN":
                plan["alternate_benefit"] = {"status": "UNKNOWN"}
            else:
                plan["alternate_benefit"] = {"status": val["status"], "conditions": val.get("value") or [], "cite": val.get("cite"), "note": val.get("note", "")}
    plan.setdefault("alternate_benefit", {"status": "UNKNOWN"})
    plan.setdefault("waiting_months", {"value": None, "status": "UNKNOWN"})
    plan.setdefault("oon_rule", {"value": None, "status": "UNKNOWN"})
    return plan


def upload_summary(version: dict, doc: dict) -> dict:
    s = plan_summary_from_meta(version["plan"], f"upload:{doc['id']}")
    return {**s, "document_id": doc["id"], "version_label": version["version_label"], "published_at": version["published_at"], "has_stored_pdf": True,
            "versions": [vv for vv in doc.get("published_versions", [])], "banner": UPLOAD_PLAN_BANNER}


@router.post("/me/documents/{doc_id}/publish", status_code=201)
def publish(doc_id: str, user: User = Depends(current_user)):
    doc = _owned_upload(user, doc_id)
    st = doc.get("extraction")
    if not st or st["status"] not in ("ready", "failed", "demo_no_model"):
        raise HTTPException(status_code=409, detail={"error": "extraction_not_finished"})
    undecided = undecided_required(st["fields"])
    if undecided:
        raise HTTPException(status_code=409, detail={"error": "undecided_fields", "fields": undecided})
    n = len(repo.list_owned(user.sub, "plan_version")) + 1
    label = f"UP{n}"
    published_at = _now()
    plan_dict = build_plan_dict(doc, st, label, published_at)
    try:
        model = plan_from_dict(plan_dict)
        coverage_rules(model)
    except Exception as e:
        raise HTTPException(status_code=422, detail={"error": "plan_invalid", "type": type(e).__name__})
    version = repo.put(user.sub, "plan_version", {"document_id": doc_id, "version_label": label, "published_at": published_at, "sha256": doc["sha256"],
                                                   "plan": copy.deepcopy(plan_dict), "fields_snapshot": copy.deepcopy(st["fields"])})
    _PLAN_CACHE[version["id"]] = model
    doc["published_versions"] = list(doc.get("published_versions", [])) + [label]
    doc["latest_version_id"] = version["id"]
    doc["version_ids"] = {**(doc.get("version_ids") or {}), label: version["id"]}
    doc["plan_model"] = copy.deepcopy(plan_dict)             # legacy main.resolve_plan reads this for /estimates and /comparisons
    doc["extraction_status"] = "published"
    repo.put(user.sub, "document", doc)
    log.info("published id=%s version=%s", doc_id, label)
    return {"plan_ref": f"upload:{doc_id}", "version_label": label, "published_at": published_at, "sha256": doc["sha256"], "summary": upload_summary(version, doc)}


# ---------------------------------------------------------------- plan-ref resolution (shared with records.py)
@dataclass
class PlanRefResolution:
    ref: str                     # normalised plan reference: preset code or "upload:<document_id>"
    plan: PlanModel
    meta: dict                   # plan dict (fixture JSON or published version)
    version_label: str
    sha256: str
    is_upload: bool
    document_id: Optional[str]
    evidence_endpoint: str


def norm_ref(ref: str) -> str:
    return ref if ref.startswith("upload:") else ref.upper()


def _version_for(user: User, doc: dict, version: Optional[str]) -> dict:
    vid = doc.get("version_ids", {}).get(version) if version else doc.get("latest_version_id")
    if not vid:
        raise HTTPException(status_code=409 if not version else 404, detail={"error": "document_not_published"} if not version else NOT_FOUND)
    return repo.get_owned(user.sub, "plan_version", vid)


def resolve_plan_ref(user: User, ref: str, version: Optional[str] = None) -> PlanRefResolution:
    """A preset code or "upload:<document_id>" → the plan and its dict. Unknown or foreign refs → constant 404."""
    ref = norm_ref(ref)
    if ref.startswith("upload:"):
        doc = repo.get_owned(user.sub, "document", ref.split(":", 1)[1])
        ver = _version_for(user, doc, version)
        plan = _PLAN_CACHE.get(ver["id"])
        if plan is None:
            plan = _PLAN_CACHE[ver["id"]] = plan_from_dict(ver["plan"])
        return PlanRefResolution(ref, plan, ver["plan"], ver["version_label"], ver["sha256"], True, doc["id"], f"/me/plans/{doc['id']}/evidence")
    if ref in PLANS:
        src = PLAN_META[ref]["source_document"]
        return PlanRefResolution(ref, PLANS[ref], PLAN_META[ref], src.get("version_label", ref), src.get("sha256", ""), False, None, f"/plans/{ref}/evidence")
    raise HTTPException(status_code=404, detail=NOT_FOUND)


# ---------------------------------------------------------------- owner-scoped plan endpoints for uploads
@router.get("/me/plans")
def my_plans(user: User = Depends(current_user)):
    items = []
    for doc in repo.list_owned(user.sub, "document"):
        if doc.get("kind") == "upload" and doc.get("latest_version_id"):
            items.append(upload_summary(repo.get_owned(user.sub, "plan_version", doc["latest_version_id"]), doc))
    return {"items": items, "banner": UPLOAD_PLAN_BANNER, "version_note": UPLOAD_VERSION_NOTE}


@router.get("/me/plans/{doc_id}")
def my_plan(doc_id: str, version: Optional[str] = None, user: User = Depends(current_user)):
    res = resolve_plan_ref(user, f"upload:{doc_id}", version)
    doc = repo.get_owned(user.sub, "document", doc_id)
    ver = _version_for(user, doc, version)
    return {"summary": upload_summary(ver, doc), "model": res.meta}


@router.get("/me/plans/{doc_id}/versions")
def my_plan_versions(doc_id: str, user: User = Depends(current_user)):
    doc = _owned_upload(user, doc_id)
    out = []
    for label, vid in (doc.get("version_ids") or {}).items():
        ver = repo.get_owned(user.sub, "plan_version", vid)
        out.append({"version_label": label, "published_at": ver["published_at"], "sha256": ver["sha256"], "summary": upload_summary(ver, doc)})
    return {"document_id": doc_id, "items": out, "note": UPLOAD_VERSION_NOTE}


@router.get("/me/plans/{doc_id}/rules")
def my_plan_rules(doc_id: str, procedure_keys: str = "", version: Optional[str] = None, user: User = Depends(current_user)):
    res = resolve_plan_ref(user, f"upload:{doc_id}", version)
    keys = [k for k in procedure_keys.split(",") if k] or None
    return {"plan_code": res.ref, "version_label": res.version_label, "rules": coverage_rules(res.plan, keys)}


@router.get("/me/plans/{doc_id}/evidence")
def my_plan_evidence(doc_id: str, version: Optional[str] = None, user: User = Depends(current_user)):
    res = resolve_plan_ref(user, f"upload:{doc_id}", version)
    return {"plan_code": res.ref, "version_label": res.version_label, "documents": documents_for_meta(res.meta), "clauses": clauses_from_meta(res.meta),
            "conflicts": res.meta.get("conflicts", []), "ignored_wording": res.meta.get("upload", {}).get("ignored_wording", []),
            "unmatched_wording": res.meta.get("upload", {}).get("unmatched_wording", []), "notes": {"ignored_wording": IGNORED_WORDING_NOTE, "unmatched_wording": UNMATCHED_WORDING_NOTE}}


@router.get("/me/plans/{doc_id}/documents")
def my_plan_documents(doc_id: str, version: Optional[str] = None, user: User = Depends(current_user)):
    res = resolve_plan_ref(user, f"upload:{doc_id}", version)
    return {"plan_code": res.ref, "version_label": res.version_label, "documents": documents_for_meta(res.meta)}


@router.get("/me/documents/{doc_id}/file")
def get_file(doc_id: str, user: User = Depends(current_user)):
    doc = _owned_upload(user, doc_id)
    path = doc_path(user.sub, doc_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return Response(content=path.read_bytes(), media_type="application/pdf",
                    headers={"Cache-Control": "private, no-store", "Content-Disposition": "inline; filename=\"document.pdf\"", "X-Content-Type-Options": "nosniff"})
