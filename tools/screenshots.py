#!/usr/bin/env python3
"""Visual + behavioural verification of the web app with Playwright (desktop 1366×900 and phone 360×780).

Walks: new-user start → labeled sample journey (Alex, real NC plan) → island/checkpoint detail → record a checkpoint (attribution) →
My plan landmarks → cost trail (reconciles) → Compare → Documents (clauses, sources, privacy) → keyboard navigation → reduced motion.
Requires the API on :8000 (ORALCOMPASS_DEV_AUTH=1) and the web preview on :4173.  Writes PNGs to the given directory and prints checks.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "shots"); OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:4173"
checks: dict[str, bool] = {}


def check(name: str, ok: bool, detail: str = ""):
    checks[name] = bool(ok)
    print(("PASS" if ok else "FAIL"), name, detail)


def run(pw, device: str, width: int, height: int, reduced_motion: str = "no-preference"):
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1, reduced_motion=reduced_motion)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(600)
    # fresh user → start screen (the demo user may already have journeys from earlier runs; handle both)
    if page.get_by_role("heading", name="Starting point").count():
        page.screenshot(path=OUT / f"{device}-00-start.png", full_page=True)
        page.get_by_role("button", name=lambda n: "Alex Chen" in n if n else False).click() if False else page.locator("button", has_text="Alex Chen").first.click()
        page.wait_for_timeout(1200)
    else:
        sel = page.get_by_label("Journey", exact=True)
        if sel.count():
            opts = sel.locator("option").all_inner_texts()
            tgt = next((o for o in opts if "Alex" in o), None)
            if tgt:
                sel.select_option(label=tgt); page.wait_for_timeout(800)
    page.wait_for_selector("text=checkpoints completed", timeout=15000)
    page.screenshot(path=OUT / f"{device}-01-journey.png", full_page=True)
    check(f"{device}: sample ribbon labels fictional records", page.get_by_text("Sample journey — fictional person and records").count() > 0)
    check(f"{device}: progress language", page.get_by_text("of", exact=False).filter(has_text="checkpoints completed").count() > 0)

    # select the 'Before your visit' island then its 'Appointment information recorded' checkpoint (confirmed by the dental team)
    page.get_by_role("button", name=lambda n: n.startswith("Before your visit") if n else False).first.click() if False else page.locator("button[aria-label^='Before your visit']").first.click()
    page.wait_for_timeout(400)
    page.locator("button[aria-label^='Appointment information recorded']").first.click()
    page.wait_for_timeout(500)
    page.screenshot(path=OUT / f"{device}-02-checkpoint.png", full_page=True)
    check(f"{device}: dental-team attribution shown", page.get_by_text("Confirmed by your dental team", exact=False).count() > 0)
    check(f"{device}: date source shown", page.get_by_text("2026-10-27", exact=False).count() > 0)
    check(f"{device}: next-checkpoint note does not imply readiness", page.get_by_text("does not record anything", exact=False).count() > 0)

    # record a checkpoint as user-marked: 'Preparation instructions viewed' stays awaiting; mark 'Appointment recorded' on the visit island
    page.locator("button[aria-label^='Your appointment']").first.click(); page.wait_for_timeout(300)
    page.locator("button[aria-label^='Appointment recorded']").first.click(); page.wait_for_timeout(400)
    page.get_by_label("Date", exact=True).fill("2026-10-27")
    page.get_by_role("button", name="Record this checkpoint").click(); page.wait_for_timeout(900)
    check(f"{device}: user-marked attribution after recording", page.get_by_text("Marked by you", exact=False).count() > 0)
    page.screenshot(path=OUT / f"{device}-03-recorded.png", full_page=True)

    # overview list (accessible equivalent)
    page.get_by_role("button", name="Overview list").click(); page.wait_for_timeout(300)
    check(f"{device}: overview table present", page.locator("table.ov-table").count() >= 3)
    page.screenshot(path=OUT / f"{device}-04-overview.png", full_page=True)
    page.get_by_role("button", name="Map view").click(); page.wait_for_timeout(300)

    # My plan → lighthouse → cost trail
    page.get_by_role("button", name="My plan").click(); page.wait_for_timeout(800)
    page.screenshot(path=OUT / f"{device}-05-plan.png", full_page=True)
    page.locator("button[aria-label^='Cost breakdown']").first.click(); page.wait_for_timeout(1200)
    page.screenshot(path=OUT / f"{device}-06-lighthouse.png", full_page=True)
    check(f"{device}: cost trail reconciles", page.get_by_text("Amounts reconcile", exact=False).count() > 0)
    check(f"{device}: you-pay total for Alex (NCFlex Classic) = $902.00", page.locator(".total", has_text="$902.00").count() > 0)
    check(f"{device}: trail step cites ML26 page", page.locator(".ts-clause", has_text="ML26").count() > 0)
    check(f"{device}: unknown rules flagged, not assumed", page.get_by_text("waiting period: not found", exact=False).count() > 0)
    # deductible landmark with depth 3 (exact wording) — on the phone the bottom sheet is closed first, as a person would
    def close_sheet():
        if device == "mobile" and page.get_by_role("button", name="Close details").count():
            page.get_by_role("button", name="Close details").first.click(); page.wait_for_timeout(200)
    close_sheet()
    page.locator("button[aria-label^='Deductible']").first.click(); page.wait_for_timeout(400)
    page.get_by_role("radio", name="Exact wording").click(); page.wait_for_timeout(300)
    check(f"{device}: exact wording quotes the guide", page.get_by_text("Calendar-Year Deductible", exact=False).count() > 0)
    page.screenshot(path=OUT / f"{device}-07-deductible-wording.png", full_page=True)
    # switch plan to a FEDVIP preset → nothing transfers → waiting for information
    close_sheet()
    page.locator("label.plan-pick select").first.select_option("FM26H"); page.wait_for_timeout(1500)
    close_sheet()
    page.locator("button[aria-label^='Cost breakdown']").first.click(); page.wait_for_timeout(600)
    check(f"{device}: other plan shows missing inputs (nothing transfers)", page.get_by_text("waiting for information", exact=False).count() > 0)
    page.screenshot(path=OUT / f"{device}-08-missing-inputs.png", full_page=True)
    page.locator("label.plan-pick select").first.select_option("ML26"); page.wait_for_timeout(800)

    # Compare
    page.get_by_role("button", name="Compare").click(); page.wait_for_timeout(2500)
    check(f"{device}: comparison grid renders", page.locator("table.grid").count() > 0)
    check(f"{device}: eligibility banner under columns", page.get_by_text("not that you are eligible to enroll", exact=False).count() > 0)
    page.screenshot(path=OUT / f"{device}-09-compare.png", full_page=True)

    # Documents
    page.get_by_role("button", name="Documents").click(); page.wait_for_timeout(1500)
    check(f"{device}: official source link present", page.locator("a[href^='https://oshr.nc.gov']").count() > 0)
    check(f"{device}: clauses listed with page references", page.locator("ol.clauses li").count() > 20)
    check(f"{device}: conflicts preserved", page.get_by_text("Where sources disagree", exact=False).count() > 0)
    check(f"{device}: source inventory listed", page.locator("ul.sources li").count() >= 12)
    page.screenshot(path=OUT / f"{device}-10-documents.png", full_page=True)
    # click a clause → clause card
    page.locator("ol.clauses li button").first.click(); page.wait_for_timeout(400)
    check(f"{device}: clause card opens", page.get_by_role("dialog").count() > 0)

    # keyboard: Tab reaches nav and map controls; Enter activates
    page.get_by_role("button", name="My journey").click(); page.wait_for_timeout(600)
    page.keyboard.press("Tab")
    focused = page.evaluate("document.activeElement && document.activeElement.textContent")
    for _ in range(40):
        page.keyboard.press("Tab")
        tag = page.evaluate("document.activeElement && (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent)")
        if tag and str(tag).startswith("Starting point"):
            page.keyboard.press("Enter"); page.wait_for_timeout(300)
            break
    check(f"{device}: keyboard activates an island", page.get_by_role("heading", name="Starting point").count() > 0, str(focused)[:40])
    check(f"{device}: no page errors", not errors, "; ".join(errors)[:200])
    browser.close()


with sync_playwright() as pw:
    run(pw, "desktop", 1366, 900)
    run(pw, "mobile", 360, 780, reduced_motion="reduce")
(OUT / "checks.json").write_text(json.dumps(checks, indent=1))
fails = [k for k, v in checks.items() if not v]
print(f"\n{len(checks) - len(fails)}/{len(checks)} checks passed")
sys.exit(1 if fails else 0)
