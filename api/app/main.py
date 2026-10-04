"""OralCompass API — FastAPI (Lambda via Mangum in production; `uvicorn app.main:app --reload` locally).

Every private resource is read through repo.get_owned (constant 404). Presets are GET-only. No endpoint lists another user's
data. No endpoint steers the user. Money is integer cents everywhere.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)   # api/.env is gitignored; values are never logged
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

from oralcompass_engine import (Evidence, EstimateLine, MemberState, V, compare, compute_ledger, load_plan, range_and_movers)  # noqa: E402
from oralcompass_engine.loader import FIXTURES  # noqa: E402

from .auth import User, current_user  # noqa: E402
from .extraction import FixtureExtractor  # noqa: E402
from .lint_runtime import guard  # noqa: E402
from .redaction import redact  # noqa: E402
from .store import NOT_FOUND, repo  # noqa: E402

app = FastAPI(title="OralCompass API", version="0.1.0")
extractor = FixtureExtractor()
PRESETS = {p.stem.upper(): load_plan(p) for p in sorted((FIXTURES / "plans").glob("*.json"))}
PRESET_META = {code: extractor.by_code[code] for code in PRESETS}

from .templates import FOOTER, COMPARISON_BANNER, PRESET_BANNER  # noqa: E402
from . import assistant, journeys, notifications, records  # noqa: E402

app.include_router(records.router)
app.include_router(journeys.router)
app.include_router(assistant.router)
app.include_router(notifications.router)


# ---------- schemas ----------
class VIn(BaseModel):
    value: Any = None
    status: str = "USER"     # USER | ASSUMED | UNKNOWN
    note: str = ""


class StateIn(BaseModel):
    remaining_deductible: VIn = VIn(status="UNKNOWN")
    remaining_max: VIn = VIn(status="UNKNOWN")
    network: VIn = VIn(status="UNKNOWN")
    enrolled_months: VIn = VIn(status="UNKNOWN")
    history: dict[str, list[str]] = {}
    allowed_overrides: dict[str, VIn] = {}
    tooth_overrides: dict[str, str] = {}

    def to_state(self) -> MemberState:
        v = lambda x: V(x.value, Evidence(x.status), None, x.note)
        return MemberState(v(self.remaining_deductible), v(self.remaining_max), v(self.network), v(self.enrolled_months),
                           {k: [date.fromisoformat(d) for d in ds] for k, ds in self.history.items()},
                           {k: V(x.value, Evidence(x.status)) for k, x in self.allowed_overrides.items()}, self.tooth_overrides)


class LineIn(BaseModel):
    key: str
    label: str
    tooth: Optional[str] = None
    charge_cents: int = Field(ge=0)
    completion: Optional[str] = None
    prep: Optional[str] = None
    listed_fees: list[dict] = []

    def to_line(self) -> EstimateLine:
        return EstimateLine(self.key, self.label, self.tooth, self.charge_cents,
                            date.fromisoformat(self.completion) if self.completion else None,
                            date.fromisoformat(self.prep) if self.prep else None, self.listed_fees)


class EstimateIn(BaseModel):
    plan_ref: str                       # preset code (e.g. "HB26") or "upload:<document_id>"
    lines: list[LineIn]
    state: StateIn = StateIn()
    dos_rule: str = "completion"
    order: str = "listed"


class ComparisonIn(BaseModel):
    plan_refs: list[str] = Field(min_length=2, max_length=3)
    lines: list[LineIn]
    states: dict[str, StateIn] = {}     # keyed by plan_ref; a missing key means nothing entered for that plan


class DocumentIn(BaseModel):
    filename: str
    sha256: str
    pages: int = Field(ge=1, le=100)
    text_preview: str = ""              # client-extracted text layer for the redaction preview (demo); production uses server-side PyMuPDF


def resolve_plan(user: User, ref: str):
    if ref in PRESETS:
        return PRESETS[ref]
    if ref.startswith("upload:"):
        doc = repo.get_owned(user.sub, "document", ref.split(":", 1)[1])
        model = doc.get("plan_model")
        if not model:
            raise HTTPException(status_code=409, detail={"error": "document_not_extracted"})
        return load_plan_from_dict(model)
    raise HTTPException(status_code=404, detail=NOT_FOUND)


def load_plan_from_dict(d: dict):
    import json, tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(d, f)
        name = f.name
    return load_plan(Path(name))


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
    movers = range_and_movers(plan, lines, state, body.dos_rule) if ledger.status == "unresolved" or True else None
    item = repo.put(user.sub, "estimate", {"plan_ref": body.plan_ref, "ledger": jsonable_encoder(ledger), "movers": jsonable_encoder(movers), "footer": FOOTER})
    return item


@app.get("/estimates/{est_id}")
def get_estimate(est_id: str, user: User = Depends(current_user)):
    return repo.get_owned(user.sub, "estimate", est_id)


# ---------- comparisons ----------
@app.post("/comparisons", status_code=201)
def create_comparison(body: ComparisonIn, user: User = Depends(current_user)):
    plans = [resolve_plan(user, r) for r in body.plan_refs]
    lines = [l.to_line() for l in body.lines]
    states = {ref: s.to_state() for ref, s in body.states.items()}
    # engine keys states by plan_code; map refs -> codes
    code_states = {}
    for ref, st in states.items():
        code_states[resolve_plan(user, ref).plan_code] = st
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
    return {rtype: repo.list_owned(user.sub, rtype) for rtype in ("document", "estimate", "comparison", "benefits", "treatment_item", "saved_estimate", "journey")}


@app.delete("/me")
def delete_me(user: User = Depends(current_user)):
    counts = repo.delete_all(user.sub)
    # production: delete S3 prefix users/<sub>/, DynamoDB items, scheduled notifications, wrapped data keys (crypto-shred), Cognito user
    return {"deleted": counts}


@app.get("/me/audit")
def my_audit(user: User = Depends(current_user)):
    return [e for e in repo.audit if e["sub"] == user.sub]


@app.get("/health")
def health():
    return {"ok": True, "presets": sorted(PRESETS), "real_presets": sorted(c for c, m in PRESET_META.items() if not m.get("is_fictional")),
            "fictional_presets": sorted(c for c, m in PRESET_META.items() if m.get("is_fictional"))}
