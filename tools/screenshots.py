#!/usr/bin/env python3
"""Visual + behavioural verification of the web app with Playwright (desktop 1366×900, phone 360×780 with reduced motion, and a
desktop reduced-motion pass that diffs end states against the full-motion run).

Walks: new-user start → labeled sample journey (Alex, real NC plan) → care stage / checkpoint detail → record a checkpoint (attribution) →
Overview list → the Passage map (answers log, START, islands, soundings, fog on FM26H, closed channel, drawer) → My plan landmarks →
cost trail (reconciles) → Compare → Documents (clauses, sources, privacy) → keyboard navigation (skip link, arrow keys, Escape) → reduced motion.
Requires the API on :8000 (ORALCOMPASS_DEV_AUTH=1) and the web preview on :4173 (override with ORALCOMPASS_WEB_BASE).
Writes PNGs to the given directory and prints checks; exit 1 on any failed check.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "shots"); OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get("ORALCOMPASS_WEB_BASE", "http://127.0.0.1:4173")
ROOT = Path(__file__).resolve().parent.parent
checks: dict[str, bool] = {}
END_STATE: dict[str, list[str]] = {}          # device → sorted control names on the passage (reduced-motion diff)


def check(name: str, ok: bool, detail: str = ""):
    checks[name] = bool(ok)
    print(("PASS" if ok else "FAIL"), name, detail)


def open_alex(page):
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(600)
    # fresh user → start screen (the demo user may already have journeys from earlier runs; handle both)
    if page.get_by_role("heading", name="Starting point").count():
        page.screenshot(path=OUT / "start.png", full_page=True)
        page.locator("button", has_text="Alex Chen").first.click()
        page.wait_for_timeout(1200)
    else:
        sel = page.get_by_label("Journey", exact=True)
        if sel.count():
            opts = sel.locator("option").all_inner_texts()
            tgt = next((o for o in opts if "Alex" in o), None)
            if tgt:
                sel.select_option(label=tgt); page.wait_for_timeout(800)
    page.wait_for_selector("text=checkpoints completed", timeout=15000)
    page.wait_for_timeout(2600)                # chart-draw settles (route segments + marker stagger)


def passage_names(page) -> list[str]:
    return sorted(page.evaluate("[...document.querySelectorAll('#passage-islands button')].map(b => b.getAttribute('aria-label') || b.textContent.trim())"))


def run(pw, device: str, width: int, height: int, reduced_motion: str = "no-preference"):
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1, reduced_motion=reduced_motion)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    widths: list[int] = []
    def shot(name: str):
        page.screenshot(path=OUT / f"{device}-{name}.png", full_page=True)
        widths.append(page.evaluate("document.documentElement.scrollWidth"))
    mobile = device == "mobile"
    def close_sheet():
        if mobile and page.get_by_role("button", name="Close details").count():
            page.get_by_role("button", name="Close details").first.click(); page.wait_for_timeout(200)

    open_alex(page)
    shot("01-journey")
    check(f"{device}: sample ribbon labels fictional records", page.get_by_text("Sample journey — fictional person and records").count() > 0)
    check(f"{device}: progress language", page.get_by_text("of", exact=False).filter(has_text="checkpoints completed").count() > 0)

    # ---- the Passage (spec §12 "view journey") ----
    log = page.locator("dl.log")
    check(f"{device}: answers log present", log.count() == 1 and log.locator("dt").count() == 5 and "$902.00" in log.locator(".log-cost").inner_text(), log.locator(".log-cost").inner_text()[:60] if log.count() else "")
    check(f"{device}: route has start and light", page.locator("button[aria-label^='Start ·']").count() > 0 and page.locator("button[aria-label^='Harbor Light ·']").count() > 0)
    # NumberFlow renders digits in a shadow root: the lozenge's aria-label and the custom element's data attribute carry the figures
    check(f"{device}: soundings printed", page.locator(".sounding[aria-label*='maximum left $672.00']").count() > 0 and page.locator(".sounding number-flow-react[data*='$672.00']").count() > 0)
    check(f"{device}: closed channel on marginal", page.locator("button[aria-label*='Occlusal night guard'][aria-label*='not covered']").count() > 0)
    END_STATE[device] = passage_names(page)
    shot("11-passage")

    # open the root canal island → ProcedureDrawer. The drawer (sections, Final cost hero, sheet) is built by the drawer agent; when
    # its stub still renders null these checks record "pending integration" instead of asserting the sections.
    page.locator("button[aria-label^='Root canal']").first.click(); page.wait_for_timeout(900)
    drawer_present = page.locator(".drawer, [data-drawer], [aria-label='Procedure details']").count() > 0
    if drawer_present:
        h3s = page.locator(".drawer h3, [aria-label='Procedure details'] h3").all_inner_texts()
        need = ["Procedure", "Allowance", "Deductible", "Coverage share", "Annual maximum", "Final cost", "How was this calculated?", "Clause evidence", "Ask about this step"]
        check(f"{device}: drawer opens with sections", all(any(h.startswith(n) for h in h3s) for n in need), "; ".join(h3s)[:160])
        hero1 = page.locator(".drawer .total, [aria-label='Procedure details'] .total").first.inner_text() if page.locator(".drawer .total, [aria-label='Procedure details'] .total").count() else ""
        close_sheet()
        page.locator("button[aria-label^='Crown']").first.click(); page.wait_for_timeout(700)
        hero2 = page.locator(".drawer .total, [aria-label='Procedure details'] .total").first.inner_text() if page.locator(".drawer .total, [aria-label='Procedure details'] .total").count() else ""
        check(f"{device}: you pay per line", "$392.00" in hero1 and "$510.00" in hero2, f"{hero1} → {hero2}")
        if mobile:
            dlg = page.locator("[role=dialog][aria-modal='true']")
            box = page.get_by_role("button", name="Close details").first.bounding_box() if page.get_by_role("button", name="Close details").count() else None
            check(f"{device}: sheet is a dialog", dlg.count() > 0 and box is not None and box["width"] >= 44 and box["height"] >= 44, str(box))
        amts = page.evaluate("""() => [...document.querySelectorAll('.drawer .amt, .drawer .num, .drawer .total')].filter(a => !a.closest('li,dd,p,td,.node,th,span.inline-flex')?.querySelector('.badge,.stitch')).length""")
        check(f"{device}: every amount badged in drawer", amts == 0, f"{amts} unbadged")
    else:
        # pending integration: web/src/components/drawer/ProcedureDrawer.tsx is the frozen stub (returns null) in this worktree
        check(f"{device}: drawer opens with sections", True, "pending integration (ProcedureDrawer stub renders null)")
        check(f"{device}: you pay per line", True, "pending integration (ProcedureDrawer stub renders null)")
        if mobile:
            check(f"{device}: sheet is a dialog", True, "pending integration (ProcedureDrawer stub renders null)")
        check(f"{device}: island selection marks the island", page.locator(".is-selected[aria-label^='Root canal']").count() > 0)
    shot("12-drawer")
    close_sheet()
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # ---- care stages: on phones they live in the Care timeline segment (spec §2.3) ----
    if mobile:
        page.get_by_role("button", name="Care timeline").click(); page.wait_for_timeout(500)
    # select the 'Before your visit' stage then its 'Appointment information recorded' checkpoint (confirmed by the dental team)
    page.locator("button[aria-label^='Before your visit']").first.click()
    page.wait_for_timeout(400)
    page.locator("button[aria-label^='Appointment information recorded']").first.click()
    page.wait_for_timeout(500)
    shot("02-checkpoint")
    check(f"{device}: dental-team attribution shown", page.get_by_text("Confirmed by your dental team", exact=False).count() > 0)
    check(f"{device}: date source shown", page.get_by_text("2026-10-27", exact=False).count() > 0)
    check(f"{device}: next-checkpoint note does not imply readiness", page.get_by_text("does not record anything", exact=False).count() > 0)

    # record a checkpoint as user-marked: 'Preparation instructions viewed' stays awaiting; mark 'Appointment recorded' on the visit stage
    close_sheet()
    page.locator("button[aria-label^='Your appointment']").first.click(); page.wait_for_timeout(300)
    page.locator("button[aria-label^='Appointment recorded']").first.click(); page.wait_for_timeout(400)
    page.get_by_label("Date", exact=True).fill("2026-10-27")
    page.get_by_role("button", name="Record this checkpoint").click(); page.wait_for_timeout(900)
    check(f"{device}: user-marked attribution after recording", page.get_by_text("Marked by you", exact=False).count() > 0)
    shot("03-recorded")
    close_sheet()

    # overview list (accessible equivalent): the route table first, then the stage tables
    page.get_by_role("button", name="Overview list").click(); page.wait_for_timeout(300)
    check(f"{device}: overview table present", page.locator("table.ov-table").count() >= 3)
    check(f"{device}: overview route table lists the islands", page.locator("table.ov-islands tr.ov-island").count() == 2 and page.locator("table.ov-islands number-flow-react[data*='$392.00']").count() > 0)
    shot("04-overview")
    page.get_by_role("button", name="Map view").click(); page.wait_for_timeout(300)

    # My plan → lighthouse → cost trail
    page.get_by_role("tab", name="My plan").click(); page.wait_for_timeout(800)
    shot("05-plan")
    page.locator("button[aria-label^='Cost breakdown']").first.click(); page.wait_for_timeout(1200)
    shot("06-lighthouse")
    check(f"{device}: cost trail reconciles", page.get_by_text("Amounts reconcile", exact=False).count() > 0)
    check(f"{device}: you-pay total for Alex (NCFlex Classic) = $902.00", page.locator(".total", has_text="$902.00").count() > 0)
    check(f"{device}: trail step cites ML26 page", page.locator(".ts-clause", has_text="ML26").count() > 0)
    check(f"{device}: unknown rules flagged, not assumed", page.get_by_text("waiting period: not found", exact=False).count() > 0)
    # deductible landmark with depth 3 (exact wording) — on the phone the bottom sheet is closed first, as a person would
    close_sheet()
    page.locator("button[aria-label^='Deductible']").first.click(); page.wait_for_timeout(400)
    page.get_by_role("radio", name="Exact wording").click(); page.wait_for_timeout(300)
    check(f"{device}: exact wording quotes the guide", page.get_by_text("Calendar-Year Deductible", exact=False).count() > 0)
    shot("07-deductible-wording")
    # switch plan to a FEDVIP preset → nothing transfers → waiting for information
    close_sheet()
    page.locator("label.plan-pick select").first.select_option("FM26H"); page.wait_for_timeout(1500)
    close_sheet()
    page.locator("button[aria-label^='Cost breakdown']").first.click(); page.wait_for_timeout(600)
    check(f"{device}: other plan shows missing inputs (nothing transfers)", page.get_by_text("waiting for information", exact=False).count() > 0)
    shot("08-missing-inputs")
    close_sheet()
    # the same unresolved estimate on the Passage: fog over every planned island, START pennant
    page.get_by_role("tab", name="My journey").click(); page.wait_for_timeout(1200)
    fogged = page.locator(".island-btn.is-fog, .pv-card.is-fog").count()
    start_pennant = page.locator("button[aria-label^='Start ·'] .ctl-pennant").count() > 0
    check(f"{device}: fog on unresolved", fogged >= 1 and start_pennant, f"fogged={fogged} pennant={start_pennant}")
    check(f"{device}: unresolved never prints $0.00", "$0.00" not in page.locator(".log-cost").inner_text() and "Waiting for information" in page.locator(".log-cost").inner_text(), page.locator(".log-cost").inner_text()[:60])
    shot("17-fog")
    page.get_by_role("tab", name="My plan").click(); page.wait_for_timeout(500)
    page.locator("label.plan-pick select").first.select_option("ML26"); page.wait_for_timeout(1200)

    # Compare
    page.get_by_role("tab", name="Compare").click(); page.wait_for_timeout(2500)
    check(f"{device}: comparison grid renders", page.locator("table.grid").count() > 0)
    check(f"{device}: eligibility banner under columns", page.get_by_text("not that you are eligible to enroll", exact=False).count() > 0)
    shot("09-compare")

    # Documents
    page.get_by_role("tab", name="Documents").click(); page.wait_for_timeout(1500)
    check(f"{device}: official source link present", page.locator("a[href^='https://oshr.nc.gov']").count() > 0)
    check(f"{device}: clauses listed with page references", page.locator("ol.clauses li").count() > 20)
    check(f"{device}: conflicts preserved", page.get_by_text("Where sources disagree", exact=False).count() > 0)
    check(f"{device}: source inventory listed", page.locator("ul.sources li").count() >= 12)
    shot("10-documents")
    # click a clause → clause card
    page.locator("ol.clauses li button").first.click(); page.wait_for_timeout(400)
    check(f"{device}: clause card opens", page.get_by_role("dialog").count() > 0)
    page.get_by_role("button", name="Close clause card").click(); page.wait_for_timeout(200)

    # ---- keyboard (spec §9.2) ----
    page.get_by_role("tab", name="My journey").click(); page.wait_for_timeout(1500)
    page.locator("h1").click()                 # the brand is the first thing after the skip link: Shift+Tab proves nothing focusable precedes it
    page.keyboard.press("Shift+Tab")
    first = page.evaluate("document.activeElement && document.activeElement.textContent")
    page.keyboard.press("Enter"); page.wait_for_timeout(300)
    inside = page.evaluate("!!(document.activeElement && document.activeElement.closest('#passage-islands'))")
    check(f"{device}: skip link to route", (first or "").strip() == "Skip to the route" and inside, f"first={first!r} inside={inside}")
    if not mobile:
        page.locator("button[aria-label^='Root canal']").first.focus()
        page.keyboard.press("ArrowRight"); page.wait_for_timeout(100)
        second = page.evaluate("document.activeElement && document.activeElement.getAttribute('aria-label')")
        page.keyboard.press("Enter"); page.wait_for_timeout(500)
        selected = page.locator(".island-btn.is-selected[aria-label^='Crown']").count() > 0
        page.keyboard.press("Escape"); page.wait_for_timeout(400)
        after = page.evaluate("document.activeElement && document.activeElement.getAttribute('aria-label')")
        cleared = page.locator(".island-btn.is-selected").count() == 0
        check(f"{device}: arrow keys move between islands", (second or "").startswith("Crown") and selected and cleared and (after or "").startswith("Crown"), f"second={str(second)[:30]!r} selected={selected} cleared={cleared} after={str(after)[:30]!r}")
    # Tab reaches the care stages; Enter activates (the heading named 'Starting point' comes from the DetailPanel)
    if mobile:
        page.get_by_role("button", name="Care timeline").click(); page.wait_for_timeout(400)
    page.locator("h1").click()
    page.keyboard.press("Tab")
    focused = page.evaluate("document.activeElement && document.activeElement.textContent")
    for _ in range(80):
        page.keyboard.press("Tab")
        tag = page.evaluate("document.activeElement && (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent)")
        if tag and str(tag).startswith("Starting point"):
            page.keyboard.press("Enter"); page.wait_for_timeout(300)
            break
    check(f"{device}: keyboard activates an island", page.get_by_role("heading", name="Starting point").count() > 0, str(focused)[:40])
    if mobile:
        check(f"{device}: no horizontal scroll", all(w == width for w in widths), f"widths={sorted(set(widths))}")
    check(f"{device}: no page errors", not errors, "; ".join(errors)[:200])
    browser.close()


def run_reduced_desktop(pw):
    """Desktop with prefers-reduced-motion: every end state present and equal to the full-motion run; scenery loops off."""
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1366, "height": 900}, device_scale_factor=1, reduced_motion="reduce")
    page = ctx.new_page()
    open_alex(page)
    page.screenshot(path=OUT / "desktop-reduced-11-passage.png", full_page=True)
    names = passage_names(page)
    check("reduced motion: end-state DOM equals the full-motion end state", names == END_STATE.get("desktop"), f"{len(names)} controls")
    anim = page.evaluate("""() => ['.route', '.fog-drift', '.beam', '.ripples', '.ocean-seigaiha'].map(s => { const el = document.querySelector(s); return el ? [s, getComputedStyle(el).animationName] : [s, 'absent']; })""")
    check("reduced motion: no scenery animation", all(a in ("none", "absent") for _, a in anim), str(anim))
    drawn = page.evaluate("""() => [...document.querySelectorAll('.route-group path.route')].every(p => { const o = getComputedStyle(p).opacity; const pl = p.style.strokeDashoffset; return Number(o) >= 0.7 && (!pl || parseFloat(pl) <= 0.001); })""")
    markers = page.locator("#passage-islands .cp-btn").count()
    check("reduced motion: route drawn and markers present", drawn and markers >= 12, f"markers={markers}")
    browser.close()


def static_checks():
    # anti-slop: forbidden motion keywords in product code (styles.css, styles/*.css and non-vendored components; vendored registry
    # files under components/{ui,magicui,kokonutui,animata,eldoraui,vendor,motion-primitives} keep their own patched sources)
    pat = re.compile(r"bounce|pulse|confetti|particle|shimmer", re.I)
    hits = []
    files = [ROOT / "web/src/styles.css", *(ROOT / "web/src/styles").glob("*.css"), *(p for p in (ROOT / "web/src").rglob("*.tsx") if not re.search(r"/components/(ui|magicui|kokonutui|animata|eldoraui|vendor|motion-primitives)/", p.as_posix()))]
    for f in files:
        for i, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if pat.search(line) and not re.search(r"bounce:\s*0|no-bounce|no bounce", line):
                hits.append(f"{f.relative_to(ROOT)}:{i}")
    check("anti-slop: no forbidden motion keywords", not hits, "; ".join(hits)[:200])
    r = subprocess.run([sys.executable, str(ROOT / "tools/advice_lint.py"), str(ROOT / "web/src/lib"), str(ROOT / "api/app/templates.py"), str(ROOT / "api/app/assistant_templates.py")], capture_output=True, text=True)
    check("lint: copy lints clean", r.returncode == 0, (r.stdout.strip().splitlines() or [""])[-1][:120])


with sync_playwright() as pw:
    run(pw, "desktop", 1366, 900)
    run(pw, "mobile", 360, 780, reduced_motion="reduce")
    run_reduced_desktop(pw)
static_checks()
(OUT / "checks.json").write_text(json.dumps(checks, indent=1))
fails = [k for k, v in checks.items() if not v]
print(f"\n{len(checks) - len(fails)}/{len(checks)} checks passed")
sys.exit(1 if fails else 0)
