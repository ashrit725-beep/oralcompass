#!/usr/bin/env python3
"""Visual + behavioural verification of the web app with Playwright (desktop 1366×900, phone 360×780 with reduced motion, and a
desktop reduced-motion pass that diffs end states against the full-motion run).

Walks: new-user start → labeled sample journey (Alex, real NC plan) → the Passage map (answers log, START, islands, soundings, closed channel)
→ the ProcedureDrawer (sections, Final cost hero, pipeline, equation rows, receipt table, checkpoint strip, thread to the clause card, the
inline assistant with a demo answer, an advice question, the clause composer) → arriving from a checkpoint → START / Harbor Light /
marginal / visited drawers → care stage / checkpoint detail → record a checkpoint (attribution) → Overview list → My plan (selector
cascade, preset/upload switch, benefits compass, restriction → cove, depth dial, benefit statement form) → cost trail (reconciles) → FM26H
(nothing transfers: fog, compass without a maximum, fogged drawer) → Compare (grid, clause popover/sheet, rails) → Documents (clauses,
sources, privacy, reminders, upload wizard: type validation, demo extraction, review table, hold-to-publish → UP1) → keyboard navigation
(skip link, arrow keys, Escape) → add a procedure (desktop; reverted) → reduced motion.
Requires the API on :8000 (ORALCOMPASS_DEV_AUTH=1, demo llm mode for the extraction/assistant checks) and the web preview on :4173
(override with ORALCOMPASS_WEB_BASE). Writes PNGs to the given directory and prints checks; exit 1 on any failed check.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "shots"); OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get("ORALCOMPASS_WEB_BASE", "http://127.0.0.1:4173")
ROOT = Path(__file__).resolve().parent.parent
checks: dict[str, bool] = {}
END_STATE: dict[str, list[str]] = {}          # device → sorted control names on the passage (reduced-motion diff)
DRAWER_H3 = ["Procedure", "Allowance", "Deductible", "Coverage share", "Annual maximum", "Final cost", "How was this calculated?", "Clause evidence", "Ask about this step"]
# Every `.amt/.num/.total` inside the drawer must have a badge or a stitch in its closest fact container (spec §12 "trust"); amounts that
# ARE the chip text (inside `.stitch`) are the evidence themselves.
UNBADGED_JS = """(root) => [...document.querySelectorAll(root + ' .amt, ' + root + ' .num, ' + root + ' .total')]
  .filter(a => !a.closest('.stitch') && !a.closest('li,dd,p,td,.node')?.querySelector('.badge,.stitch')).length"""
# NumberFlow renders digits in a shadow root: a figure is "printed" when the text, an aria-label or the custom element's data carries it.
HAS_AMOUNT_JS = """([sel, amt]) => [...document.querySelectorAll(sel)].some(el => (el.innerText || '').includes(amt) || (el.getAttribute('aria-label') || '').includes(amt)
  || [...el.querySelectorAll('number-flow-react,[aria-label],[data-amount]')].some(n => (n.getAttribute('data') || '').includes(amt) || (n.getAttribute('aria-label') || '').includes(amt) || (n.getAttribute('data-amount') || '') === amt))"""


def check(name: str, ok: bool, detail: str = ""):
    checks[name] = bool(ok)
    print(("PASS" if ok else "FAIL"), name, detail)


def api(path: str, method: str = "GET", body: dict | None = None):
    """Direct call through the preview's /api proxy as the demo user (used only to revert the test procedure the walk adds)."""
    req = urllib.request.Request(f"{BASE}/api{path}", method=method, headers={"X-Dev-User": "demo-user", "Content-Type": "application/json"},
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"null")


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
        if sel.count() and not sel.first.is_visible() and page.locator("details.journey-switch > summary").count():
            page.locator("details.journey-switch > summary").first.click(); page.wait_for_timeout(200)   # phones keep the pickers in a disclosure
        if sel.count():
            opts = sel.locator("option").all_inner_texts()
            tgt = next((o for o in opts if "Alex" in o), None)
            if tgt:
                sel.select_option(label=tgt); page.wait_for_timeout(800)
    page.wait_for_selector("text=checkpoints completed", timeout=15000)
    page.wait_for_timeout(2600)                # chart-draw settles (route segments + marker stagger)


def passage_names(page) -> list[str]:
    return sorted(page.evaluate("[...document.querySelectorAll('#passage-islands button')].map(b => b.getAttribute('aria-label') || b.textContent.trim())"))


def has_amount(page, sel: str, amt: str) -> bool:
    return bool(page.evaluate(HAS_AMOUNT_JS, [sel, amt]))


def dev_context(browser, **kwargs):
    """A browser context for the dev walk. The production bundle (`npm run build`) sends no X-Dev-User header (lib/auth.ts: only dev builds
    or VITE_DEV_AUTH=1 do; production identifies visitors by the session cookie), so the walk adds the dev header to /api requests itself,
    matching the dev user this script seeds and reverts through the API."""
    ctx = browser.new_context(**kwargs)

    def add_dev_user(route):
        headers = {**route.request.headers}
        headers.setdefault("x-dev-user", "demo-user")
        route.continue_(headers=headers)
    ctx.route(re.compile(r"^https?://[^/]+/api/"), add_dev_user)
    return ctx


