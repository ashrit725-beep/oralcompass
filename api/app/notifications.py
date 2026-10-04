"""Informational reminders and Web Push subscriptions (master prompt section 19; lowest priority, kept small and honest).

- GET  /notifications/vapid-public-key      the VAPID public key from the environment (404 when unset)
- POST /me/push/subscriptions               store a browser push subscription (https endpoint + keys) in the owner-scoped repo
- GET  /me/push/subscriptions, DELETE /me/push/subscriptions/{id}
- GET  /me/reminders                        deterministic reminders from the user's plan + benefits + claims; text from linted templates
- POST /me/push/test                        dev only: the fixed generic payload through pywebpush (never content in the push body)

Reminders state facts with their source and clause; they never urge. Dates come from the engine's own arithmetic
(ledger.benefit_year, ledger.months_between and the same next-covered-date computation as ledger._frequency_ok).
"""
from __future__ import annotations

import ipaddress
import json
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from oralcompass_engine.ledger import benefit_year

from .auth import User, _dev_mode, current_user
from .data import PLANS, PLAN_META, PROC_BY_KEY
from .records import derived_benefits
from .store import NOT_FOUND, repo
from .templates import (PUSH_TEST_BODY, REMINDER_BENEFIT_YEAR_END, REMINDER_BENEFIT_YEAR_END_NO_MAX, REMINDER_BENEFIT_YEAR_END_NO_USAGE,
                        REMINDER_BENEFIT_YEAR_UNKNOWN, REMINDER_CALENDAR_COUNT, REMINDER_DOCUMENT_AWAITING, REMINDER_INTERVAL)

try:
    from pywebpush import WebPushException, webpush
except Exception:                                   # pragma: no cover - the package is listed in requirements.txt
    webpush = None
    WebPushException = Exception

log = logging.getLogger("oralcompass.notifications")
router = APIRouter()

PUSH_TEST_PAYLOAD = {"title": "OralCompass", "body": PUSH_TEST_BODY}
EXTRACTION_FINISHED = {"ready", "failed", "demo_no_model"}     # a document whose extraction finished and still has required rows undecided


# ---------- schemas ----------
class PushKeys(BaseModel):
    p256dh: str = Field(min_length=16, max_length=512)
    auth: str = Field(min_length=8, max_length=256)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(max_length=2048)
    keys: PushKeys
    expiration_time: Optional[int] = None
    label: Optional[str] = Field(default=None, max_length=80)

    @field_validator("endpoint")
    @classmethod
    def _https_only(cls, v: str) -> str:
        if not v.startswith("https://") or len(v) < 12 or " " in v:
            raise ValueError("endpoint must be an https URL")
        if not _public_push_host(v):
            raise ValueError("endpoint must be a public push service URL")
        return v


def _public_push_host(url: str) -> bool:
    """The server POSTs to this URL (/me/push/test), so it must name a public host: no IP literal, localhost, single-label or
    internal-suffix name, credentials or non-443 port (no requests to the platform's metadata address or the server's own network)."""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return False
    host = (parts.hostname or "").rstrip(".").lower()
    if not host or parts.username or parts.password or (port not in (None, 443)):
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    if "." not in host or host == "localhost" or host.endswith((".localhost", ".local", ".internal", ".lan", ".home", ".arpa")):
        return False
    return True


def _public(sub: dict) -> dict:
    """What the API returns about a subscription: never the keys."""
    return {"id": sub["id"], "endpoint": sub["endpoint"], "label": sub.get("label"), "created_at": sub.get("created_at")}


# ---------- VAPID / subscriptions ----------
@router.get("/notifications/vapid-public-key")
def vapid_public_key():
    key = os.getenv("VAPID_PUBLIC_KEY")
    if not key:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return {"public_key": key}


