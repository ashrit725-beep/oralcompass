#!/usr/bin/env python3
"""Local production smoke test: the single container's server (api/app/server.py) exactly as deployed, minus the platform.

    python3 tools/prod_smoke.py                  # build web, run app.server locally, walk it with Playwright
    python3 tools/prod_smoke.py --skip-build     # reuse web/dist
    python3 tools/prod_smoke.py --no-docker      # skip the container pass (by default it runs when Docker is available)

The server runs with ORALCOMPASS_ENV=production, ORALCOMPASS_STORE=sqlite (a temporary database), a temporary upload directory, a random
session secret, NO dev auth, and ORALCOMPASS_LLM_PROVIDER=none (the smoke never spends live-model credits), on a free port on 127.0.0.1.
Checks (exit 1 on any failure):
  - GET /api/health is ok and never exposes the key;
  - / loads the production bundle; the Alex sample opens; the estimate shows $902.00;
  - the session cookie is set, HttpOnly, SameSite=Lax, Path=/;
  - a second browser context (another visitor) sees no journeys of the first and gets the constant 404 on the first's journey id;
  - a stored plan PDF renders through pdf.js (worker under the CSP); an uploaded plan publishes as UP1 and its session-owned PDF renders
    from an object URL; the push service worker registers;
  - "Delete all my data" (the UI control) deletes the records and the stored upload, and expires the cookie;
  - zero CSP violations (securitypolicyviolation events and console reports) and no page errors in every context.
Every server this script starts is stopped before it exits.
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS: list[tuple[str, bool, str]] = []

CSP_PROBE = """
window.__csp = [];
document.addEventListener('securitypolicyviolation', (e) => {
  window.__csp.push({directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber, sample: e.sample, col: e.columnNumber});
});
"""


def poll(page, expression: str, timeout_s: float = 20.0) -> bool:
    """Poll a page expression with page.evaluate (CDP, not subject to the page's CSP). Playwright's wait_for_function compiles its predicate
    with eval inside the page, which the production CSP refuses — and would itself show up as a violation."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            if page.evaluate(expression):
                return True
        except Exception:
            pass
        time.sleep(0.25)
    return False


def check(name: str, ok: bool, detail: str = "") -> bool:
    RESULTS.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{(' — ' + detail) if detail else ''}", flush=True)
    return bool(ok)


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_health(base: str, timeout: float = 90.0) -> dict | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base}/api/health", timeout=3) as r:
                return json.loads(r.read())
        except Exception:
            time.sleep(0.5)
    return None


def build_web() -> None:
    web = ROOT / "web"
    if not (web / "node_modules").exists():
        subprocess.run(["npm", "ci", "--no-audit", "--no-fund"], cwd=web, check=True)
    env = {k: v for k, v in os.environ.items() if k != "VITE_DEV_AUTH"}       # a production bundle: no dev header
    subprocess.run(["npm", "run", "build"], cwd=web, check=True, env=env)


def server_env(tmp: Path) -> dict:
    env = {k: v for k, v in os.environ.items() if not k.startswith(("ORALCOMPASS_", "OPENROUTER_", "VITE_"))}
    env.update({
        "ORALCOMPASS_ENV": "production",
        "ORALCOMPASS_STORE": "sqlite",
        "ORALCOMPASS_DB_PATH": str(tmp / "db" / "oralcompass.db"),
        "ORALCOMPASS_DATA_DIR": str(tmp / "uploads"),
        "ORALCOMPASS_SESSION_SECRET": secrets.token_urlsafe(48),
        "ORALCOMPASS_LLM_PROVIDER": "none",
        "PYTHONUNBUFFERED": "1",
    })
    return env


