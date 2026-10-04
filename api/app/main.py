"""OralCompass API — FastAPI (Lambda via Mangum in production; `uvicorn app.main:app --reload` locally).

Every private resource is read through repo.get_owned (constant 404). Presets are GET-only. No endpoint lists another user's
data. No endpoint steers the user. Money is integer cents everywhere.
"""
from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path
from typing import Annotated, Any, Literal, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.middleware.gzip import GZipMiddleware

# api/.env (gitignored; values are never logged) is the local development file. Production takes its settings from the platform's
# environment only: a developer's api/.env (which can carry ORALCOMPASS_DEV_AUTH=1 and a live key) must never switch a production run
# into dev auth after server.check_production_config has passed.
if os.getenv("ORALCOMPASS_ENV") != "production":
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

from oralcompass_engine import (Evidence, EstimateLine, MemberState, V, compare, compute_ledger, range_and_movers)  # noqa: E402

from .auth import User, current_user  # noqa: E402
from .extraction import FixtureExtractor  # noqa: E402
from .lint_runtime import guard  # noqa: E402
from .redaction import redact  # noqa: E402
from .store import NOT_FOUND, repo  # noqa: E402
from .sessions import SessionMiddleware, mark_cleared  # noqa: E402
from .security import SecurityMiddleware  # noqa: E402

_PROD = os.getenv("ORALCOMPASS_ENV") == "production"     # production: no interactive docs (they load CDN scripts the CSP blocks)
app = FastAPI(title="OralCompass API", version="0.1.0", docs_url=None if _PROD else "/docs", redoc_url=None if _PROD else "/redoc",
              openapi_url=None if _PROD else "/openapi.json")
app.add_middleware(GZipMiddleware, minimum_size=1024)    # innermost: responses over 1 KB are compressed (an outer copy skips them)
app.add_middleware(SessionMiddleware)      # production: per-visitor signed-cookie sessions (inactive under ORALCOMPASS_DEV_AUTH=1 or Cognito)
app.add_middleware(SecurityMiddleware)     # outermost: CSP and security headers, body size limits, ids-only request logs (security.py)
extractor = FixtureExtractor()
from .data import PLANS as PRESETS, PROC_BY_KEY  # noqa: E402  (one load of the plan fixtures for the whole API)
PRESET_META = {code: extractor.by_code[code] for code in PRESETS}

from .templates import FOOTER, COMPARISON_BANNER, PRESET_BANNER  # noqa: E402
from . import assistant, journeys, notifications, records, uploads  # noqa: E402