def run(pw, device: str, width: int, height: int, reduced_motion: str = "no-preference"):
    browser = pw.chromium.launch()
    ctx = dev_context(browser, viewport={"width": width, "height": height}, device_scale_factor=1, reduced_motion=reduced_motion)
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
            page.get_by_role("button", name="Close details").first.click(); page.wait_for_timeout(300)
    def drawer_gone(ms: int = 2000) -> bool:
        """Desktop: with nothing selected the detail column leaves (exit + the map's layout glide), so wait for the drawer to detach."""
        try:
            page.wait_for_function("!document.querySelector('.drawer')", timeout=ms); return True
        except Exception:  # noqa: BLE001
            return False
    def close_drawer():
        """Close whatever detail surface is open: the phone sheet, else Escape (clause card first, then the drawer)."""
        close_sheet()
        if page.locator(".drawer").count():
            page.keyboard.press("Escape"); page.wait_for_timeout(300); drawer_gone()
        if page.locator(".drawer").count() and page.get_by_role("button", name="Close details").count():
            page.get_by_role("button", name="Close details").first.click(); page.wait_for_timeout(300)
    def drawer_h3s() -> list[str]:
        return [h for h in page.locator(".drawer h3").all_inner_texts() if h.strip()]
    def hero_text() -> str:
        return page.locator(".drawer .final-hero .amt").first.inner_text() if page.locator(".drawer .final-hero .amt").count() else ""
    def open_island(prefix: str, wait: int = 900):
        page.locator(f"button[aria-label^='{prefix}']").first.click(); page.wait_for_timeout(wait)

    open_alex(page)
    shot("01-journey")
    # nothing opens by itself: no stage panel, sheet or drawer at load, and the desktop map keeps the full width (no detail column)
    check(f"{device}: no detail surface open at load", page.locator(".detail, .drawer, .passage-layout.has-detail").count() == 0)
    check(f"{device}: sample ribbon labels fictional records", page.get_by_text("Sample journey: fictional person and records").count() > 0)
    check(f"{device}: progress language", page.get_by_text("of", exact=False).filter(has_text="checkpoints completed").count() > 0)

    # ---- the Passage (spec §12 "view journey") ----
    log = page.locator("dl.log")
    check(f"{device}: answers log present", log.count() == 1 and log.locator("dt").count() == 5 and "$902.00" in log.locator(".log-cost").inner_text(), log.locator(".log-cost").inner_text()[:60] if log.count() else "")
    check(f"{device}: route has start and light", page.locator("button[aria-label^='Start ·']").count() > 0 and page.locator("button[aria-label^='Harbor Light ·']").count() > 0)
    # NumberFlow renders digits in a shadow root: the lozenge's aria-label and the custom element's data attribute carry the figures
    check(f"{device}: soundings printed", page.locator(".sounding[aria-label*='maximum left $672.00']").count() > 0 and page.locator(".sounding number-flow-react[data*='$672.00']").count() > 0)
    if not mobile:   # findings layout-1 / slop-7: each lozenge holds its figures and covers no control on the chart
        sd = page.evaluate("""(() => { const ctl = [...document.querySelectorAll('#passage-islands button')].map(b => b.getBoundingClientRect());
          return [...document.querySelectorAll('#passage-islands .sounding')].map(s => { const r = s.getBoundingClientRect();
            const spill = [...s.querySelectorAll('.amt')].some(a => a.getBoundingClientRect().right > r.right + 0.5);
            const hit = ctl.some(c => c.left < r.right - 2 && r.left < c.right - 2 && c.top < r.bottom - 2 && r.top < c.bottom - 2);
            return spill || hit; }).filter(Boolean).length; })()""")
        check(f"{device}: soundings hold their figures and cover no control", sd == 0, f"bad={sd}")
    check(f"{device}: closed channel on marginal", page.locator("button[aria-label*='Occlusal night guard'][aria-label*='not covered']").count() > 0)
    END_STATE[device] = passage_names(page)
    shot("11-passage")
    if mobile:   # money is never cut: every phone passage amount fits its box and the screen (trust test)
        cut = page.evaluate("[...document.querySelectorAll('.passage-vertical-wrap .amt')].filter(e => { const r = e.getBoundingClientRect(), box = e.closest('.pv-amt, .pv-amt-line'), card = e.closest('button'); return (box && r.right > box.getBoundingClientRect().right + 0.5) || (card && r.right > card.getBoundingClientRect().right + 0.5) || r.right > document.documentElement.clientWidth + 0.5; }).map(e => e.closest('button')?.getAttribute('aria-label')?.slice(0, 40))")
        check(f"{device}: phone passage amounts are not clipped", not cut, str(cut[:4]))
        tap = page.evaluate("getComputedStyle(document.querySelector('.pv-card')).webkitTapHighlightColor")
        check(f"{device}: phone cards use the on-palette pressed state (no grey tap rectangle)", tap in ("rgba(0, 0, 0, 0)", "transparent"), str(tap))

    # ---- shell (fix/web-shell): one main landmark, the phone dock, choose-then-commit, the desktop drawer pinned to the viewport ----
    shell = page.evaluate("""(() => { const tabs = [...document.querySelectorAll('[role=tab]')]; const vh = innerHeight;
      return { mains: document.querySelectorAll('main:not([role]),[role=main]').length, panelTab: document.querySelector('[role=tabpanel]')?.getAttribute('tabindex'),
               skip: [...document.querySelectorAll('.skip-link')].map(a => a.textContent), current: document.querySelectorAll('[role=tab][aria-current]').length,
               dockFixed: !!document.querySelector('.dock') && getComputedStyle(document.querySelector('.dock')).position === 'fixed',
               tabsAtBottom: tabs.length === 4 && tabs.every(t => { const r = t.getBoundingClientRect(); return r.bottom <= vh + 1 && r.top >= vh - 90 && r.height >= 44; }) }; })()""")
    check(f"{device}: main landmark and skip link (a11y-4)", shell["mains"] == 1 and shell["panelTab"] == "-1" and shell["skip"][:1] == ["Skip to content"] and shell["current"] == 0, str(shell))
    if mobile:
        check(f"{device}: view tabs in the bottom dock (slop-30)", shell["dockFixed"] and shell["tabsAtBottom"], str(shell))
    add = page.get_by_label("Add a journey", exact=True)
    before = page.get_by_label("Journey", exact=True).locator("option").count() if page.get_by_label("Journey", exact=True).count() else 0
    add.select_option("empty"); page.wait_for_timeout(500)
    after = page.get_by_label("Journey", exact=True).locator("option").count() if page.get_by_label("Journey", exact=True).count() else 0
    add_btn = page.locator(".add-journey-form button[type=submit]")
    check(f"{device}: choosing a journey creates nothing until Add (a11y-16)", before == after and add_btn.count() == 1 and add_btn.is_enabled(), f"options {before}->{after}")
    add.select_option(""); page.wait_for_timeout(200)
    if not mobile:
        page.mouse.wheel(0, 500); page.wait_for_timeout(400)
        open_island("Root canal", 1200)
        top = page.evaluate("(() => { const d = document.querySelector('.drawer'); return d ? Math.round(d.getBoundingClientRect().top) : null; })()")
        check(f"{device}: drawer pinned to the viewport after scrolling (demo-2)", top is not None and 0 <= top <= 40, f"drawer top={top}")
        close_drawer(); page.mouse.wheel(0, -2000); page.wait_for_timeout(400)

    # ---- open the root canal island → ProcedureDrawer (spec §12 "open island", "view calculation", "trust") ----
    open_island("Root canal", 1200)
    h3s = drawer_h3s()
    check(f"{device}: drawer opens with sections", page.locator(".drawer").count() > 0 and all(any(h.startswith(n) for h in h3s) for n in DRAWER_H3), "; ".join(h3s)[:200])
    if not mobile:
        check(f"{device}: other island labels keep full contrast while one is selected", page.evaluate("[...document.querySelectorAll('.island-btn:not(.is-selected)')].every(b => getComputedStyle(b).opacity === '1')"))
        crumbs = page.locator(".drawer .crumbs, .drawer [class*='crumb']").first.inner_text() if page.locator(".drawer .crumbs, .drawer [class*='crumb']").count() else ""
        check(f"{device}: drawer is a labelled region with crumbs", page.locator("[role=region][aria-label='Procedure details']").count() > 0 and "Island 1 of 2" in crumbs and "Narrow Strait" in crumbs, crumbs[:80])
    hero1 = hero_text()
    nodes = page.locator(".drawer .pipeline .node")
    rules = page.evaluate("[...document.querySelectorAll('.drawer .pipeline .node')].map(n => n.getAttribute('data-rule'))")
    check(f"{device}: pipeline reconciles", nodes.count() == 6 and rules == ["fee", "N", "D", "CO", "M", "total"] and page.locator(".drawer", has_text="Amounts reconcile").count() > 0, str(rules))
    eq = page.locator(".drawer .eq-rows li")
    share_row = page.locator(".drawer .eq-rows li", has_text="plan share")
    check(f"{device}: equation rows", eq.count() == 7 and share_row.count() > 0 and share_row.first.locator(".stitch").count() > 0, f"rows={eq.count()}")
    if mobile:
        page.locator(".drawer details[data-section='calculation'] > summary").first.click(); page.wait_for_timeout(300)
    page.locator(".drawer details.full-trail > summary").first.click(); page.wait_for_timeout(300)
    page.locator(".drawer details.receipt-details > summary").first.click(); page.wait_for_timeout(300)
    check(f"{device}: receipt table one click", page.locator(".drawer table.receipt").first.is_visible())
    shot("13-pipeline")
    un = page.evaluate(UNBADGED_JS, ".drawer")
    check(f"{device}: every amount badged in drawer", un == 0 and page.locator(".drawer .amt").count() <= page.locator(".drawer .badge, .drawer .stitch").count(), f"{un} unbadged; amt={page.locator('.drawer .amt').count()} badges+stitches={page.locator('.drawer .badge, .drawer .stitch').count()}")
    # checkpoint strip: the 4th chip (fee, N, D, CO) focuses the Coverage share heading
    page.locator(".drawer .cp-strip button").nth(3).click(); page.wait_for_timeout(300)
    focused = page.evaluate("document.activeElement && [document.activeElement.tagName, document.activeElement.getAttribute('tabindex'), document.activeElement.textContent]")
    check(f"{device}: chip focuses section", bool(focused) and focused[0] == "H3" and focused[1] == "-1" and focused[2] == "Coverage share", str(focused))
    if mobile:
        dlg = page.locator("[role=dialog][aria-modal='true']")
        box = page.get_by_role("button", name="Close details").first.bounding_box() if page.get_by_role("button", name="Close details").count() else None
        first_h3 = h3s[0] if h3s else ""
        annual_closed = page.evaluate("(() => { const d = document.querySelector('.drawer [data-section=annualMax]'); return !!d && d.tagName === 'DETAILS' && !d.open; })()")
        sheet_is_dialog = page.locator("[role=dialog][aria-modal='true'].drawer-sheet, [role=dialog][aria-modal='true'] .drawer-sheet").count() > 0
        check(f"{device}: sheet is a dialog", dlg.count() > 0 and sheet_is_dialog and box is not None and box["width"] >= 44 and box["height"] >= 44
              and page.evaluate("document.documentElement.scrollWidth") == width and first_h3 == "Final cost" and annual_closed, f"box={box} first_h3={first_h3!r} annualMax closed={annual_closed}")
    if reduced_motion == "reduce":
        animated = page.evaluate("[...document.querySelectorAll('.drawer, .drawer *')].filter(e => getComputedStyle(e).animationName !== 'none').length")
        check(f"{device}: no animations in drawer under reduced motion", animated == 0 and nodes.count() == 6 and page.locator(".drawer .final-hero").count() > 0, f"animated={animated}")

    # ---- the inline assistant inside the drawer (spec §12 "assistant demo") ----
    ta = page.locator(".drawer textarea").first
    ta.scroll_into_view_if_needed(); ta.fill("What happens to the annual maximum on this line?")
    page.locator(".drawer").get_by_role("button", name="Ask", exact=True).first.click(); page.wait_for_timeout(2500)
    ans = page.locator(".drawer .as-answer")
    ribbon = page.locator(".drawer .as-ribbon").first.inner_text() if page.locator(".drawer .as-ribbon").count() else ""
    bare = page.evaluate("""() => [...document.querySelectorAll('.drawer .as-answer .as-text')].some(t => /\\$\\s?\\d/.test([...t.childNodes].filter(n => n.nodeType === 3 || !n.closest || !n.classList.contains('amt')).map(n => n.nodeType === 3 ? n.textContent : (n.querySelector('.amt') ? '' : n.textContent)).join('')))""")
    un_as = page.evaluate("[...document.querySelectorAll('.drawer .as-answer .amt')].filter(a => !a.closest('.stitch') && !a.parentElement.querySelector('.badge')).length")
    check(f"{device}: assistant demo answer grounded", ans.locator(".as-sentence").count() >= 1 and ans.locator(".stitch").count() >= 1 and ribbon.startswith("Demo mode") and page.locator(".drawer", has_text="Looked up:").count() > 0 and not bare and un_as == 0,
          f"sentences={ans.locator('.as-sentence').count()} stitches={ans.locator('.stitch').count()} ribbon={ribbon[:30]!r} bare$={bare} unbadged={un_as}")
    shot("16-assistant")
    # the clause composer: a stitch chip in the answer opens the ClauseCard with its own composer
    ans.locator(".stitch").first.click(); page.wait_for_timeout(600)
    card = page.locator(".clause[role=dialog]")
    check(f"{device}: clause composer", card.count() > 0 and card.locator("textarea[placeholder='Ask about this clause…']").count() > 0, f"card={card.count()}")
    page.keyboard.press("Escape"); page.wait_for_timeout(400)
    ta = page.locator(".drawer textarea").first
    ta.scroll_into_view_if_needed(); ta.fill("Should I get the crown?")
    page.locator(".drawer").get_by_role("button", name="Ask", exact=True).first.click(); page.wait_for_timeout(2000)
    bare2 = page.evaluate("""() => { const c = document.querySelector('.drawer .as-answer, .drawer .as-card'); if (!c) return true; const clone = c.cloneNode(true); clone.querySelectorAll('.amt').forEach(a => a.remove()); return /\\$\\s?\\d/.test(clone.textContent); }""")
    check(f"{device}: advice question gets template", page.locator(".drawer", has_text="Information, not a choice").count() > 0 and not bare2, f"bare$={bare2}")

    # ---- thread to the clause (spec §12 "view clause evidence"): Escape closes the card first, the drawer second ----
    page.locator(".drawer [data-section='share'] .stitch").first.scroll_into_view_if_needed()
    page.locator(".drawer [data-section='share'] .stitch").first.click(); page.wait_for_timeout(600)
    card = page.locator(".clause[role=dialog]")
    opened = card.count() > 0
    if opened:
        page.get_by_role("radio", name="Exact wording").click(); page.wait_for_timeout(300)
    quote = card.locator("blockquote").first.inner_text() if opened and card.locator("blockquote").count() else ""
    capt = card.locator("figcaption").first.inner_text() if opened and card.locator("figcaption").count() else ""
    shot("14-thread")
    page.keyboard.press("Escape"); page.wait_for_timeout(400)
    card_closed = page.locator(".clause[role=dialog]").count() == 0 and page.locator(".drawer").count() > 0
    check(f"{device}: thread to clause", opened and ("60%" in quote or "Type II" in quote) and "25" in capt and card_closed, f"opened={opened} quote={quote[:40]!r} capt={capt[:30]!r} card_closed={card_closed}")
    if not mobile:
        page.keyboard.press("Escape"); page.wait_for_timeout(400); drawer_gone()
        after = page.evaluate("document.activeElement && document.activeElement.getAttribute('aria-label')")
        check(f"{device}: escape closes drawer and returns focus", page.locator(".drawer").count() == 0 and (after or "").startswith("Root canal"), f"after={str(after)[:30]!r}")
    else:
        close_drawer()

    # you pay per line: the crown's hero after the root canal's
    open_island("Crown", 900)
    hero2 = hero_text()
    check(f"{device}: you pay per line", "$392.00" in hero1 and "$510.00" in hero2, f"{hero1!r} → {hero2!r}")
    shot("12-drawer")
    close_drawer()

    # ---- arriving from a checkpoint (desktop: the phone passage lists checkpoints inside the drawer, not as route markers) ----
    if not mobile:
        page.locator("button[data-cp-of][aria-label^='Deductible']").first.click(); page.wait_for_timeout(900)
        focused = page.evaluate("document.activeElement && [document.activeElement.tagName, document.activeElement.textContent]")
        check(f"{device}: arrive from a checkpoint focuses its section", bool(focused) and focused[0] == "H3" and focused[1] == "Deductible", str(focused))
        close_drawer()

    # ---- START, Harbor Light, marginal, visited drawers ----
    open_island("Start ·", 900)
    check(f"{device}: START drawer shows the statement figures", has_amount(page, ".drawer", "$1,260.00") and page.locator(".drawer", has_text="Benefit statement figures").count() > 0)
    shot("21-start-drawer")
    close_drawer()
    open_island("Harbor Light", 900)
    rows = page.locator(".drawer table.harbor-table tbody tr")
    soundings = page.locator(".drawer", has_text="maximum left").count() > 0 and has_amount(page, ".drawer", "$162.00")
    check(f"{device}: Harbor Light drawer totals", has_amount(page, ".drawer", "$902.00") and has_amount(page, ".drawer", "$1,098.00") and rows.count() == 2 and soundings, f"rows={rows.count()} soundings={soundings}")
    shot("22-harbor-drawer")
    close_drawer()
    open_island("Occlusal night guard", 900)
    check(f"{device}: marginal drawer states not covered", page.locator(".drawer", has_text="Not covered · excluded by the plan").count() > 0 and page.locator(".drawer .final-hero").count() == 0 and page.locator(".drawer .pipeline").count() == 0)
    close_drawer()
    page.locator("button[data-island^='visited:'], [aria-labelledby='pv-visited-h'] button").first.click(); page.wait_for_timeout(900)
    check(f"{device}: visited drawer is statement-sourced", page.locator(".drawer .badge-user").count() >= 4 and page.locator(".drawer .pipeline").count() == 0, f"user badges={page.locator('.drawer .badge-user').count()}")
    close_drawer()
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # ---- care stages: on phones they live in the Care timeline segment (spec §2.3) ----
    if mobile:
        page.get_by_role("button", name="Care timeline").click(); page.wait_for_timeout(500)
    # select the 'Before your visit' stage then its 'Appointment information recorded' checkpoint (confirmed by the dental team)
    page.locator("button[aria-label^='Before your visit']").first.click()
    page.wait_for_timeout(400)
    if mobile:   # the phone stage detail is a modal sheet: it holds focus and must be closed before the timeline behind it is used
        check(f"{device}: stage detail is a modal sheet", page.locator("[role=dialog][aria-modal=true] h2#detail-h").count() == 1)
        close_sheet()
    page.locator("button[aria-label^='Appointment information recorded']").first.click()
    page.wait_for_timeout(500)
    shot("02-checkpoint")
    check(f"{device}: dental-team attribution shown", page.get_by_text("Confirmed by your dental team", exact=False).count() > 0)
    check(f"{device}: date source shown", page.get_by_text("2026-10-27", exact=False).count() > 0)
    check(f"{device}: next-checkpoint note does not imply readiness", page.get_by_text("does not record anything", exact=False).count() > 0)

    # record a checkpoint as user-marked: 'Preparation instructions viewed' stays awaiting; mark 'Appointment recorded' on the visit stage
    close_sheet()
    page.locator("button[aria-label^='Your appointment']").first.click(); page.wait_for_timeout(300)
    close_sheet()
    page.locator("button[aria-label^='Appointment recorded']").first.click(); page.wait_for_timeout(400)
    page.get_by_label("Date", exact=True).fill("2026-10-27")
    page.get_by_role("button", name="Record this checkpoint").click(); page.wait_for_timeout(900)
    check(f"{device}: user-marked attribution after recording", page.get_by_text("Marked by you", exact=False).count() > 0)
    shot("03-recorded")
    close_sheet()

    # overview list (accessible equivalent): the route table first, then the stage tables
    page.get_by_role("button", name="Overview list").click(); page.wait_for_timeout(300)
    check(f"{device}: overview table present", page.locator("table.ov-table").count() >= 3)
    check(f"{device}: skip link target exists in the overview segment", page.evaluate("(() => { const a = document.querySelector('a.skip-link'); return !!a && !!document.querySelector(a.getAttribute('href')); })()"))
    check(f"{device}: overview route table lists the islands", page.locator("table.ov-islands tr.ov-island").count() == 2 and page.locator("table.ov-islands number-flow-react[data*='$392.00']").count() > 0)
    shot("04-overview")
    page.get_by_role("button", name="Map view").click(); page.wait_for_timeout(300)

    # ---- My plan: selector, compass, landmarks (spec §12 "select plan", "answers from the compass", "depth dial", "benefit statement") ----
    page.get_by_role("tab", name="My plan").click(); page.wait_for_timeout(800)
    shot("05-plan")
    if not mobile:
        page.locator("select[aria-label='Carrier']").select_option(label="Metropolitan Life Insurance Company (MetLife)"); page.wait_for_timeout(300)
        page.locator("select[aria-label='Plan name']").select_option(label="NCFlex Dental Plan (State of North Carolina), Classic Option"); page.wait_for_timeout(1200)
        picked = page.locator("label.plan-pick select").first.input_value()
        year_disabled = page.evaluate("document.querySelector(\"select[aria-label='Plan year']\").disabled")
        check(f"{device}: plan selector cascades", picked == "ML26" and year_disabled, f"picked={picked} year disabled={year_disabled}")
    radios = page.get_by_role("radio", name=re.compile("^(Preset plan|Your uploaded document)"))
    boxes = [radios.nth(i).bounding_box() for i in range(radios.count())]
    radios.filter(has_text="Your uploaded document").first.click(); page.wait_for_timeout(400)
    upload_group = page.locator("[role=group][aria-label='Your uploaded document']").count() > 0
    pick_works = page.locator("label.plan-pick select").count() > 0
    radios.filter(has_text="Preset plan").first.click(); page.wait_for_timeout(300)
    check(f"{device}: preset/upload switch", len(boxes) == 2 and all(b and b["height"] >= 44 for b in boxes) and upload_group and pick_works, f"boxes={[b and round(b['height']) for b in boxes]} group={upload_group}")
    q = page.evaluate("(() => { const h = document.querySelector('.compass .cmp-q'); if (!h) return ''; const c = h.cloneNode(true); c.querySelectorAll('.sr-only').forEach(e => e.remove()); return c.textContent.replace(/\\s+/g, ' ').trim(); })()")
    stitch_beside = page.evaluate("(() => { const a = document.querySelector('.cmp-a'); return !!a && !!a.querySelector('.amt') && !!a.querySelector('.stitch'); })()")
    figs = page.locator(".cmp-figures")
    figs_ok = has_amount(page, ".cmp-figures", "$1,260.00") and has_amount(page, ".cmp-figures", "$240.00") and figs.locator(".badge", has_text="You entered").count() >= 2
    check(f"{device}: answers from the compass", q.startswith("How much of the") and has_amount(page, ".compass .cmp-q", "$1,500.00") and "maximum remains after the planned work?" in q and has_amount(page, ".cmp-a", "$162.00") and stitch_beside and figs_ok and page.locator(".cmp-classes li").count() == 4,
          f"q={q[:70]!r} stitch={stitch_beside} figs={figs_ok} classes={page.locator('.cmp-classes li').count()}")
    shot("19-compass")
    page.get_by_role("button", name=re.compile("^Frequency limits")).first.click(); page.wait_for_timeout(600)
    lm = page.locator("#lm-h").first.inner_text() if page.locator("#lm-h").count() else ""
    exact_checked = page.get_by_role("radio", name="Exact wording").first.get_attribute("aria-checked") if page.get_by_role("radio", name="Exact wording").count() else None
    check(f"{device}: restriction opens cove at depth 3", lm == "Coverage" and exact_checked == "true", f"lm={lm!r} exact={exact_checked}")
    # depth dial: three radios, arrow keys and the digit keys move the checked stop
    group = page.get_by_role("radiogroup", name="Explanation depth").first
    page.get_by_role("radio", name="Exact wording").first.focus(); page.keyboard.press("ArrowLeft"); page.wait_for_timeout(200)
    after_arrow = page.evaluate("document.activeElement && document.activeElement.getAttribute('aria-checked') === 'true' && document.activeElement.textContent")
    page.keyboard.press("3"); page.wait_for_timeout(200)
    exact_again = page.get_by_role("radio", name="Exact wording").first.get_attribute("aria-checked")
    dial_widths = [group.get_by_role("radio").nth(i).bounding_box()["width"] for i in range(group.get_by_role("radio").count())]
    check(f"{device}: depth dial", group.get_by_role("radio").count() == 3 and bool(after_arrow) and "Your numbers" in str(after_arrow) and exact_again == "true" and (not mobile or all(w >= 100 for w in dial_widths)) and (not mobile or page.evaluate("document.documentElement.scrollWidth") == width),
          f"after_arrow={str(after_arrow)[:20]!r} exact={exact_again} widths={[round(w) for w in dial_widths]}")
    close_sheet()
    # benefit statement form at depth 2 on the bridge (figures identical to the seeded statement, so nothing downstream changes)
    page.locator("button[aria-label^='Deductible']").first.click(); page.wait_for_timeout(400)
    page.get_by_role("radio", name="Your numbers").first.click(); page.wait_for_timeout(400)
    form = page.locator("form", has_text="Benefit statement figures").first
    btn = form.get_by_role("button", name="Record these figures")
    bbox = btn.bounding_box() if btn.count() else None
    fields_ok = all(form.get_by_label(l, exact=False).count() > 0 for l in ["Deductible met so far this benefit year (dollars)", "Statement (label, required)", "Statement date (required)"])
    form.get_by_label("Statement (label, required)", exact=False).fill("")
    btn.click(); page.wait_for_timeout(400)
    alert_ok = form.get_by_role("alert").filter(has_text="A statement label is required.").count() > 0 or page.get_by_role("alert").filter(has_text="A statement label is required.").count() > 0
    form.get_by_label("Deductible met so far this benefit year (dollars)", exact=False).fill("25.00")
    form.get_by_label("Paid by the plan so far this benefit year (dollars)", exact=False).fill("240.00")
    form.get_by_label("Statement (label, required)", exact=False).fill("MetLife benefit statement dated 2026-09-20, figures entered by the user")
    form.get_by_label("Statement date (required)", exact=False).fill("2026-09-20")
    btn.click(); page.wait_for_timeout(1500)
    deriv = page.locator(".bs-derivation")
    live = " | ".join(page.evaluate("[...document.querySelectorAll('[aria-live], [role=status]')].map(e => e.textContent.trim()).filter(Boolean)"))
    live_ok = "Benefit statement figures recorded" in live or "Estimate updated" in live
    check(f"{device}: benefit statement", bbox is not None and bbox["height"] >= 44 and fields_ok and alert_ok and deriv.count() > 0 and deriv.locator(".badge", has_text="You entered").count() >= 1 and live_ok,
          f"btn={bbox and round(bbox['height'])} fields={fields_ok} alert={alert_ok} derivation={deriv.count()} live={live!r}")
    shot("24-benefit-statement")
    close_sheet()
    # the lighthouse → cost trail
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
    q2 = page.locator(".compass .cmp-q").first.inner_text() if page.locator(".compass .cmp-q").count() else ""
    fill_visible = page.evaluate("[...document.querySelectorAll('.compass .cmp-ne .cmp-fill')].some(f => f.offsetWidth > 0 && getComputedStyle(f).visibility !== 'hidden')")
    check(f"{device}: compass without a stated maximum", q2 == "Is there a dollar maximum? The document states none." and not fill_visible and page.locator(".compass .cmp-meter.is-empty").count() > 0, f"q={q2[:60]!r} fill={fill_visible} empty={page.locator('.compass .cmp-meter.is-empty').count()}")
    page.locator("button[aria-label^='Cost breakdown']").first.click(); page.wait_for_timeout(600)
    check(f"{device}: other plan shows missing inputs (nothing transfers)", page.get_by_text("waiting for information", exact=False).count() > 0)
    shot("08-missing-inputs")
    close_sheet()
    # the same unresolved estimate on the Passage: fog over every planned island, START pennant, a fogged drawer
    page.get_by_role("tab", name="My journey").click(); page.wait_for_timeout(1200)
    fogged = page.locator(".island-btn.is-fog, .pv-card.is-fog").count()
    start_pennant = page.locator("button[aria-label^='Start ·'] .ctl-pennant").count() > 0
    check(f"{device}: fog on unresolved", fogged >= 1 and start_pennant, f"fogged={fogged} pennant={start_pennant}")
    check(f"{device}: unresolved never prints $0.00", "$0.00" not in page.locator(".log-cost").inner_text() and "Waiting for information" in page.locator(".log-cost").inner_text(), page.locator(".log-cost").inner_text()[:60])
    shot("17-fog")
    open_island("Root canal", 1000)
    fog_nodes = page.locator(".drawer .pipeline .node")
    un_fog = page.evaluate(UNBADGED_JS, ".drawer")
    check(f"{device}: fogged drawer waits for information", page.locator(".drawer", has_text="Waiting for information").count() > 0 and "$0.00" not in hero_text() and fog_nodes.count() == 2 and page.locator(".drawer .pipeline .node-fog").count() == 1 and un_fog == 0,
          f"hero={hero_text()!r} nodes={fog_nodes.count()} fog={page.locator('.drawer .pipeline .node-fog').count()} unbadged={un_fog}")
    shot("25-fog-drawer")
    close_drawer()
    page.get_by_role("tab", name="My plan").click(); page.wait_for_timeout(500)
    page.locator("label.plan-pick select").first.select_option("ML26"); page.wait_for_timeout(1200)

    # ---- Compare (spec §12 + compare grid checks) ----
    page.get_by_role("tab", name="Compare").click(); page.wait_for_timeout(2500)
    check(f"{device}: comparison grid renders", page.locator("table.grid").count() > 0)
    check(f"{device}: eligibility banner under columns", page.get_by_text("not that you are eligible to enroll", exact=False).count() > 0)
    grid_in_container = page.locator("[data-slot=table-container] table.grid").count() > 0
    heads = page.locator("table.grid thead th").all_inner_texts()
    head_elig = all("Eligibility:" in h for h in heads[1:]) if len(heads) > 1 else False
    cells = page.evaluate("[...document.querySelectorAll('table.grid tbody tr:not(.differences) td')].filter(td => !td.querySelector('button[aria-expanded] .badge')).length")
    unbadged_cells = page.evaluate("[...document.querySelectorAll('table.grid tr:not(.differences) td, table.grid th')].filter(c => /\\$\\s?\\d/.test(c.textContent) && !c.querySelector('.badge,.stitch')).length")
    rail_ok = has_amount(page, ".rail-total", "$902.00") and page.evaluate("(() => { const r = document.querySelector('.rail-total'); return !!r && !!(r.querySelector('.badge') || r.parentElement.querySelector('.badge')); })()")
    unresolved_rail = page.get_by_text("Unresolved. Not provided for this plan:", exact=False).count() > 0
    check(f"{device}: compare grid cells carry evidence", grid_in_container and head_elig and cells == 0 and unbadged_cells == 0 and rail_ok and unresolved_rail,
          f"container={grid_in_container} elig={head_elig} cells_without_badge_button={cells} unbadged={unbadged_cells} rail={rail_ok} unresolved_rail={unresolved_rail}")
    shot("09-compare")
    page.locator("table.grid tbody button[aria-expanded]").first.click(); page.wait_for_timeout(600)
    if mobile:
        pop = page.locator("[data-slot=drawer-content]")
        ok = pop.count() > 0 and pop.locator("h2, h3").count() > 0 and pop.locator("blockquote").count() > 0 and pop.get_by_role("button", name="Close clause").count() > 0
        shot("20-compare-clause")
        if pop.get_by_role("button", name="Close clause").count(): pop.get_by_role("button", name="Close clause").first.click(); page.wait_for_timeout(400)
        else: page.keyboard.press("Escape"); page.wait_for_timeout(400)
    else:
        pop = page.locator("[data-slot=popover-content]")
        ok = pop.count() > 0 and pop.locator("h2, h3").count() > 0 and pop.locator("blockquote").count() > 0
        shot("20-compare-clause")
        page.keyboard.press("Escape"); page.wait_for_timeout(300)
    check(f"{device}: compare cell opens its clause", ok)

    # ---- Documents ----
    page.get_by_role("tab", name="Documents").click(); page.wait_for_timeout(1500)
    check(f"{device}: official source link present", page.locator("a[href^='https://oshr.nc.gov']").count() > 0)
    check(f"{device}: clauses listed with page references", page.locator("ol.clauses li").count() > 20)
    check(f"{device}: conflicts preserved", page.get_by_text("Where sources disagree", exact=False).count() > 0)
    check(f"{device}: source inventory listed", page.locator("ul.sources li").count() >= 12)
    groups = page.locator("label.plan-pick select optgroup").evaluate_all("gs => gs.map(g => g.label)")
    check(f"{device}: documents picker grouped by carrier", len(groups) >= 3 and "Fictional demonstration plans" in groups, str(groups)[:120])
    shot("10-documents")
    # click a clause → clause card
    page.locator("ol.clauses li button").first.click(); page.wait_for_timeout(400)
    check(f"{device}: clause card opens", page.get_by_role("dialog").count() > 0)
    page.wait_for_timeout(800)
    pw = page.evaluate("(() => { const p = document.querySelector('aside.clause .plain-words'); return p ? [p.querySelector('.pw-sentence')?.textContent || '', p.querySelector('.pw-label')?.textContent || '', p.querySelector('.pw-where')?.textContent || ''] : null; })()")
    check(f"{device}: clause explainer labels its plain sentence", bool(pw) and len(pw[0]) > 20 and pw[1] in ("Demo mode", "Written by the model from this quote", "Plain-words template") and pw[2].startswith("From "),
          str(pw)[:160])
    page.get_by_role("button", name="Close clause card").click(); page.wait_for_timeout(200)
    # reminders: fact sentences with their evidence, one live region
    rm = page.locator(".rm-item")
    rm_unbadged = page.evaluate("[...document.querySelectorAll('.rm-text')].filter(t => /\\$\\s?\\d/.test(t.textContent) && !t.querySelector('.badge')).length")
    check(f"{device}: reminders listed with evidence", rm.count() >= 1 and rm_unbadged == 0 and page.locator(".rm-status[role=status]").count() == 1, f"items={rm.count()} unbadged={rm_unbadged}")
    shot("23-reminders")

    # ---- upload wizard (spec §12 "upload plan"): type validation, demo extraction, review table, hold-to-publish → UP1 ----
    try:
        upload_walk(page, device, shot)
    except Exception as e:  # noqa: BLE001
        check(f"{device}: upload walk completed", False, str(e).splitlines()[0][:160])
        page.keyboard.press("Escape"); page.wait_for_timeout(300)

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
    close_sheet()

    # ---- AI treatment-plan reader (addendum D.5a): the stored fictional estimate reads into reviewed rows, nothing ticked; read-only (no confirm) ----
    if not mobile:
      try:
        page.get_by_role("tab", name="My plan").click(); page.wait_for_timeout(800)
        det = page.locator("details", has_text="Add a procedure").first
        if det.count() and not det.evaluate("d => d.open"): det.locator("summary").first.click(); page.wait_for_timeout(600)
        page.locator(".tpr").first.scroll_into_view_if_needed(); page.wait_for_timeout(600)
        page.locator(".tpr-sample", has_text="Greensboro").first.click(); page.wait_for_timeout(200)
        page.get_by_role("button", name="Read these lines").click(); page.wait_for_timeout(2500)
        rows = page.locator(".tpr-table tbody tr")
        mapped = page.evaluate("[...document.querySelectorAll('.tpr-table tbody select')].map(s => s.value)")
        ticked = page.evaluate("[...document.querySelectorAll('.tpr-include input')].filter(i => i.checked).length")
        fee_badged = page.evaluate("[...document.querySelectorAll('.tpr-table tbody tr')].every(r => r.querySelector('.badge'))")
        shot("29-treatment-plan-reader")
        check(f"{device}: treatment-plan reader reads the stored estimate", rows.count() == 2 and mapped == ["root_canal_molar", "crown"] and ticked == 0 and fee_badged,
              f"rows={rows.count()} mapped={mapped} ticked={ticked} badged={fee_badged}")
        if det.count() and det.evaluate("d => d.open"): det.locator("summary").first.click(); page.wait_for_timeout(200)
      except Exception as e:  # noqa: BLE001
        check(f"{device}: treatment-plan reader reads the stored estimate", False, str(e).splitlines()[0][:160])
      page.get_by_role("tab", name="My journey").click(); page.wait_for_timeout(2000)     # the next block counts islands on the map

    # ---- add a procedure (spec §12 "add procedure draws island"); desktop only, reverted through the API so the phone pass sees Alex unchanged ----
    if not mobile:
      try:
        before = page.locator("#passage-islands .island-btn:not(.marginal-btn)").count()
        page.get_by_role("tab", name="My plan").click(); page.wait_for_timeout(800)
        det = page.locator("details", has_text="Add a procedure").first
        if det.count() and not det.evaluate("d => d.open"): det.locator("summary").first.click(); page.wait_for_timeout(300)
        proc = page.get_by_label("Procedure (one of 16 fixed identifiers)", exact=False).first
        n_opts = proc.locator("option").count()
        proc.select_option(label="Crown, porcelain or ceramic"); page.wait_for_timeout(200)
        tooth_for_crown = page.get_by_label("Tooth or area", exact=False).count() > 0
        proc.select_option(label="Adult cleaning (prophylaxis)"); page.wait_for_timeout(200)
        tooth_for_cleaning = page.get_by_label("Tooth or area", exact=False).count() > 0
        page.get_by_label("Dentist's fee (dollars)", exact=False).first.fill("125.00")
        page.get_by_role("button", name="Add this procedure").click(); page.wait_for_timeout(500)
        src_required = page.get_by_role("alert").filter(has_text="A source is required.").count() > 0
        page.get_by_label(re.compile("^Source"), exact=False).first.fill("Dentist's estimate dated 2026-10-01 (screenshot walk)")
        page.get_by_role("button", name="Add this procedure").click(); page.wait_for_timeout(2500)
        added_text = page.get_by_text("was added to your records. The estimate is recalculating.", exact=False).count() > 0
        page.get_by_role("tab", name="My journey").click(); page.wait_for_timeout(2500)
        after_n = page.locator("#passage-islands .island-btn:not(.marginal-btn)").count()
        new_btn = page.locator("#passage-islands .island-btn[aria-label^='Adult cleaning']").count()
        shot("28-added-procedure")
        check(f"{device}: add procedure draws island", n_opts == 16 and tooth_for_crown and not tooth_for_cleaning and src_required and added_text and after_n == before + 1 and new_btn > 0,
              f"options={n_opts} tooth(crown/cleaning)={tooth_for_crown}/{tooth_for_cleaning} source_required={src_required} added={added_text} islands {before}→{after_n}")
      except Exception as e:  # noqa: BLE001
        check(f"{device}: add procedure draws island", False, str(e).splitlines()[0][:160])
      try:   # revert: the walk's item is cancelled (listed-only), never deleted
        for it in api("/me/treatment-items"):
            if "screenshot walk" in (it.get("source") or "") and it.get("status") != "cancelled":
                api(f"/me/treatment-items/{it['id']}", "PATCH", {"status": "cancelled"})
      except Exception as e:  # noqa: BLE001
        print("WARN revert failed:", e)
    if mobile:
        check(f"{device}: no horizontal scroll", all(w == width for w in widths), f"widths={sorted(set(widths))}")
    check(f"{device}: no page errors", not errors, "; ".join(errors)[:200])
    browser.close()


