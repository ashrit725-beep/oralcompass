#!/usr/bin/env python3
"""Zero-errors gate: drive every view of the web app and fail on any runtime error.

Devices: desktop 1366x900 Chromium (motion on and reduced), iPhone 13 WebKit (reduced motion), Pixel 7 Chromium (motion on).
On every tab (My journey, My plan, Compare, Documents) it clicks every visible button, link, tab, checkpoint, stitch chip, dial stop and
summary, cycles every <select> option, opens and closes every drawer / sheet / dialog / popover (pointer, then Escape), submits the
benefit-statement form invalid then valid, runs the upload wizard with a .txt (rejected) and the fixture PDF (demo extraction), asks the
assistant five questions (one an advice question), and exercises Back/Forward plus a desktop<->phone resize with a drawer open.

Captured: console errors and warnings, pageerror, unhandled rejections, failed requests (status >= 400 except the deliberate
404/409/415/422 answers), React warnings (keys, act, controlled/uncontrolled, findDOMNode, Radix missing Title/Description).
Each distinct problem is printed once with the action that first triggered it; exit 1 when any is found.

Requires the API (ORALCOMPASS_DEV_AUTH=1, ORALCOMPASS_LLM_PROVIDER=none, fresh ORALCOMPASS_DATA_DIR) behind the web preview;
ORALCOMPASS_WEB_BASE points at the preview (default http://127.0.0.1:4173). `--quick` runs desktop + Pixel 7 only; `--only <text>`
runs the device whose label contains the text (e.g. `--only iphone`), so the four runs can go in parallel. React warnings only print in
a development bundle: point ORALCOMPASS_WEB_BASE at `npx vite` (dev server) as well as the production preview.
Never clicks destructive controls (delete my data, sign out, hold-to-publish) or external links.
"""
from __future__ import annotations

import os
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import Error as PWError
from playwright.sync_api import sync_playwright

BASE = os.environ.get("ORALCOMPASS_WEB_BASE", "http://127.0.0.1:4173")
ROOT = Path(__file__).resolve().parent.parent
QUICK = "--quick" in sys.argv
ONLY = sys.argv[sys.argv.index("--only") + 1].lower() if "--only" in sys.argv else ""     # e.g. --only iphone (run devices in parallel)
EXPECTED_STATUS = {404, 409, 415, 422}
SKIP_NAME = re.compile(r"delete|erase|sign out|log out|remove all|publish|hold to|reset everything|export", re.I)
TABS = ["My journey", "My plan", "Compare", "Documents"]
QUESTIONS = ["What is the annual maximum?", "How much is the deductible?", "Is there a waiting period for crowns?",
             "What does coinsurance mean here?", "Should I get the crown now or wait?"]
REACT_WARN = re.compile(r"Each child in a list|not wrapped in act|uncontrolled|controlled input|findDOMNode|DialogContent|DialogTitle|"
                        r"Description|Can't perform a React state update|Warning:", re.I)

problems: dict[str, str] = {}          # distinct message -> first triggering action


def note(kind: str, msg: str, action: str):
    key = f"{kind}: {re.sub(r'\s+', ' ', msg)[:400]}"
    key = re.sub(r"https?://127\.0\.0\.1:\d+", "", key)
    if key not in problems:
        problems[key] = action
        print(f"  !! {key}\n     after: {action}", flush=True)