@app.exception_handler(RequestValidationError)
async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 bodies name the field and the rule only. FastAPI's default echoes the submitted value ("input") and rule context ("ctx") back,
    which would reflect pasted document or treatment-plan text into responses and logs (SECURITY.md: no document text in responses)."""
    detail = [{"type": e.get("type"), "loc": list(e.get("loc", ())), "msg": e.get("msg")} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": detail})


app.include_router(records.router)
app.include_router(journeys.router)
app.include_router(uploads.router)
app.include_router(assistant.router)
app.include_router(notifications.router)
from . import explain, treatment_reader  # noqa: E402  (AI features, addendum D.5)
app.include_router(treatment_reader.router)
app.include_router(explain.router)


# ---------- schemas ----------
from .records import ISODate  # noqa: E402  (ISO dates are validated on the way in: a bad date is 422, never a 500 in the engine)


class VIn(BaseModel):
    value: Any = None
    status: Literal["USER", "ASSUMED", "UNKNOWN"] = "USER"
    note: str = Field("", max_length=300)


class StateIn(BaseModel):
    remaining_deductible: VIn = VIn(status="UNKNOWN")
    remaining_max: VIn = VIn(status="UNKNOWN")
    network: VIn = VIn(status="UNKNOWN")
    enrolled_months: VIn = VIn(status="UNKNOWN")
    history: dict[str, list[ISODate]] = {}
    allowed_overrides: dict[str, VIn] = {}
    tooth_overrides: dict[str, str] = {}

    def to_state(self) -> MemberState:
        v = lambda x: V(x.value, Evidence(x.status), None, x.note)
        return MemberState(v(self.remaining_deductible), v(self.remaining_max), v(self.network), v(self.enrolled_months),
                           {k: [date.fromisoformat(d) for d in ds] for k, ds in self.history.items()},
                           {k: V(x.value, Evidence(x.status)) for k, x in self.allowed_overrides.items()}, self.tooth_overrides)


class ListedFee(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    cents: int = Field(ge=0, le=100_000_000, strict=True)


MAX_LINES = 60          # a treatment plan has at most a few dozen lines; an unbounded list made one request cost minutes of engine time


class LineIn(BaseModel):
    key: str = Field(max_length=80)
    label: str = Field(max_length=200)
    tooth: Optional[str] = Field(None, max_length=20)
    charge_cents: int = Field(ge=0, le=100_000_000)
    completion: Optional[ISODate] = None
    prep: Optional[ISODate] = None
    listed_fees: list[ListedFee] = Field(default_factory=list, max_length=20)

    def to_line(self) -> EstimateLine:
        if self.key not in PROC_BY_KEY:
            raise HTTPException(status_code=422, detail={"error": "unknown_procedure_key", "key": self.key})
        return EstimateLine(self.key, self.label, self.tooth, self.charge_cents,
                            date.fromisoformat(self.completion) if self.completion else None,
                            date.fromisoformat(self.prep) if self.prep else None, [f.model_dump() for f in self.listed_fees])


class EstimateIn(BaseModel):
    plan_ref: str = Field(max_length=120)  # preset code (e.g. "HB26") or "upload:<document_id>"
    lines: list[LineIn] = Field(max_length=MAX_LINES)
    state: StateIn = StateIn()
    dos_rule: str = "completion"
    order: str = "listed"


class ComparisonIn(BaseModel):
    plan_refs: list[str] = Field(min_length=2, max_length=3)
    lines: list[LineIn] = Field(max_length=MAX_LINES)
    states: dict[str, StateIn] = {}     # keyed by plan_ref; a missing key means nothing entered for that plan


class DocumentIn(BaseModel):
    filename: str = Field(max_length=255)
    sha256: str = Field(max_length=64)
    pages: int = Field(ge=1, le=100)
    text_preview: str = Field("", max_length=200_000)   # client-extracted text layer for the redaction preview (demo); production uses server-side PyMuPDF


def resolve_plan(user: User, ref: str):
    """The shared resolver (uploads.resolve_plan_ref: presets in any case, published uploads, cached, no temp files left behind). A legacy
    POST /documents record (a cached fixture model, never published) still resolves through the same loader."""
    ref = uploads.norm_ref(ref)
    if ref.startswith("upload:"):
        doc = repo.get_owned(user.sub, "document", ref.split(":", 1)[1])
        if not doc.get("latest_version_id"):
            if not doc.get("plan_model"):
                raise HTTPException(status_code=409, detail={"error": "document_not_extracted"})
            return uploads.plan_from_dict(doc["plan_model"])
    return uploads.resolve_plan_ref(user, ref).plan


# ---------- presets (read-only) ----------
@app.get("/presets")
def list_presets(q: str = "", plan_year: Optional[int] = None, state: Optional[str] = None, user: User = Depends(current_user)):
    out = []
    for code, meta in PRESET_META.items():
        cat = meta.get("catalog", {})
        hay = " ".join([meta.get("title", ""), cat.get("carrier", ""), cat.get("plan_name", ""), cat.get("option", ""), str(cat.get("plan_year", "")),
                        cat.get("where_offered", {}).get("text", "")]).lower()
        if q and q.lower() not in hay:
            continue
        if plan_year and cat.get("plan_year") != plan_year:
            continue
        if state and state.lower() not in cat.get("where_offered", {}).get("text", "").lower():
            continue
        out.append({"plan_code": code, "title": meta["title"], "carrier": cat.get("carrier"), "plan_name": cat.get("plan_name"), "option": cat.get("option"),
                    "plan_year": cat.get("plan_year"), "where_offered": cat.get("where_offered"), "eligibility": cat.get("eligibility"),
                    "source_document": {k: meta["source_document"].get(k) for k in ("title", "publisher", "url", "retrieved_at", "version_label")},
                    "verification": cat.get("verification"), "is_fictional": meta.get("is_fictional", False), "demo_label": meta.get("demo_label")})
    return {"items": out, "banner": PRESET_BANNER}


@app.get("/presets/{code}")
def get_preset(code: str, user: User = Depends(current_user)):
    meta = PRESET_META.get(code.upper())
    if not meta:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return meta


@app.put("/presets/{code}")
@app.patch("/presets/{code}")
@app.delete("/presets/{code}")
@app.post("/presets")
def presets_read_only(code: str = ""):
    raise HTTPException(status_code=405, detail={"error": "presets_are_read_only"})


# ---------- documents ----------
@app.post("/documents", status_code=201)
def create_document(body: DocumentIn, user: User = Depends(current_user)):
    redacted, removed = redact(body.text_preview)
    cached = extractor.extract(body.sha256)
    item = repo.put(user.sub, "document", {"filename": body.filename, "sha256": body.sha256, "pages": body.pages,
                                            "redaction_preview": {"text": redacted, "removed": removed}, "plan_model": cached,
                                            "extraction_status": "cached" if cached else "pending_extraction"})
    # production: return a 60-second presigned PUT URL for users/<sub>/docs/<id>.pdf (SSE-KMS, tenant encryption context)
    return {"id": item["id"], "extraction_status": item["extraction_status"], "redaction_preview": item["redaction_preview"], "upload_url": None}


@app.get("/documents/{doc_id}")
def get_document(doc_id: str, user: User = Depends(current_user)):
    return repo.get_owned(user.sub, "document", doc_id)


# ---------- estimates ----------
@app.post("/estimates", status_code=201)
def create_estimate(body: EstimateIn, user: User = Depends(current_user)):
    plan = resolve_plan(user, body.plan_ref)
    lines = [l.to_line() for l in body.lines]
    state = body.state.to_state()
    ledger = compute_ledger(plan, lines, state, body.dos_rule, body.order)
    movers = range_and_movers(plan, lines, state, body.dos_rule)
    item = repo.put(user.sub, "estimate", {"plan_ref": body.plan_ref, "ledger": jsonable_encoder(ledger), "movers": jsonable_encoder(movers), "footer": FOOTER})
    return item


@app.get("/estimates/{est_id}")
def get_estimate(est_id: str, user: User = Depends(current_user)):
    return repo.get_owned(user.sub, "estimate", est_id)


# ---------- comparisons ----------
@app.post("/comparisons", status_code=201)
def create_comparison(body: ComparisonIn, user: User = Depends(current_user)):
    plans = [resolve_plan(user, r) for r in body.plan_refs]
    by_ref = {uploads.norm_ref(r): p for r, p in zip(body.plan_refs, plans)}
    lines = [l.to_line() for l in body.lines]
    # engine keys states by plan_code; map refs -> codes (each ref resolved once)
    code_states = {}
    for ref, s in body.states.items():
        plan = by_ref.get(uploads.norm_ref(ref)) or resolve_plan(user, ref)
        code_states[plan.plan_code] = s.to_state()
    out = compare(plans, lines, code_states)
    for row in out["grid"]:
        row["differences"] = guard(row["differences"])["text"]      # runtime advice guard on generated sentences
    item = repo.put(user.sub, "comparison", {"plan_refs": body.plan_refs, "result": jsonable_encoder(out), "footer": FOOTER,
                                              "banner": COMPARISON_BANNER})
    return item


@app.get("/comparisons/{cmp_id}")
def get_comparison(cmp_id: str, user: User = Depends(current_user)):
    return repo.get_owned(user.sub, "comparison", cmp_id)


# ---------- account ----------
@app.get("/me/export")
def export_me(user: User = Depends(current_user)):
    """Every record type the API stores for the caller (api-correctness-4: push subscriptions and published plan versions included)."""
    return {rtype: repo.list_owned(user.sub, rtype) for rtype in EXPORT_TYPES}


EXPORT_TYPES = ("document", "plan_version", "estimate", "comparison", "benefits", "treatment_item", "saved_estimate", "journey", "push_subscription")


def _delete_owner_files(sub: str) -> int:
    """Remove the caller's stored uploads (ORALCOMPASS_DATA_DIR/<sub>/: each PDF and its private redaction file). Only a plain directory name
    directly under the data dir is touched. The count is of stored documents (PDFs); everything in the directory is removed."""
    import re
    import shutil
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", sub):
        return 0
    base = uploads.data_dir().resolve()
    target = (base / sub).resolve()
    if target.parent != base or not target.is_dir():
        return 0
    n = sum(1 for p in target.rglob("*.pdf") if p.is_file())
    shutil.rmtree(target, ignore_errors=True)
    return n


@app.delete("/me")
def delete_me(request: Request, user: User = Depends(current_user)):
    counts = repo.delete_all(user.sub)
    files = _delete_owner_files(user.sub)
    if files:
        counts = {**counts, "stored_file": files}
    mark_cleared(request)               # the session cookie is expired on this response; the next request starts a new, empty session
    # production: delete S3 prefix users/<sub>/, DynamoDB items, scheduled notifications, wrapped data keys (crypto-shred), Cognito user
    return {"deleted": counts}


@app.get("/me/audit")
def my_audit(user: User = Depends(current_user)):
    return repo.audit_for(user.sub)


@app.get("/health")
def health():
    from .extraction import llm_mode, llm_model
    from .llm_guard import cap_reached
    from .llm_providers import provider_names
    mode = llm_mode()
    return {"ok": True, "presets": sorted(PRESETS), "real_presets": sorted(c for c, m in PRESET_META.items() if not m.get("is_fictional")),
            "fictional_presets": sorted(c for c, m in PRESET_META.items() if m.get("is_fictional")),
            "llm_mode": mode, "llm_model": llm_model() if mode == "live" else None,      # the model id only; never the key
            "llm_providers": provider_names(),                                                  # provider names in chain order; never a credential
            "llm_cap_reached": cap_reached()}                                                   # the global daily request/spend cap (llm_guard)