def upload_walk(page, device: str, shot):
    """Type validation → fixture PDF → redaction → demo extraction → review table → hold-to-publish → UP1 in the picker and on the page."""
    page.get_by_role("button", name="Add a plan document").first.click(); page.wait_for_timeout(600)
    txt = OUT / "not-a-pdf.txt"; txt.write_text("plain text, not a PDF")
    page.locator("input[type=file]").first.set_input_files(str(txt)); page.wait_for_timeout(500)
    check(f"{device}: upload dialog validates type", page.get_by_role("alert").filter(has_text="This file is not a PDF.").count() > 0)
    page.locator("input[type=file]").first.set_input_files(str(ROOT / "fixtures/documents/harborview_certificate.pdf"))
    page.wait_for_selector("text=Removed before any model call", timeout=30000); page.wait_for_timeout(300)
    page.get_by_role("button", name="Continue with these redactions").click()
    page.wait_for_selector("text=Review the fields", timeout=240000); page.wait_for_timeout(500)
    stage_rows = page.locator(".up-stage-row").count()
    page.get_by_role("button", name="Review the fields").click(); page.wait_for_timeout(800)
    confirmed = page.locator(".up-row[data-confidence=confirmed]").count()
    decided = page.locator(".up-row[data-decided]").count()
    hb_disabled = page.evaluate("(() => { const b = document.querySelector('[role=dialog] .hb-root'); return !!b && (b.disabled || b.getAttribute('aria-disabled') === 'true'); })()")
    check(f"{device}: fixture pdf extracts in demo mode", stage_rows == 7 and confirmed >= 8 and decided == 0 and hb_disabled, f"stages={stage_rows} confirmed={confirmed} decided={decided} hold disabled={hb_disabled}")
    un_up = page.evaluate("[...document.querySelectorAll('.up-table .amt')].filter(a => !a.parentElement.querySelector('.badge')).length")
    check(f"{device}: every amount in the review table badged", un_up == 0, f"{un_up} unbadged")
    shot("15-upload-review")
    page.get_by_role("button", name="Confirm all verified quotes").click(); page.wait_for_timeout(1500)
    for _ in range(60):
        if page.locator(".up-count[data-undecided='0']").count(): break
        row = page.locator(".up-row:not([data-decided])").filter(has=page.locator(".up-req")).first
        if not row.count(): row = page.locator(".up-row:not([data-decided])").first
        if not row.count(): break
        row.get_by_role("button", name="Not in document").first.click(); page.wait_for_timeout(500)
    page.locator("[role=dialog] .hb-root").first.focus()
    page.keyboard.down("Space"); page.wait_for_timeout(1100); page.keyboard.up("Space")
    page.wait_for_selector("text=/Published as UP\\d+/", timeout=30000); page.wait_for_timeout(600)
    label = re.search(r"Published as (UP\d+)", page.locator("body").inner_text())
    label = label.group(1) if label else "UP1"
    published = label.startswith("UP")
    shot("26-published")
    page.keyboard.press("Escape"); page.wait_for_timeout(800)
    opts = page.locator("label.plan-pick select option").evaluate_all("os => os.map(o => [o.value, o.textContent])")
    up_opt = next((o for o in opts if label in (o[1] or "")), None)
    if up_opt:
        page.locator("label.plan-pick select").first.select_option(up_opt[0])
        try: page.wait_for_selector(".pdf-stitch", timeout=20000)
        except Exception: pass  # noqa: BLE001
        page.wait_for_timeout(500)
    ribbon_ok = page.get_by_text(f"Uploaded plan, version {label}", exact=False).count() > 0
    stitches_up = page.locator(".pdf-stitch", has_text=label).count()
    check(f"{device}: publish creates UP1", published and up_opt is not None and up_opt[0].startswith("upload:") and ribbon_ok and stitches_up >= 1, f"published={label} option={up_opt} ribbon={ribbon_ok} page stitches={stitches_up}")
    shot("27-documents-upload")
    page.locator("label.plan-pick select").first.select_option("ML26"); page.wait_for_timeout(1200)



def run_reduced_desktop(pw):
    """Desktop with prefers-reduced-motion: every end state present and equal to the full-motion run; scenery loops off."""
    browser = pw.chromium.launch()
    ctx = dev_context(browser, viewport={"width": 1366, "height": 900}, device_scale_factor=1, reduced_motion="reduce")
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
    pat = re.compile(r"bounce|pulse|confetti|particle|shimmer|useScroll|animation: bob|washin|blur\(\d+px\)\s*;?\s*}|backdrop-filter", re.I)
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