def upload_and_publish(page) -> None:
    """The upload wizard in demo mode: fixture PDF → redaction → extraction → review → hold-to-publish (same steps as tools/screenshots.py)."""
    page.get_by_role("button", name="Add a plan document").first.click()
    page.wait_for_timeout(600)
    page.locator("input[type=file]").first.set_input_files(str(ROOT / "fixtures/documents/harborview_certificate.pdf"))
    page.wait_for_selector("text=Removed before any model call", timeout=30000)
    page.get_by_role("button", name="Continue with these redactions").click()
    page.wait_for_selector("text=Review the fields", timeout=120000)
    page.get_by_role("button", name="Review the fields").click()
    page.wait_for_timeout(800)
    page.get_by_role("button", name="Confirm all verified quotes").click()
    page.wait_for_timeout(1200)
    for _ in range(60):
        if page.locator(".up-count[data-undecided='0']").count():
            break
        row = page.locator(".up-row:not([data-decided])").filter(has=page.locator(".up-req")).first
        if not row.count():
            row = page.locator(".up-row:not([data-decided])").first
        if not row.count():
            break
        row.get_by_role("button", name="Not in document").first.click()
        page.wait_for_timeout(400)
    page.locator(".hb-root").first.focus()
    page.keyboard.down("Space")
    page.wait_for_timeout(1100)
    page.keyboard.up("Space")
    page.wait_for_selector("text=/Published as UP\\d+/", timeout=30000)
    page.keyboard.press("Escape")
    page.wait_for_timeout(800)