class Sweep:
    def __init__(self, pw, label: str, engine: str, ctx_kwargs: dict):
        self.label = label
        browser = getattr(pw, engine).launch()
        self.browser = browser
        self.ctx = browser.new_context(**ctx_kwargs)
        self.ctx.route(re.compile(r"^https?://[^/]+/api/"), self._dev_user)
        self.page = self.ctx.new_page()
        self._action = "load"
        self.count = 0
        p = self.page
        p.on("console", self._console)
        p.on("pageerror", lambda e: note("pageerror", str(e), f"{label} / {self.action}"))
        p.on("response", self._response)
        p.on("requestfailed", self._reqfailed)
        p.add_init_script("""window.addEventListener('unhandledrejection', e => console.error('unhandledrejection: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));""")

    @property
    def action(self) -> str:
        return self._action

    @action.setter
    def action(self, value: str):
        self._action = value; self.count += 1

    @staticmethod
    def _dev_user(route):
        headers = {**route.request.headers}
        headers.setdefault("x-dev-user", "sweep-user")
        route.continue_(headers=headers)

    def _console(self, msg):
        if msg.type in ("error", "warning", "assert"):
            text = msg.text
            # the browser logs every >=400 response as a console error; responses are judged by status in _response
            if "Failed to load resource" in text:
                return
            kind = "react-warning" if REACT_WARN.search(text) else f"console-{msg.type}"
            note(kind, text, f"{self.label} / {self.action}")

    def _response(self, resp):
        if resp.status >= 400 and resp.status not in EXPECTED_STATUS:
            note("http", f"{resp.status} {resp.request.method} {resp.url}", f"{self.label} / {self.action}")

    def _reqfailed(self, req):
        failure = req.failure or ""
        if "ERR_ABORTED" in failure or "cancelled" in failure.lower() or "NS_BINDING_ABORTED" in failure:
            return     # navigations/aborts from unmounts are fine as long as nothing logs an error
        note("requestfailed", f"{req.method} {req.url} {failure}", f"{self.label} / {self.action}")

    # ---- helpers ---------------------------------------------------------------------------------------------------------
    def wait(self, ms=250):
        self.page.wait_for_timeout(ms)

    def esc(self):
        try:
            self.page.keyboard.press("Escape"); self.wait(150)
        except PWError:
            pass

    def close_overlays(self):
        p = self.page
        for _ in range(3):
            if p.locator("[role=dialog]:visible, [data-vaul-drawer]:visible, .drawer").count() == 0:
                break
            self.esc()
            btn = p.get_by_role("button", name="Close details")
            if btn.count() and btn.first.is_visible():
                try:
                    btn.first.click(timeout=1500); self.wait(300)
                except PWError:
                    pass

    def tab(self, name: str):
        self.action = f"tab '{name}'"
        t = self.page.get_by_role("tab", name=name)
        if t.count():
            try:
                t.first.click(timeout=3000)
            except PWError:
                self.close_overlays(); t.first.click(timeout=3000)
            self.wait(900)

    def start(self):
        p = self.page
        self.action = "open app"
        p.goto(BASE, wait_until="networkidle"); self.wait(800)
        if p.get_by_role("heading", name="Starting point").count():
            self.action = "start: choose sample journey (Alex Chen)"
            p.locator("button", has_text="Alex Chen").first.click(); self.wait(1500)
        try:
            p.wait_for_selector("text=checkpoints completed", timeout=15000)
        except PWError:
            note("sweep", "journey did not load (no 'checkpoints completed')", f"{self.label} / {self.action}")
        self.wait(1500)

    def controls(self) -> list[dict]:
        """Visible interactive controls in the current view, keyed by a selector + index the sweep can re-find after re-renders."""
        return self.page.evaluate("""() => {
          const sel = 'main button, main a[href], main summary, main [role=tab], main [role=radio], main [role=checkbox], main [role=switch], main [role=option], header button, header [role=tab], nav button';
          const out = []; const seen = new Set();
          document.querySelectorAll(sel).forEach((el, i) => {
            const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
            if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[aria-hidden=true]') || el.disabled) return;
            const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
            const href = el.getAttribute('href') || '';
            const key = el.tagName + '|' + name + '|' + href;
            if (seen.has(key)) return; seen.add(key);
            out.push({ tag: el.tagName.toLowerCase(), name, href, target: el.getAttribute('target') || '' });
          });
          return out; }""")

    def click_all(self, view: str, limit: int = 70):
        p = self.page
        items = self.controls()[:limit]
        for it in items:
            name, tag, href = it["name"], it["tag"], it["href"]
            if SKIP_NAME.search(name) or it["target"] == "_blank" or href.startswith("http") or href.startswith("mailto"):
                continue
            if tag == "button" and name in TABS:
                continue
            self.action = f"{view}: click {tag} '{name}'"
            loc = p.locator(f"main {tag}, header {tag}, nav {tag}").filter(has_text=name) if name else None
            by_label = p.locator(f"{tag}[aria-label=\"{name}\"]")
            target = by_label if by_label.count() else loc
            if target is None or target.count() == 0:
                continue
            try:
                el = target.first
                if not el.is_visible():
                    continue
                el.click(timeout=2000); self.wait(350)
                # keyboard-close whatever opened, then make sure we are still in the same view
                self.esc(); self.wait(150)
                self.close_overlays()
                if p.url.split("#")[0].rstrip("/") != BASE.rstrip("/"):
                    self.action = f"{view}: back after '{name}'"
                    p.goto(BASE, wait_until="networkidle"); self.wait(800)
                    self.tab(view if view in TABS else "My journey")
            except PWError:
                self.close_overlays()

    def cycle_selects(self, view: str):
        p = self.page
        n = p.locator("main select:visible").count()
        for i in range(n):
            s = p.locator("main select:visible").nth(i)
            try:
                label = s.get_attribute("aria-label") or s.evaluate("e => (e.labels && e.labels[0] && e.labels[0].innerText) || e.name || ''")
                original = s.input_value()
                opts = s.locator("option").evaluate_all("os => os.filter(o => !o.disabled).map(o => o.value)")[:6]
                for v in opts:
                    self.action = f"{view}: select '{label.strip()[:40]}' = {v[:40]}"
                    s.select_option(v, timeout=2000); self.wait(500)
                self.action = f"{view}: restore select '{label.strip()[:40]}'"
                if original in opts or original:
                    s.select_option(original, timeout=2000); self.wait(600)
            except PWError:
                continue

    def journey(self):
        p = self.page
        self.tab("My journey")
        # islands / checkpoints: open each, press Escape, then click every control inside the open drawer once
        islands = p.locator("#passage-islands button")
        for i in range(min(islands.count(), 12)):
            b = islands.nth(i)
            try:
                name = b.get_attribute("aria-label") or b.inner_text()
                self.action = f"journey: open island '{name[:50]}'"
                b.click(timeout=2000); self.wait(700)
                if i == 1:
                    self.drawer_controls()
                if i == 2:
                    self.assistant()
                self.action = f"journey: Escape from '{name[:50]}'"
                self.close_overlays(); self.wait(400)
                lost = p.evaluate("!document.activeElement || document.activeElement === document.body")
                if lost:
                    note("focus", "focus lost to <body> after closing the detail surface", f"{self.label} / {self.action}")
            except PWError:
                self.close_overlays()
        self.click_all("My journey")
        self.cycle_selects("My journey")

    def drawer_controls(self):
        p = self.page
        root = p.locator(".drawer, [role=dialog]").first
        if not root.count():
            return
        btns = root.locator("button:visible, summary:visible")
        names = []
        for i in range(min(btns.count(), 30)):
            try:
                names.append((btns.nth(i).get_attribute("aria-label") or btns.nth(i).inner_text()).strip())
            except PWError:
                pass
        for i, name in enumerate(names):
            if SKIP_NAME.search(name) or re.search(r"close", name, re.I):
                continue
            self.action = f"drawer: click '{name[:60]}'"
            try:
                b = p.locator(".drawer button:visible, .drawer summary:visible, [role=dialog] button:visible, [role=dialog] summary:visible").nth(i)
                b.click(timeout=1500); self.wait(300)
                # a popover/clause card opened from the drawer: close it with Escape only (keep the drawer)
                if p.locator("[data-radix-popper-content-wrapper], .clause-card").count():
                    self.esc()
            except PWError:
                pass

    def assistant(self):
        p = self.page
        ta = p.locator(".drawer textarea, [role=dialog] textarea").first
        if not ta.count():
            return
        for q in QUESTIONS:
            self.action = f"assistant: ask '{q}'"
            try:
                ta = p.locator(".drawer textarea, [role=dialog] textarea").first
                ta.scroll_into_view_if_needed(); ta.fill(q)
                p.locator(".drawer, [role=dialog]").get_by_role("button", name="Ask", exact=True).first.click(timeout=2000)
                self.wait(1800)
            except PWError as e:
                note("sweep", f"assistant question could not be asked: {str(e).splitlines()[0]}", f"{self.label} / {self.action}")
                break
        self.action = "assistant: submit empty question"
        try:
            ta = p.locator(".drawer textarea, [role=dialog] textarea").first
            ta.fill(""); ta.press("Enter"); self.wait(300)
        except PWError:
            pass

    def plan(self):
        self.tab("My plan")
        p = self.page
        form = p.locator("form").filter(has=p.get_by_label("Statement date (required)", exact=False))
        if form.count():
            try:
                self.action = "plan: submit benefit statement with invalid input"
                form.get_by_label("Deductible met so far this benefit year (dollars)", exact=False).fill("-5")
                form.locator("button[type=submit]").first.click(timeout=2000); self.wait(500)
                self.action = "plan: submit benefit statement with valid input"
                form.get_by_label("Deductible met so far this benefit year (dollars)", exact=False).fill("25.00")
                form.get_by_label("Paid by the plan so far this benefit year (dollars)", exact=False).fill("240.00")
                form.get_by_label("Statement (label, required)", exact=False).fill("Benefit statement dated 2026-09-20 (error sweep)")
                form.get_by_label("Statement date (required)", exact=False).fill("2026-09-20")
                form.locator("button[type=submit]").first.click(timeout=2000); self.wait(1200)
            except PWError:
                pass
        self.click_all("My plan")
        self.cycle_selects("My plan")

    def compare(self):
        self.tab("Compare")
        self.wait(1200)
        self.click_all("Compare")
        self.cycle_selects("Compare")

    def documents(self):
        self.tab("Documents")
        p = self.page
        self.click_all("Documents", limit=50)
        # upload wizard: a .txt (rejected with a visible message), then the fixture PDF (demo extraction)
        self.tab("Documents")
        inp = p.locator("input[type=file]")
        if inp.count():
            txt = Path(tempfile.gettempdir()) / "oralcompass-sweep.txt"
            txt.write_text("not a pdf")
            try:
                self.action = "upload: choose a .txt file"
                inp.first.set_input_files(str(txt)); self.wait(800)
                pdf = ROOT / "fixtures" / "documents" / "nw26_certificate.pdf"
                self.action = "upload: choose the fixture PDF"
                p.locator("input[type=file]").first.set_input_files(str(pdf)); self.wait(1200)
                for label in ("Upload", "Continue", "Start extraction", "Extract", "Next"):
                    b = p.get_by_role("button", name=label, exact=True)
                    if b.count() and b.first.is_visible() and b.first.is_enabled():
                        self.action = f"upload: click '{label}'"
                        b.first.click(timeout=2000); self.wait(1500)
                # switch tabs during extraction polling, then come back
                self.tab("My journey"); self.wait(600); self.tab("Documents")
                p.wait_for_timeout(6000)
            except PWError:
                pass
        self.cycle_selects("Documents")

    def lifecycle(self, phone: bool):
        """Races: rapid plan switching, Back/Forward, resize with a drawer open, tab switch mid-transition."""
        p = self.page
        self.tab("My plan")
        sel = p.locator("main select:visible").first
        if sel.count():
            try:
                opts = sel.locator("option").evaluate_all("os => os.filter(o => !o.disabled).map(o => o.value)")
                original = sel.input_value()
                self.action = "race: switch plans rapidly while estimates load"
                for v in (opts * 2)[:8]:
                    sel.select_option(v, timeout=1500); p.wait_for_timeout(60)
                sel.select_option(original, timeout=1500); self.wait(1500)
            except PWError:
                pass
        self.action = "race: tab switching mid-transition"
        for t in TABS + TABS[::-1]:
            try:
                p.get_by_role("tab", name=t).first.click(timeout=1500); p.wait_for_timeout(80)
            except PWError:
                pass
        self.wait(800)
        self.tab("My journey")
        isl = p.locator("#passage-islands button")
        if isl.count() > 2:
            try:
                self.action = "race: open drawer then switch journey"
                isl.nth(2).click(timeout=2000); self.wait(400)
                j = p.get_by_label("Journey", exact=True)
                if j.count() and j.first.is_visible():
                    opts = j.first.locator("option").evaluate_all("os => os.map(o => o.value)")
                    if len(opts) > 1:
                        j.first.select_option(opts[-1]); self.wait(800); j.first.select_option(opts[0]); self.wait(800)
                self.action = "race: resize desktop<->phone with a drawer open"
                isl = p.locator("#passage-islands button")
                if isl.count() > 2:
                    isl.nth(2).click(timeout=2000); self.wait(400)
                vp = p.viewport_size
                p.set_viewport_size({"width": 1366, "height": 900} if phone else {"width": 360, "height": 780}); self.wait(900)
                p.set_viewport_size(vp); self.wait(900)
                self.close_overlays()
            except PWError:
                self.close_overlays()
        self.action = "history: Back/Forward"
        try:
            p.go_back(); self.wait(700); p.go_forward(); self.wait(700)
        except PWError:
            pass
        self.action = "reload (unmount during pending fetches)"
        try:
            p.goto(BASE); p.wait_for_timeout(150); p.goto(BASE, wait_until="networkidle"); self.wait(1000)
        except PWError:
            pass

    def run(self, phone: bool):
        print(f"== {self.label}", flush=True)
        try:
            self.start()
            self.journey()
            self.plan()
            self.compare()
            self.documents()
            self.lifecycle(phone)
        except Exception as e:  # noqa: BLE001
            note("sweep", f"sweep aborted: {str(e).splitlines()[0]}", f"{self.label} / {self.action}")
        finally:
            print(f"   {self.count} actions driven", flush=True)
            self.browser.close()


def main() -> int:
    with sync_playwright() as pw:
        runs = [("desktop 1366x900 chromium motion", "chromium", {"viewport": {"width": 1366, "height": 900}, "reduced_motion": "no-preference"}, False)]
        if not QUICK:
            runs.append(("desktop 1366x900 chromium reduced-motion", "chromium", {"viewport": {"width": 1366, "height": 900}, "reduced_motion": "reduce"}, False))
            runs.append(("iPhone 13 webkit reduced-motion", "webkit", {**pw.devices["iPhone 13"], "reduced_motion": "reduce"}, True))
        runs.append(("Pixel 7 chromium motion", "chromium", {**pw.devices["Pixel 7"], "reduced_motion": "no-preference"}, True))
        for label, engine, kwargs, phone in runs:
            if ONLY and ONLY not in label.lower():
                continue
            Sweep(pw, label, engine, kwargs).run(phone)
    print()
    if problems:
        print(f"FAIL {len(problems)} distinct runtime problem(s):")
        for k, a in problems.items():
            print(f"- {k}\n    triggered by: {a}")
        return 1
    print("PASS zero console errors/warnings, page errors, unhandled rejections, unexpected failed requests or React warnings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