@router.post("/me/push/subscriptions", status_code=201)
def add_subscription(body: SubscriptionIn, user: User = Depends(current_user)):
    existing = next((s for s in repo.list_owned(user.sub, "push_subscription") if s["endpoint"] == body.endpoint), None)
    rec = {**(existing or {}), "endpoint": body.endpoint, "keys": body.keys.model_dump(), "expiration_time": body.expiration_time, "label": body.label,
           "created_at": (existing or {}).get("created_at") or datetime.now(timezone.utc).isoformat()}
    return _public(repo.put(user.sub, "push_subscription", rec))


@router.get("/me/push/subscriptions")
def list_subscriptions(user: User = Depends(current_user)):
    return {"items": [_public(s) for s in repo.list_owned(user.sub, "push_subscription")]}


@router.delete("/me/push/subscriptions/{sid}")
def delete_subscription(sid: str, user: User = Depends(current_user)):
    repo.get_owned(user.sub, "push_subscription", sid)
    repo.delete_owned(user.sub, "push_subscription", sid)
    return {"deleted": sid}


# ---------- reminders ----------
def money(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def long_date(d: date) -> str:
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def _cite(c) -> Optional[dict]:
    return None if c is None else {"doc": c.doc_version_label, "page": c.page_start, "quote": c.quote}


def next_benefit_year_start(start_month: int, as_of: date) -> date:
    nxt = date(as_of.year, start_month, 1)
    if nxt <= as_of:
        nxt = date(as_of.year + 1, start_month, 1)
    return nxt


def next_covered_date(last: date, n_months: int) -> date:
    """Identical to the engine's interval arithmetic in ledger._frequency_ok."""
    m = last.month - 1 + n_months
    return date(last.year + m // 12, m % 12 + 1, min(last.day, 28))


def reminders_for_plan(code: str, b_raw: dict, as_of: date, plan=None, meta: Optional[dict] = None) -> list[dict]:
    """Reminders for one plan reference: a preset code, or an upload ref with its resolved plan and plan dict (api-correctness-3)."""
    plan = plan if plan is not None else PLANS[code]
    meta = meta if meta is not None else PLAN_META[code]
    b = derived_benefits(plan, b_raw, code)
    src = b.get("source") or {}
    src_words = f"plan document {meta['source_document'].get('version_label', code)}" + (f"; benefit statement dated {src['date']}" if src.get("date") else "; your records")
    out: list[dict] = []

    # 1. benefit-year end, cited to the plan's benefit-year definition
    bys = plan.benefit_year_start_month
    if bys.known:
        end = next_benefit_year_start(int(bys.value), as_of) - timedelta(days=1)
        if not plan.annual_max.known and not plan.annual_max_unlimited:
            text = REMINDER_BENEFIT_YEAR_END_NO_MAX.format(end=long_date(end))
        elif b.get("remaining_max_cents") is None or not plan.annual_max.known:
            text = REMINDER_BENEFIT_YEAR_END_NO_USAGE.format(end=long_date(end))
        else:
            text = REMINDER_BENEFIT_YEAR_END.format(end=long_date(end), date=src.get("date") or "not provided", remaining=money(b["remaining_max_cents"]), maximum=money(plan.annual_max.value))
        out.append({"kind": "benefit_year_end", "plan_code": code, "date": end.isoformat(), "text": text, "cite": _cite(bys.cite), "source": src_words})
    else:
        out.append({"kind": "benefit_year_end", "plan_code": code, "date": None, "text": REMINDER_BENEFIT_YEAR_UNKNOWN, "cite": None, "source": src_words})

    # 2. frequency clocks from the user's claims (the same clocks the engine applies)
    claims = b_raw.get("claims", [])
    by_key: dict[str, list[date]] = {}
    for c in claims:
        try:
            by_key.setdefault(c["procedure_key"], []).append(date.fromisoformat(c["date"]))
        except (KeyError, ValueError):
            continue
    period = "calendar year" if (bys.known and int(bys.value) == 1) else "benefit year"
    for rule in plan.frequency:
        dates = by_key.get(rule.procedure_key)
        if not dates:
            continue
        name = PROC_BY_KEY.get(rule.procedure_key, {}).get("name", rule.procedure_key)
        if rule.clock == "interval_months":
            last = max(dates)
            nxt = next_covered_date(last, rule.n)
            if nxt >= as_of:
                out.append({"kind": "frequency_next_eligible", "plan_code": code, "procedure_key": rule.procedure_key, "date": nxt.isoformat(),
                            "text": REMINDER_INTERVAL.format(name=name, months=rule.n, last=last.isoformat(), next=nxt.isoformat()), "cite": _cite(rule.cite), "source": src_words})
        elif rule.clock == "calendar_count" and bys.known:
            same = [d for d in dates if benefit_year(plan, d) == benefit_year(plan, as_of)]
            if same:
                reset = next_benefit_year_start(int(bys.value), as_of)
                out.append({"kind": "frequency_count_reset", "plan_code": code, "procedure_key": rule.procedure_key, "date": reset.isoformat(),
                            "text": REMINDER_CALENDAR_COUNT.format(name=name, n=rule.n, period=period, k=len(same), reset=reset.isoformat()), "cite": _cite(rule.cite), "source": src_words})
    return out


@router.get("/me/reminders")
def list_reminders(as_of: Optional[str] = None, user: User = Depends(current_user)):
    try:
        today = date.fromisoformat(as_of) if as_of else date.today()
    except ValueError:
        raise HTTPException(status_code=422, detail={"error": "as_of must be an ISO date"})
    items: list[dict] = []
    from .uploads import resolve_plan_ref, undecided_required
    for b in repo.list_owned(user.sub, "benefits"):
        try:
            res = resolve_plan_ref(user, b.get("plan_code") or "")
        except HTTPException:
            continue                      # a plan that can no longer be resolved gives no reminders (as in GET /me/benefits)
        items.extend(reminders_for_plan(res.ref, b, today, res.plan, res.meta))
    for d in repo.list_owned(user.sub, "document"):
        st = d.get("extraction") or {}
        # only a finished extraction whose required rows are still undecided is "waiting for your decisions" (api-correctness-27)
        if st.get("status") in EXTRACTION_FINISHED and d.get("extraction_status") != "published" and undecided_required(st.get("fields") or []):
            items.append({"kind": "document_awaiting_decision", "document_id": d["id"], "date": None, "text": REMINDER_DOCUMENT_AWAITING.format(label=d.get("filename") or d.get("label") or "document"),
                          "cite": None, "source": "your documents"})
    items.sort(key=lambda r: (r["date"] is None, r["date"] or ""))
    return {"as_of": today.isoformat(), "items": items,
            "note": "Reminders state dates and figures from your plan document and your records. They are information, not a prompt to act."}


# ---------- push test (dev only) ----------
@router.post("/me/push/test")
def push_test(user: User = Depends(current_user)):
    if not _dev_mode():
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    private_key, subject = os.getenv("VAPID_PRIVATE_KEY"), os.getenv("VAPID_SUBJECT")
    if not private_key or not subject or webpush is None:
        raise HTTPException(status_code=503, detail={"error": "push_not_configured"})
    sent, failed = 0, 0
    for s in repo.list_owned(user.sub, "push_subscription"):
        try:
            webpush(subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]}, data=json.dumps(PUSH_TEST_PAYLOAD),
                    vapid_private_key=private_key, vapid_claims={"sub": subject}, ttl=60)
            sent += 1
        except WebPushException as e:                                          # ids and outcomes only
            failed += 1
            log.warning("push test failed for subscription %s (%s)", s["id"], type(e).__name__)
        except Exception as e:
            failed += 1
            log.warning("push test failed for subscription %s (%s)", s["id"], type(e).__name__)
    return {"sent": sent, "failed": failed, "payload": PUSH_TEST_PAYLOAD}