def walk(base: str, label: str) -> None:
    from playwright.sync_api import sync_playwright

    health = wait_health(base, 5) or {}
    check(f"{label}: /api/health ok", health.get("ok") is True and health.get("llm_mode") in ("demo", "live") and "llm_cap_reached" in health,
          json.dumps({k: health.get(k) for k in ("ok", "llm_mode", "llm_cap_reached")}))
    check(f"{label}: /api/health exposes no key", not any(s in json.dumps(health).lower() for s in ("sk-or", "api_key", "openrouter_api")))

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        problems: dict[str, list[str]] = {}

        def new_context(name: str):
            ctx = browser.new_context(viewport={"width": 1366, "height": 900}, reduced_motion="reduce")
            ctx.add_init_script(CSP_PROBE)
            page = ctx.new_page()
            bucket = problems.setdefault(name, [])
            page.on("console", lambda m: bucket.append(f"console.{m.type}: {m.text[:200]}") if ("Content Security Policy" in m.text or "Refused to" in m.text) else None)
            page.on("pageerror", lambda e: bucket.append(f"pageerror: {str(e)[:200]}"))
            page.on("dialog", lambda d: d.accept())
            return ctx, page

        def csp_events(page) -> list:
            try:
                return page.evaluate("window.__csp || []")
            except Exception:
                return []

        # ---- visitor A: the Alex sample ----
        ctx_a, a = new_context("A")
        resp = a.goto(base + "/", wait_until="networkidle")
        csp_header = resp.headers.get("content-security-policy", "") if resp else ""
        check(f"{label}: / serves the shell with the CSP", bool(resp and resp.ok) and "default-src 'self'" in csp_header and "script-src 'self'" in csp_header,
              csp_header[:80])
        a.wait_for_timeout(800)
        a.get_by_role("heading", name="Starting point").wait_for(timeout=20000)
        check(f"{label}: a new visitor lands on the start screen", True)
        cookies = {c["name"]: c for c in ctx_a.cookies()}
        sess = cookies.get("oc_session")
        check(f"{label}: session cookie set, HttpOnly, SameSite=Lax, Path=/", bool(sess) and sess["httpOnly"] and sess["sameSite"] == "Lax" and sess["path"] == "/",
              json.dumps({k: sess.get(k) for k in ("httpOnly", "sameSite", "path", "secure")}) if sess else "missing")
        check(f"{label}: session cookie unreadable by script", "oc_session" not in a.evaluate("document.cookie"))
        a.locator("button", has_text="Alex Chen").first.click()
        a.wait_for_selector("text=checkpoints completed", timeout=20000)
        a.wait_for_timeout(1500)
        check(f"{label}: Alex sample opened", a.locator("text=checkpoints completed").count() > 0)
        poll(a, "document.body.innerText.includes('$902.00')", 15)
        check(f"{label}: estimate shows $902.00", "$902.00" in a.inner_text("body"))
        same_cookie = {c["name"]: c["value"] for c in ctx_a.cookies()}.get("oc_session") == (sess or {}).get("value")
        check(f"{label}: one session for the whole visit", same_cookie)
        journeys_a = ctx_a.request.get(base + "/api/journeys").json()["items"]
        check(f"{label}: visitor A owns one journey", len(journeys_a) == 1, str(len(journeys_a)))
        jid = journeys_a[0]["id"] if journeys_a else "none"

        # ---- a stored PDF page renders through pdf.js (the worker under the CSP) ----
        a.get_by_role("tab", name="Documents").click()
        a.wait_for_timeout(1200)
        pick = a.locator("label.plan-pick select").first
        rendered = False
        if pick.count():
            pick.select_option("HB26")
            rendered = poll(a, "[...document.querySelectorAll('.documents .pdf-page canvas')].some(c => c.width > 0 && c.height > 0)", 25)
        check(f"{label}: stored plan PDF renders through pdf.js", rendered)

        # ---- upload → demo extraction → publish; the owner-scoped PDF renders from an object URL (pdf.js + blob: under the CSP) ----
        try:
            upload_and_publish(a)
            opts = a.locator("label.plan-pick select option").evaluate_all("os => os.map(o => [o.value, o.textContent])")
            up_opt = next((o for o in opts if o[0].startswith("upload:")), None)
            if up_opt:
                a.locator("label.plan-pick select").first.select_option(up_opt[0])
            owned = bool(up_opt) and poll(a, "document.querySelectorAll('.documents .pdf-stitch').length > 0", 25)
            check(f"{label}: uploaded plan published and its stored PDF renders (session-owned file)", owned, str(up_opt)[:80])
        except Exception as e:  # noqa: BLE001
            check(f"{label}: uploaded plan published and its stored PDF renders (session-owned file)", False, str(e).splitlines()[0][:160])
            a.keyboard.press("Escape")

        # ---- the push service worker registers under the CSP (worker-src 'self') ----
        sw = a.evaluate("navigator.serviceWorker.register('/sw.js', {scope: '/'}).then(r => r.unregister().then(() => 'ok'), e => String(e))")
        check(f"{label}: service worker registers under the CSP", sw == "ok", str(sw)[:120])

        # ---- visitor B: isolation ----
        ctx_b, b = new_context("B")
        b.goto(base + "/", wait_until="networkidle")
        b.get_by_role("heading", name="Starting point").wait_for(timeout=20000)
        jb = ctx_b.request.get(base + "/api/journeys")
        check(f"{label}: another visitor sees no journeys of the first", jb.ok and jb.json() == {"items": []}, jb.text()[:80])
        foreign = ctx_b.request.get(f"{base}/api/journeys/{jid}")
        check(f"{label}: another visitor gets the constant 404 on the first's journey", foreign.status == 404 and foreign.json() == {"detail": {"error": "not_found"}})
        b_cookie = {c["name"]: c["value"] for c in ctx_b.cookies()}.get("oc_session")
        check(f"{label}: the two visitors hold different sessions", bool(b_cookie) and b_cookie != (sess or {}).get("value"))
        spoof = ctx_b.request.get(base + "/api/journeys", headers={"X-Dev-User": "demo-user"})
        check(f"{label}: the dev header is ignored in production", spoof.ok and spoof.json() == {"items": []})

        # ---- Delete all my data (the UI control) ----
        hold = a.get_by_role("button", name="Delete all my data")      # "Hold to delete all my data": a 1.6 s press-and-hold
        hold.scroll_into_view_if_needed(); box = hold.bounding_box()
        a.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); a.mouse.down(); a.wait_for_timeout(1900); a.mouse.up()
        a.wait_for_timeout(2000)
        after = ctx_a.request.get(base + "/api/journeys").json()["items"]
        new_cookie = {c["name"]: c["value"] for c in ctx_a.cookies()}.get("oc_session")
        check(f"{label}: Delete all my data removes the records", after == [], str(len(after)))
        check(f"{label}: Delete all my data ends the session", new_cookie != (sess or {}).get("value"))
        with_old = browser.new_context()
        with_old.add_cookies([{"name": "oc_session", "value": sess["value"], "url": base}] if sess else [])
        old_view = with_old.request.get(base + "/api/journeys").json()["items"]
        check(f"{label}: the old session holds nothing", old_view == [])
        with_old.close()

        # ---- CSP and page errors ----
        for name, page in (("A", a), ("B", b)):
            ev = csp_events(page)
            msgs = problems.get(name, [])
            check(f"{label}: CSP violations = 0 (visitor {name})", not ev and not any("Content Security Policy" in m or "Refused to" in m for m in msgs),
                  json.dumps(ev)[:300] + " " + " | ".join(msgs)[:300])
            check(f"{label}: no page errors (visitor {name})", not any(m.startswith("pageerror") for m in msgs), " | ".join(msgs)[:300])
        browser.close()


