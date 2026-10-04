"""Journeys: stages (islands) and checkpoints, stored per user. Data is separate from the map layout (the web decides where islands sit).

Rules: completion describes recorded activity only; the API never infers recovery or readiness; user-marked vs dental-team-confirmed is
explicit; dates carry their source; sample journeys are labeled; instructions are only ever the dental team's own text with its source.
All private reads go through repo.get_owned (constant 404).
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .auth import User, current_user
from .data import EMPTY_JOURNEY, SAMPLE_JOURNEYS, SAMPLE_USERS
from .records import ISODate, item_in_journey, seed_user_records
from .store import NOT_FOUND, repo
from .templates import JOURNEY_NOTE, SAMPLE_JOURNEY_LABEL

router = APIRouter()
STATUSES = ("completed", "current", "upcoming", "awaiting_info")


class CheckpointPatch(BaseModel):
    status: Optional[Literal["completed", "current", "upcoming", "awaiting_info"]] = None
    completed_by: Optional[Literal["user", "dental_team"]] = None     # who recorded/confirmed it — never inferred
    date: Optional[ISODate] = None                                    # ISO date entered by the user
    date_source: Optional[Literal["user", "dental_team", "document"]] = None
    note: Optional[str] = Field(None, max_length=2000)


class InstructionsIn(BaseModel):
    """Dental-team instructions attached to a stage — stored verbatim with their source; OralCompass never generates instructions."""
    text: str = Field(max_length=10_000)
    source: str = Field(max_length=300)                               # e.g. "Post-op sheet from Northside Dental Group, 2026-11-20"
    given_on: Optional[ISODate] = None


class JourneyCreate(BaseModel):
    """POST /journeys body: {"from": "sample-alex"} (or "source"). Strings only, so an object or list is a 422, never a 500."""
    model_config = ConfigDict(populate_by_name=True)
    from_: Optional[str] = Field(None, alias="from", max_length=40)
    source: Optional[str] = Field(None, max_length=40)


def progress(journey: dict) -> dict:
    stages = []
    for s in journey["stages"]:
        done = sum(1 for c in s["checkpoints"] if c["status"] == "completed")
        stages.append({"id": s["id"], "title": s["title"], "completed": done, "total": len(s["checkpoints"]), "label": f"{done} of {len(s['checkpoints'])} checkpoints completed"})
    current = next((s["id"] for s in journey["stages"] if any(c["status"] in ("current", "awaiting_info", "upcoming") for c in s["checkpoints"])), None)
    total_done = sum(x["completed"] for x in stages); total = sum(x["total"] for x in stages)
    return {"stages": stages, "current_stage": current, "label": f"{total_done} of {total} checkpoints completed", "note": JOURNEY_NOTE}


def resolve_links(sub: str, journey: dict) -> dict:
    """Attach the caller's own records (treatment items, documents, latest saved estimate) to the journey's link references — ids only, owner-scoped."""
    items = {i.get("seed_id") or i["id"]: i for i in repo.list_owned(sub, "treatment_item") if item_in_journey(i, journey)}
    docs = {d.get("seed_id") or d["id"]: d for d in repo.list_owned(sub, "document") if item_in_journey(d, journey)}
    # the latest estimate on this journey's plan only (another sample's estimate is not this journey's)
    estimates = sorted((e for e in repo.list_owned(sub, "saved_estimate") if not journey.get("plan_ref") or e.get("plan_code") == journey.get("plan_ref")),
                       key=lambda e: e.get("calculated_at", ""))
    latest = estimates[-1] if estimates else None
    out = {"treatment_items": {}, "documents": {}, "latest_estimate": None}
    for s in journey["stages"]:
        for ti in s.get("linked_treatment_items", []):
            if ti in items:
                i = items[ti]
                out["treatment_items"][ti] = {"id": i["id"], "procedure_key": i["procedure_key"], "procedure_name": i.get("procedure_name"), "tooth": i.get("tooth"), "status": i.get("status"),
                                              "dentist_fee_cents": i.get("dentist_fee_cents"), "allowed_cents": i.get("allowed_cents"), "allowed_status": i.get("allowed_status"),
                                              "allowed_source": i.get("allowed_source"), "appointment_date": i.get("appointment_date"), "planned_completion": i.get("planned_completion")}
        for c in s.get("checkpoints", []):
            d = (c.get("links") or {}).get("document")
            if d and d in docs:
                out["documents"][d] = {"id": docs[d]["id"], "type": docs[d].get("type"), "label": docs[d].get("label"), "extraction_status": docs[d].get("extraction_status")}
    if latest:
        out["latest_estimate"] = {"id": latest["id"], "plan_code": latest["plan_code"], "status": latest.get("status"), "calculated_at": latest.get("calculated_at"),
                                  "user_estimated_payment_cents": latest.get("user_estimated_payment_cents"), "insurer_estimated_payment_cents": latest.get("insurer_estimated_payment_cents")}
    return out


def _view(sub: str, item: dict) -> dict:
    j = item["journey"]
    return {"id": item["id"], "journey": j, "progress": progress(j), "links": resolve_links(sub, j), "is_sample": j.get("is_sample", False),
            "sample_label": SAMPLE_JOURNEY_LABEL if j.get("is_sample") else None}


@router.get("/journeys/samples")
def list_samples(user: User = Depends(current_user)):
    return {"items": [{"id": jid, "label": j["label"], "plan_ref": j.get("plan_ref"), "user_ref": j.get("user_ref"), "stages": [s["title"] for s in j["stages"]]} for jid, j in SAMPLE_JOURNEYS.items()]
            + [{"id": "empty", "label": EMPTY_JOURNEY["label"], "plan_ref": None, "user_ref": None, "stages": [s["title"] for s in EMPTY_JOURNEY["stages"]]}], "note": SAMPLE_JOURNEY_LABEL}


@router.get("/journeys/sample")
def get_sample(user: User = Depends(current_user)):
    j = deepcopy(SAMPLE_JOURNEYS["sample-sam"])
    return {"journey": j, "progress": progress(j), "sample_label": SAMPLE_JOURNEY_LABEL}


@router.get("/journeys")
def list_journeys(user: User = Depends(current_user)):
    return {"items": [_view(user.sub, it) for it in repo.list_owned(user.sub, "journey")]}


@router.post("/journeys", status_code=201)
def create_journey(body: JourneyCreate, user: User = Depends(current_user)):
    src = body.from_ or body.source or "empty"
    if src == "sample":
        src = "sample-sam"
    if src == "empty":
        template = EMPTY_JOURNEY
    elif src in SAMPLE_JOURNEYS:
        template = SAMPLE_JOURNEYS[src]
    else:
        raise HTTPException(status_code=422, detail={"error": "unknown_journey_source"})
    j = deepcopy(template)
    j["created_from"] = src
    j["created_at"] = datetime.now(timezone.utc).isoformat()
    seeded = {}
    if j.get("user_ref") and j["user_ref"] in SAMPLE_USERS:
        seeded = seed_user_records(user.sub, j["user_ref"])        # copies the fictional sample's records into the caller's private space only
    item = repo.put(user.sub, "journey", {"journey": j})
    return {**_view(user.sub, item), "seeded_records": seeded}


@router.get("/journeys/{jid}")
def get_journey(jid: str, user: User = Depends(current_user)):
    return _view(user.sub, repo.get_owned(user.sub, "journey", jid))


@router.patch("/journeys/{jid}/checkpoints/{cid}")
def patch_checkpoint(jid: str, cid: str, body: CheckpointPatch, user: User = Depends(current_user)):
    item = repo.get_owned(user.sub, "journey", jid)
    for s in item["journey"]["stages"]:
        for c in s["checkpoints"]:
            if c["id"] == cid:
                if body.status:
                    c["status"] = body.status
                    if body.status == "completed":
                        c["completed_by"] = body.completed_by or "user"      # explicit attribution; default is the user, never the dental team
                        c["completed_at"] = body.date or datetime.now(timezone.utc).date().isoformat()
                    else:
                        c["completed_by"] = None; c["completed_at"] = None
                if body.date is not None:
                    c["date"] = {"value": body.date, "source": body.date_source or "user"}
                if body.note is not None:
                    c["user_note"] = body.note
                c["updated_at"] = datetime.now(timezone.utc).isoformat()
                repo.put(user.sub, "journey", item)
                return _view(user.sub, item)
    raise HTTPException(status_code=404, detail=NOT_FOUND)


@router.put("/journeys/{jid}/stages/{sid}/instructions")
def put_instructions(jid: str, sid: str, body: InstructionsIn, user: User = Depends(current_user)):
    item = repo.get_owned(user.sub, "journey", jid)
    for s in item["journey"]["stages"]:
        if s["id"] == sid:
            s["instructions"] = {"text": body.text, "source": body.source, "given_on": body.given_on, "recorded_at": datetime.now(timezone.utc).isoformat(), "origin": "dental_team_document_entered_by_user"}
            for c in s["checkpoints"]:
                if c.get("kind") == "instruction" and c["status"] == "awaiting_info":
                    c["status"] = "current"
            repo.put(user.sub, "journey", item)
            return _view(user.sub, item)
    raise HTTPException(status_code=404, detail=NOT_FOUND)