def run_local(skip_build: bool) -> None:
    if not skip_build:
        build_web()
    check("web/dist built", (ROOT / "web" / "dist" / "index.html").is_file())
    tmp = Path(tempfile.mkdtemp(prefix="oralcompass-smoke-"))
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    log = open(tmp / "server.log", "w")
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.server:app", "--host", "127.0.0.1", "--port", str(port), "--no-access-log"],
                            cwd=ROOT / "api", env=server_env(tmp), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        h = wait_health(base)
        if not check("local: app.server started (sqlite, sessions, no dev auth)", h is not None, f"port {port}"):
            log.flush()
            print((tmp / "server.log").read_text()[-3000:])
            return
        walk(base, "local")
        db = tmp / "db" / "oralcompass.db"
        check("local: the SQLite database was written", db.exists() and db.stat().st_size > 0)
        left = [p for p in (tmp / "uploads").rglob("*") if p.is_file()] if (tmp / "uploads").exists() else []
        check("local: Delete all my data removed the stored upload", not left, f"{len(left)} file(s) left")
        log.flush()
        text = (tmp / "server.log").read_text()
        check("local: server log holds no session cookie values", "oc_session=" not in text and "X-Dev-User" not in text)
    finally:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=15)
        except Exception:
            proc.kill()
        log.close()
        shutil.rmtree(tmp, ignore_errors=True)


def run_docker() -> None:
    if not shutil.which("docker") or subprocess.run(["docker", "info"], capture_output=True).returncode != 0:
        print("[SKIP] docker: Docker is not installed or not running here; the container build and smoke were not run", flush=True)
        return
    tag = "oralcompass:smoke"
    b = subprocess.run(["docker", "build", "-t", tag, str(ROOT)])
    if not check("docker: image builds", b.returncode == 0):
        return
    port = free_port()
    name = f"oralcompass-smoke-{secrets.token_hex(4)}"
    run = subprocess.run(["docker", "run", "-d", "--rm", "--name", name, "-p", f"127.0.0.1:{port}:8000", "-e", f"ORALCOMPASS_SESSION_SECRET={secrets.token_urlsafe(48)}",
                          "-e", "ORALCOMPASS_LLM_PROVIDER=none", tag], capture_output=True, text=True)
    if not check("docker: container starts", run.returncode == 0, run.stderr[-300:]):
        return
    try:
        base = f"http://127.0.0.1:{port}"
        if check("docker: health check answers", wait_health(base) is not None):
            walk(base, "docker")
        user = subprocess.run(["docker", "exec", name, "id", "-u"], capture_output=True, text=True).stdout.strip()
        check("docker: runs as a non-root user", user not in ("", "0"), f"uid {user}")
    finally:
        subprocess.run(["docker", "stop", name], capture_output=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-build", action="store_true")
    ap.add_argument("--no-docker", action="store_true", help="skip the Docker image build and container smoke")
    args = ap.parse_args()
    run_local(args.skip_build)
    if not args.no_docker:
        run_docker()
    failed = [n for n, ok, _ in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
