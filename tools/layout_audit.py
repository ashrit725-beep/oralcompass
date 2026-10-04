#!/usr/bin/env python3
"""Automated layout audit of the web app with Playwright: overlaps, clipping, occlusion, overflow, tiny targets and alignment smells.

Opens every view and every open state (start screen, journey map with no selection, each island / START / Harbor Light / visited / marginal
drawer, the procedure drawer with every section expanded, the clause card at each depth, the inline assistant with an answer, the care
timeline and a stage/checkpoint detail, the overview list, My plan with each landmark open, the compass and the add-procedure / reader
panel, the fog state (FM26H) on My plan, the journey and the drawer, Compare with a clause popover, Documents with its clause card and
reminders, and every upload wizard step including the review table and the published state) on four devices (mobile-only app:
the phone layout is the only layout):

    phone-360     Chromium 360×780 (touch)       iphone-13  WebKit, Playwright "iPhone 13" descriptor
    pixel-7       Chromium, "Pixel 7" descriptor  wide-1440  Chromium 1440×900: the phone app in its centred 480 px column

and reports, per view/state/device:

  1 OVERLAPS   visible HTML text-bearing or interactive elements (buttons, links, inputs, labels, headings, paragraphs, list items, table
               cells, badges, chips, stitches, lozenges, any element with its own text) whose boxes intersect by > 2 px on both axes where
               neither contains the other. Only HTML boxes are compared (painted SVG/canvas art under HTML is intended); inline elements are
               compared per line box; pairs on different layers (an open drawer, dialog, popover or a fixed/sticky bar over the page) are a
               deliberate stacking, not an overlap. With a modal open only the modal's own layer is audited.
  2 CLIPPING   an element that clips (overflow hidden/clip, text-overflow: ellipsis, line-clamp) while one of its text nodes extends past its
               padding box by > 1 px, and selects whose selected option text is wider than the select's content box; exempt (listed
               separately as "clipping_named") when the full text is in the element's (or its control's) accessible name or title; also
               any control whose own box is cut by > 2 px by an overflow:hidden/clip ancestor (a button sliced by its card edge).
  3 OCCLUSION  an interactive element, scrolled into view, whose centre point (document.elementFromPoint) lands on a different element that is
               neither the element, its descendant, its ancestor nor its label. When the covering element sits on a different layer (an
               open non-modal panel such as the clause card over the drawer) the hit is listed separately as "occlusion_panel" and does not
               fail the run: the panel covers the page by design while it is open.
  4 OVERFLOW   horizontal page overflow (scrollWidth > clientWidth) and elements extending past the viewport's left/right edge that no
               ancestor scroller or clipper contains (html/body clipping does not count: it hides the defect rather than fixing it).
  5 TINY       interactive elements smaller than 44×44 (every device is a phone) after counting an expanded hit area (::before/::after
               with negative insets, a wrapping label); inline links and inline-level buttons inside running text are exempt (WCAG 2.5.8 inline exception).
  6 ALIGNMENT  (smell, never fails the run) sibling controls in one row whose top edges differ by 1–3 px at equal heights, and table rows
               whose first-line text baselines differ by 1–3 px, and table header cells that do not sit over their body column.

Inner scroll containers (a drawer body, a sheet, a sideways table) are stepped through so content below their fold is audited too.
Motion: contexts run with prefers-reduced-motion: reduce so every state is measured at its end position.

Requires the API (ORALCOMPASS_DEV_AUTH=1, demo llm mode: ORALCOMPASS_LLM_PROVIDER=none, a fresh ORALCOMPASS_DATA_DIR) behind the web
preview on :4173 (override with ORALCOMPASS_WEB_BASE). Each device signs in as its own dev user, so every device starts on the fresh-user start
screen and publishes its upload as UP1. WebKit refuses some ports outright ("restricted network port", e.g. 4190): serve the preview on
4173 or another unrestricted port.

Usage:  python3 tools/layout_audit.py [out_dir=shots/layout-audit] [--devices=phone-360,iphone-13,pixel-7,wide-1440]
Writes <out>/<device>/<NN>-<state>.png, <out>/report.json, prints a table per device; exit 1 when categories 1–5 find anything.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = Path(ARGS[0] if ARGS else ROOT / "shots/layout-audit"); OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get("ORALCOMPASS_WEB_BASE", "http://127.0.0.1:4173")
ONLY = next((a.split("=", 1)[1].split(",") for a in sys.argv[1:] if a.startswith("--devices=")), None)
STATE_FILTER = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--states=")), None)
FAIL_KINDS = ("overlap", "clipping", "occlusion", "overflow", "tiny")
ALL_KINDS = FAIL_KINDS + ("alignment", "clipping_named", "occlusion_panel")
SHORT = {"overlap": "ovl", "clipping": "clip", "occlusion": "occ", "overflow": "ovf", "tiny": "tiny", "alignment": "align", "clipping_named": "clip(named)", "occlusion_panel": "panel"}

# Mobile-only app (owner direction 2026-10-04, "its fully a mobile app"): the phone devices, plus a wide window where the same phone app
# renders in the centred 480 px column (audited as a phone: 44 px targets; overflow measured against the column). The desktop-1366 and
# desktop-1920 layouts no longer exist and were removed.
DEVICES = [
    {"name": "phone-360", "engine": "chromium", "viewport": {"width": 360, "height": 780}, "phone": True, "touch": True},
    {"name": "iphone-13", "engine": "webkit", "descriptor": "iPhone 13", "phone": True},
    {"name": "pixel-7", "engine": "chromium", "descriptor": "Pixel 7", "phone": True},
    # the smallest phone in use (375×667, WebKit): opt in with --devices=iphone-se (not in the default walk, which the gate pins)
    {"name": "iphone-se", "engine": "webkit", "descriptor": "iPhone SE", "phone": True, "optin": True},
    {"name": "wide-1440", "engine": "chromium", "viewport": {"width": 1440, "height": 900}, "phone": True},
]

# ------------------------------------------------------------------------------------------------------------------------------------
# The in-page audit. Returns {overlap: [...], clipping: [...], clipping_named: [...], occlusion: [...], overflow: [...], tiny: [...],
# alignment: [...], meta: {...}}. `opts`: {phone, scope (css), occlusion (bool), alignment (bool)}.
# ------------------------------------------------------------------------------------------------------------------------------------
AUDIT_JS = r"""(opts) => {
const phone = !!opts.phone;
const VW = document.documentElement.clientWidth, VH = window.innerHeight;
const INTERACTIVE = 'button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=radio],[role=checkbox],[role=switch],[role=menuitem],[role=option],[role=slider]';
const TEXTISH = 'label,h1,h2,h3,h4,h5,h6,p,li,dt,dd,td,th,caption,figcaption,blockquote,legend,[class*=badge],[class*=chip],[class*=stitch],[class*=lozenge],[class*=pill]';
const OVERLAY = '[role=dialog],[role=alertdialog],[data-slot=drawer-content],[data-slot=popover-content],[data-slot=dialog-content],[data-slot=sheet-content],[data-vaul-drawer],[data-radix-popper-content-wrapper],[role=tooltip],[role=menu],[role=listbox],.drawer,.clause[role=dialog]';
const csCache = new Map();
const cs = (el) => { let s = csCache.get(el); if (!s) { s = getComputedStyle(el); csCache.set(el, s); } return s; };
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
const r1 = (n) => Math.round(n * 10) / 10;
function desc(el) {
  if (!el || !el.tagName) return String(el);
  const cls = (typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '').trim().split(/\s+/).filter(Boolean).filter(c => !/^(\[|.*:)/.test(c)).slice(0, 4).join('.');
  const al = el.getAttribute('aria-label');
  const t = norm(el.innerText || el.value || el.textContent || '').slice(0, 50);
  return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '') + (al ? '[aria-label="' + norm(al).slice(0, 50) + '"]' : '') + (t ? ' "' + t + '"' : '');
}
function ctx(el) {   // ancestor chain for attribution to a component
  const out = []; let a = el.parentElement;
  while (a && a !== document.body && out.length < 5) {
    const cls = (typeof a.className === 'string' ? a.className : '').trim().split(/\s+/).filter(Boolean).filter(c => !/^(\[|.*:)/.test(c)).slice(0, 2).join('.');
    if (cls || a.id || a.getAttribute('role') || a.getAttribute('data-slot')) out.push(a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (cls ? '.' + cls : '') + (a.getAttribute('data-slot') ? '[slot=' + a.getAttribute('data-slot') + ']' : '') + (a.getAttribute('role') ? '[role=' + a.getAttribute('role') + ']' : ''));
    a = a.parentElement;
  }
  return out.join(' < ');
}
const rectOf = (r) => ({ x: r1(r.left), y: r1(r.top), w: r1(r.width), h: r1(r.height) });

// ---- clipping bounds from ancestors (containing-block aware: static ancestors do not clip an absolute descendant; only transformed ones clip a fixed one)
function establishes(s, forFixed) {
  const t = s.transform !== 'none' || s.filter !== 'none' || /paint|layout|strict|content/.test(s.contain || '') || /transform|filter/.test(s.willChange || '');
  return forFixed ? t : (t || s.position !== 'static');
}
function clipBounds(el, includeRoot) {
  let x1 = -1e9, y1 = -1e9, x2 = 1e9, y2 = 1e9, by = null;
  let mode = cs(el).position;
  for (let a = el.parentElement; a; a = a.parentElement) {
    if (a === document.documentElement || (!includeRoot && a === document.body)) { if (a === document.documentElement) break; continue; }
    const s = cs(a);
    let applies = true;
    if (mode === 'absolute') applies = establishes(s, false);
    else if (mode === 'fixed') applies = establishes(s, true);
    if (applies) {
      const cx = s.overflowX !== 'visible', cy = s.overflowY !== 'visible';
      if (cx || cy) {
        const ar = a.getBoundingClientRect();
        const L = ar.left + a.clientLeft, T = ar.top + a.clientTop, R = L + a.clientWidth, B = T + a.clientHeight;
        const kind = (cx && /auto|scroll/.test(s.overflowX)) || (cy && /auto|scroll/.test(s.overflowY)) ? 'scroll' : 'clip';
        if (cx && (L > x1 || R < x2)) { if (L > x1) x1 = L; if (R < x2) x2 = R; by = by || { el: a, kind }; }
        if (cy && (T > y1 || B < y2)) { if (T > y1) y1 = T; if (B < y2) y2 = B; by = by || { el: a, kind }; }
      }
      mode = s.position;
    }
  }
  return { x1, y1, x2, y2, by };
}
const inter = (r, b) => { const x1 = Math.max(r.left, b.x1), y1 = Math.max(r.top, b.y1), x2 = Math.min(r.right, b.x2), y2 = Math.min(r.bottom, b.y2); return x2 > x1 && y2 > y1 ? { left: x1, top: y1, right: x2, bottom: y2, width: x2 - x1, height: y2 - y1 } : null; };

function hiddenByStyle(el) {
  if (!(el instanceof HTMLElement)) return true;
  if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return true;
  if (!el.checkVisibility) { const s = cs(el); if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return true; }
  for (let a = el; a && a !== document.body; a = a.parentElement) {
    const s = cs(a);
    if (s.clip && s.clip !== 'auto' && /rect\(0/.test(s.clip)) return true;
    if (s.clipPath && /inset\(50%/.test(s.clipPath)) return true;
    if (parseFloat(s.opacity) < 0.05) return true;
  }
  return false;
}
function invisibleText(el) {  // transparent text with no background (pdf.js text layers, sr helpers)
  const c = cs(el).color; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return false;
  const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length >= 4 && parseFloat(p[3]) === 0;
}
const ownText = (el) => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
const isInteractive = (el) => el.matches(INTERACTIVE) || (el.matches('label') && (() => { const c = el.control; return c && hiddenByStyle(c); })());
function layerOf(el) {
  for (let a = el; a && a !== document.body; a = a.parentElement) {
    if (a.matches(OVERLAY)) return a;
    const p = cs(a).position; if (p === 'fixed' || p === 'sticky') return a;
  }
  return document.body;
}
const inert = (el) => !!el.closest('[inert],[aria-hidden="true"]');

// ---- scope: an open modal restricts the audit to the overlay layers
const modalOpen = [...document.querySelectorAll('[aria-modal="true"]')].some(m => !hiddenByStyle(m) && m.getBoundingClientRect().width > 0);
const overlayRoots = [...document.querySelectorAll(OVERLAY)].filter(m => !hiddenByStyle(m) && m.getBoundingClientRect().width > 2);
const scopeRoot = opts.scope ? document.querySelector(opts.scope) : null;
if (opts.scope && !scopeRoot) return { error: 'scope not found: ' + opts.scope };
const inScope = (el) => (!scopeRoot || scopeRoot.contains(el)) && (!modalOpen || overlayRoots.some(o => o.contains(el)));

// ---- collect items
const items = [];
for (const el of document.body.querySelectorAll('*')) {
  if (!(el instanceof HTMLElement) || el.closest('svg') || !inScope(el)) continue;
  const inter_ = isInteractive(el);
  const textish = el.matches(TEXTISH) || ownText(el);
  if (!inter_ && !textish) continue;
  if (!inter_ && !norm(el.innerText)) continue;
  if (hiddenByStyle(el)) continue;
  if (!inter_ && invisibleText(el)) continue;
  const br = el.getBoundingClientRect(); if (br.width < 2 || br.height < 2) {
    if (!(cs(el).display === 'inline' && el.getClientRects().length)) continue;
  }
  const b = clipBounds(el, true);
  const raw = cs(el).display === 'inline' ? [...el.getClientRects()] : [br];
  const boxes = raw.map(r => inter(r, b)).filter(r => r && r.width >= 1 && r.height >= 1);
  if (!boxes.length) continue;
  const u = boxes.reduce((a, r) => ({ left: Math.min(a.left, r.left), top: Math.min(a.top, r.top), right: Math.max(a.right, r.right), bottom: Math.max(a.bottom, r.bottom) }), { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 });
  items.push({ el, inter: inter_, boxes, u, layer: layerOf(el) });
}

// ---- 1 overlaps (sweep by top)
const sorted = items.slice().sort((a, b) => a.u.top - b.u.top);
let pairs = [];
for (let i = 0; i < sorted.length; i++) {
  const A = sorted[i];
  for (let j = i + 1; j < sorted.length; j++) {
    const B = sorted[j];
    if (B.u.top >= A.u.bottom - 2) break;
    if (B.u.left >= A.u.right - 2 || A.u.left >= B.u.right - 2) continue;
    if (A.layer !== B.layer) continue;
    if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
    if ((A.el.matches('label') && A.el.control && (A.el.control === B.el || A.el.control.contains(B.el))) || (B.el.matches('label') && B.el.control && (B.el.control === A.el || B.el.control.contains(A.el)))) continue;
    // a deliberate duplicate layer (an aria-hidden copy of the same label under a clip-path, e.g. the RubberSegment thumb) is not an overlap
    { const ah = A.el.closest('[aria-hidden="true"]') ? A : B.el.closest('[aria-hidden="true"]') ? B : null, other = ah === A ? B : A;
      if (ah && norm(ah.el.innerText) && norm(other.el.innerText).includes(norm(ah.el.innerText))) continue; }
    let best = null;
    for (const ra of A.boxes) for (const rb of B.boxes) {
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 2 && iy > 2 && (!best || ix * iy > best.ix * best.iy)) best = { ix, iy };
    }
    if (best) pairs.push({ A, B, ...best });
  }
}
// keep the innermost pair: drop (A,B) when a pair of their descendants (or one side identical) also overlaps
pairs = pairs.filter(p => !pairs.some(q => q !== p && ((p.A.el.contains(q.A.el) || p.A.el === q.A.el) && (p.B.el.contains(q.B.el) || p.B.el === q.B.el) || (p.A.el.contains(q.B.el) || p.A.el === q.B.el) && (p.B.el.contains(q.A.el) || p.B.el === q.A.el))));
const overlap = pairs.slice(0, 200).map(p => ({ a: desc(p.A.el), b: desc(p.B.el), px: [r1(p.ix), r1(p.iy)], ctx: ctx(p.A.el), ctx_b: ctx(p.B.el), rect_a: rectOf(p.A.el.getBoundingClientRect()), rect_b: rectOf(p.B.el.getBoundingClientRect()) }));

// ---- 2 clipping
function accName(el) {
  const parts = [el.getAttribute('aria-label'), el.getAttribute('title')];
  const ctl = el.closest(INTERACTIVE + ',[title],[aria-label]');
  if (ctl) parts.push(ctl.getAttribute('aria-label'), ctl.getAttribute('title'));
  const lb = el.getAttribute('aria-labelledby'); if (lb) lb.split(/\s+/).forEach(id => { const n = document.getElementById(id); if (n) parts.push(n.textContent); });
  return norm(parts.filter(Boolean).join(' | '));
}
const clipping = [], clippingNamed = [];
const clipCands = [];
for (const el of document.body.querySelectorAll('*')) {
  if (!(el instanceof HTMLElement) || el.closest('svg') || !inScope(el)) continue;
  const s = cs(el);
  if (s.display === 'inline' || s.display === 'contents' || s.display === 'none') continue;
  const ell = s.textOverflow === 'ellipsis';
  const clampV = (s.webkitLineClamp && s.webkitLineClamp !== 'none') || (s.lineClamp && s.lineClamp !== 'none');
  const cx = /hidden|clip/.test(s.overflowX) || ell, cy = /hidden|clip/.test(s.overflowY) || clampV;
  if (!cx && !cy) continue;
  if (el.clientWidth <= 2 || el.clientHeight <= 2) continue;
  if (!(el.scrollWidth > el.clientWidth + 1 && cx) && !(el.scrollHeight > el.clientHeight + 1 && cy)) continue;
  if (hiddenByStyle(el)) continue;
  const er = el.getBoundingClientRect();
  const L = er.left + el.clientLeft, T = er.top + el.clientTop, R = L + el.clientWidth, B = T + el.clientHeight;
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const cut = []; let n, count = 0;
  while ((n = tw.nextNode()) && count < 400) {
    count++;
    if (!n.textContent.trim()) continue;
    const pe = n.parentElement; if (!pe || pe.closest('svg') || hiddenByStyle(pe) || invisibleText(pe)) continue;
    // a nearer clipping/scrolling box between the text and this element owns that overflow (e.g. a sideways table scroller)
    let inner = false; for (let a = pe; a && a !== el; a = a.parentElement) { const z = cs(a); if (z.overflowX !== 'visible' || z.overflowY !== 'visible') { inner = true; break; } }
    if (inner && pe !== el) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const outX = cx && (r.right > R + 1 || r.left < L - 1), outY = cy && (r.bottom > B + 1 || r.top < T - 1);
      if (outX || outY) { cut.push({ node: n, outX, outY, by: r1(Math.max(r.right - R, L - r.left, 0)) + 'x' + r1(Math.max(r.bottom - B, T - r.top, 0)) }); break; }
    }
  }
  if (!cut.length) continue;
  clipCands.push({ el, s, cut, ell, clampV });
}
for (const c of clipCands) {
  // innermost: skip when every cut node is also cut by a flagged descendant
  if (clipCands.some(d => d !== c && c.el.contains(d.el) && c.cut.every(k => d.cut.some(m => m.node === k.node)))) continue;
  const full = norm(c.el.innerText || c.el.textContent);
  const name = accName(c.el);
  const rec = { el: desc(c.el), ctx: ctx(c.el), how: c.ell ? 'ellipsis' : c.clampV ? 'line-clamp' : 'overflow:' + c.s.overflowX + '/' + c.s.overflowY,
                cut_text: norm(c.cut[0].node.textContent).slice(0, 80), overflow_px: c.cut[0].by, size: [c.el.clientWidth, c.el.clientHeight], scroll: [c.el.scrollWidth, c.el.scrollHeight] };
  (name && full && name.toLowerCase().includes(full.toLowerCase().slice(0, 200)) ? clippingNamed : clipping).push(rec);
}
// selects: the selected option's text wider than the content box
const cvs = document.createElement('canvas').getContext('2d');
for (const el of document.querySelectorAll('select')) {
  if (!inScope(el) || hiddenByStyle(el)) continue;
  const s = cs(el); const opt = el.options[el.selectedIndex]; if (!opt) continue;
  cvs.font = [s.fontStyle, s.fontWeight, s.fontSize, s.fontFamily].join(' ');
  const txt = norm(opt.textContent); const w = cvs.measureText(txt).width;
  const avail = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
  if (w > avail + 1) {
    const rec = { el: desc(el), ctx: ctx(el), how: 'select option text', cut_text: txt.slice(0, 80), overflow_px: r1(w - avail) + 'x0', size: [el.clientWidth, el.clientHeight], scroll: [Math.round(w), 0] };
    ((el.getAttribute('title') || '').includes(txt) ? clippingNamed : clipping).push(rec);
  }
}

// ---- 4 overflow
const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
const overflow = [];
if (docW > VW + 0.5) overflow.push({ el: 'document', ctx: '', detail: 'page scrollWidth ' + docW + ' > viewport ' + VW });
// mobile-only app: on a window wider than the phone, the 480 px app column IS the screen, so content must stay inside the column; the
// painted cinema behind it and full-window scrims are decorative backdrops
const appEl = document.querySelector('.app'), appR = appEl ? appEl.getBoundingClientRect() : null;
const COL = appR && appR.width < VW - 1 ? { left: appR.left, right: appR.right } : { left: 0, right: VW };
const BACKDROP = '.cinema, [data-vaul-overlay], [data-slot=drawer-overlay], [data-slot=dialog-overlay], [data-slot=sheet-overlay], .clause-scrim, .cast-line, .thread-pull';
const offenders = [];
for (const el of document.body.querySelectorAll('*')) {
  if (!(el instanceof HTMLElement) || el.closest('svg') || !inScope(el)) continue;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1 || (r.right <= COL.right + 1 && r.left >= COL.left - 1)) continue;
  if (r.right <= 0 || r.left >= VW) continue;               // wholly off-canvas: a parked skip link / closed panel, not overflow
  if (hiddenByStyle(el) || el.closest(BACKDROP)) continue;
  const b = clipBounds(el, false);
  const vis = inter(r, b); if (!vis) continue;
  if (vis.right > COL.right + 1 || vis.left < COL.left - 1) offenders.push({ el, vis });
}
for (const o of offenders) {
  if (offenders.some(p => p !== o && p.el.contains(o.el))) continue;   // report the outermost offender
  overflow.push({ el: desc(o.el), ctx: ctx(o.el), detail: 'spans x ' + r1(o.vis.left) + '…' + r1(o.vis.right) + ' (screen ' + r1(COL.left) + '…' + r1(COL.right) + ')' });
}

// ---- 5 tiny targets and 3 occlusion
const minT = phone ? 44 : 32;
function pseudoExpand(el, r) {
  let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  const host = cs(el);
  for (const pe of ['::before', '::after']) {
    const s = getComputedStyle(el, pe);
    if (!s || s.content === 'none' || s.content === 'normal' || s.position !== 'absolute' || host.position === 'static') continue;
    const px = (v) => (v && v.endsWith('px') ? parseFloat(v) : null);
    const t = px(s.top), l = px(s.left), rr = px(s.right), bb = px(s.bottom), w = px(s.width), h = px(s.height);
    const L = l !== null ? r.left + l : (rr !== null && w !== null ? r.right - rr - w : r.left);
    const T = t !== null ? r.top + t : (bb !== null && h !== null ? r.bottom - bb - h : r.top);
    const R = rr !== null ? r.right - rr : (w !== null ? L + w : r.right);
    const B = bb !== null ? r.bottom - bb : (h !== null ? T + h : r.bottom);
    box = { left: Math.min(box.left, L), top: Math.min(box.top, T), right: Math.max(box.right, R), bottom: Math.max(box.bottom, B) };
  }
  return box;
}
function inlineInText(el) {
  if (!el.matches('a[href]') && !/^inline/.test(cs(el).display)) return false;
  const p = el.parentElement; if (!p) return false;
  return [...p.childNodes].some(n => n !== el && n.nodeType === 3 && n.textContent.trim().length > 1);
}
const tiny = [], occlusion = [], occlusionPanel = [];
const targets = items.filter(i => i.inter && !inert(i.el) && !i.el.disabled && cs(i.el).pointerEvents !== 'none');
// a control whose own box is cut by an overflow:hidden/clip ancestor (not a scroller) is clipped even when its label text survives
for (const t of items.filter(i => i.inter)) {
  const r = t.el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
  const b = clipBounds(t.el, false); if (!b.by || b.by.kind !== 'clip') continue;
  const v = inter(r, b); if (!v) continue;
  const cutW = r.width - v.width, cutH = r.height - v.height;
  if (cutW > 2 || cutH > 2) {
    if (clipping.some(c => c.el === desc(t.el))) continue;
    clipping.push({ el: desc(t.el), ctx: ctx(t.el), how: 'control cut by ancestor ' + desc(b.by.el).slice(0, 60), cut_text: norm(t.el.innerText || t.el.getAttribute('aria-label') || '').slice(0, 80),
                    overflow_px: r1(cutW) + 'x' + r1(cutH), size: [r1(v.width), r1(v.height)], scroll: [r1(r.width), r1(r.height)] });
  }
}
for (const t of targets) {
  const el = t.el; const r = el.getBoundingClientRect();
  let box = pseudoExpand(el, r);
  const lab = el.closest('label'); if (lab && lab !== el) { const lr = lab.getBoundingClientRect(); box = { left: Math.min(box.left, lr.left), top: Math.min(box.top, lr.top), right: Math.max(box.right, lr.right), bottom: Math.max(box.bottom, lr.bottom) }; }
  const w = box.right - box.left, h = box.bottom - box.top;
  if ((w < minT - 0.5 || h < minT - 0.5) && !inlineInText(el) && !(el.matches('input[type=radio],input[type=checkbox]') && el.labels && [...el.labels].some(l => { const lr = l.getBoundingClientRect(); return lr.width >= minT && lr.height >= minT; })))
    tiny.push({ el: desc(el), ctx: ctx(el), size: [r1(w), r1(h)], min: minT });
}
if (opts.occlusion) {
  const scrollers = [...document.querySelectorAll('*')].filter(e => e.scrollTop || e.scrollLeft).map(e => [e, e.scrollTop, e.scrollLeft]);
  const wx = window.scrollX, wy = window.scrollY;
  for (const t of targets) {
    const el = t.el;
    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (e) { el.scrollIntoView(); }
    const first = (cs(el).display === 'inline' ? el.getClientRects()[0] : null) || el.getBoundingClientRect();
    const vis = inter(first, clipBounds(el, true)); if (!vis) continue;
    const x = (vis.left + vis.right) / 2, y = (vis.top + vis.bottom) / 2;
    if (x < 0 || y < 0 || x >= VW || y >= VH) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit) continue;
    const ok = hit === el || el.contains(hit) || hit.contains(el) || (el.labels && [...el.labels].includes(hit)) || (hit.closest && hit.closest('label') && hit.closest('label').control === el)
      || (hit.getRootNode && hit.getRootNode() !== document && el.contains(hit.getRootNode().host));
    if (!ok) {
      const hl = layerOf(hit), tl = t.layer;
      (hl !== tl ? occlusionPanel : occlusion).push({ el: desc(el), ctx: ctx(el), covered_by: desc(hit), covered_ctx: ctx(hit), at: [Math.round(x), Math.round(y)], cross_layer: hl !== tl });
    }
  }
  window.scrollTo({ left: wx, top: wy, behavior: 'instant' });
  for (const [e, st, sl] of scrollers) { e.scrollTop = st; e.scrollLeft = sl; }
  for (const e of document.querySelectorAll('*')) if ((e.scrollTop || e.scrollLeft) && !scrollers.some(s => s[0] === e) && e !== document.documentElement && e !== document.body) { e.scrollTop = 0; e.scrollLeft = 0; }
}

// ---- 6 alignment smells
const alignment = [];
if (opts.alignment) {
  const byParent = new Map();
  for (const t of items.filter(i => i.inter && cs(i.el).display !== 'inline')) { const p = t.el.parentElement; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(t); }
  for (const [p, kids] of byParent) {
    if (kids.length < 2) continue;
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].el.getBoundingClientRect(), b = kids[j].el.getBoundingClientRect();
      const vOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (vOverlap < Math.min(a.height, b.height) * 0.5) continue;
      const dTop = Math.abs(a.top - b.top);
      if (Math.abs(a.height - b.height) <= 1 && dTop >= 1 && dTop <= 3) alignment.push({ el: desc(kids[i].el), b: desc(kids[j].el), ctx: ctx(kids[i].el), detail: 'row tops differ by ' + r1(dTop) + ' px' });
    }
  }
  for (const table of document.querySelectorAll('table')) {
    if (!inScope(table) || hiddenByStyle(table)) continue;
    const rows = [...table.rows].slice(0, 60);
    // header cells must sit over their columns: the k-th header cell and the k-th cell of the first body row share x-range
    const head = table.tHead && table.tHead.rows[0], body = table.tBodies[0] && table.tBodies[0].rows[0];
    if (head && body && head.cells.length === body.cells.length) {
      const off = [...head.cells].map((h, k) => [h, body.cells[k]]).filter(([h, c]) => { const a = h.getBoundingClientRect(), b = c.getBoundingClientRect(); return a.width > 0 && b.width > 0 && (Math.min(a.right, b.right) - Math.max(a.left, b.left)) < Math.min(a.width, b.width) * 0.5; });
      if (off.length) alignment.push({ el: desc(table), ctx: ctx(table), detail: 'table header cells not over their columns: ' + off.map(([h]) => norm(h.textContent).slice(0, 20)).join(', ') });
    }
    const probes = [];
    for (const tr of rows) for (const cell of tr.cells) {
      const tw = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT); let n;
      while ((n = tw.nextNode())) { if (n.textContent.trim() && n.parentElement && !hiddenByStyle(n.parentElement) && !n.parentElement.closest('.sr-only')) break; }
      if (!n) continue;
      const sp = document.createElement('span'); sp.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;padding:0;margin:0;border:0';
      n.parentNode.insertBefore(sp, n); probes.push([tr, cell, sp]);
    }
    const byRow = new Map();
    for (const [tr, cell, sp] of probes) { const y = sp.getBoundingClientRect().top; if (!byRow.has(tr)) byRow.set(tr, []); byRow.get(tr).push([cell, y]); }
    for (const [, , sp] of probes) sp.remove();
    for (const [tr, cells] of byRow) {
      if (cells.length < 2) continue;
      const ys = cells.map(c => c[1]); const d = Math.max(...ys) - Math.min(...ys);
      if (d >= 1 && d <= 3) alignment.push({ el: desc(tr), ctx: ctx(table), detail: 'table row baselines differ by ' + r1(d) + ' px' });
    }
  }
}
return { overlap, clipping, clipping_named: clippingNamed, occlusion, occlusion_panel: occlusionPanel, overflow, tiny, alignment,
         meta: { vw: VW, vh: VH, doc_w: docW, items: items.length, targets: targets.length, modal: modalOpen } };
}"""

SCROLLERS_JS = r"""(scope) => {
  const OVERLAY = '[role=dialog],[role=alertdialog],[data-slot=drawer-content],[data-slot=popover-content],[data-slot=dialog-content],[data-vaul-drawer],.drawer,.clause[role=dialog]';
  const modal = [...document.querySelectorAll('[aria-modal="true"]')].some(m => m.getBoundingClientRect().width > 0);
  const root = scope ? document.querySelector(scope) : document.body; if (!root) return [];
  const out = []; let i = 0;
  for (const e of root.querySelectorAll('*')) {
    if (!(e instanceof HTMLElement) || e.closest('svg')) continue;
    if (modal && !e.closest(OVERLAY)) continue;
    const s = getComputedStyle(e);
    const y = /auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 8 && e.clientHeight > 40;
    const x = /auto|scroll/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 8 && e.clientWidth > 40;
    if (!y && !x) continue;
    const r = e.getBoundingClientRect(); if (r.width < 40 || r.height < 40) continue;
    e.setAttribute('data-la-scroller', String(i));
    out.push({ id: i++, y, x, ch: e.clientHeight, sh: e.scrollHeight, cw: e.clientWidth, sw: e.scrollWidth });
  }
  return out.slice(0, 6);
}"""

KEY_FIELDS = {"overlap": ("a", "b"), "clipping": ("el", "cut_text"), "clipping_named": ("el", "cut_text"), "occlusion": ("el", "covered_by"),
              "overflow": ("el", "detail"), "tiny": ("el",), "alignment": ("el", "detail"), "occlusion_panel": ("el", "covered_by")}


def merge(into: dict, res: dict):
    for k in ALL_KINDS:
        seen = {tuple(f.get(x) for x in KEY_FIELDS[k]) for f in into[k]}
        for f in res.get(k, []):
            sig = tuple(f.get(x) for x in KEY_FIELDS[k])
            if sig not in seen:
                into[k].append(f); seen.add(sig)


def settle(page, ms: int = 250):
    page.wait_for_timeout(ms)
    try:
        page.wait_for_function("() => !document.getAnimations || document.getAnimations().every(a => a.playState !== 'running' || (a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity))", timeout=2500)
    except Exception:  # noqa: BLE001
        pass


class Auditor:
    def __init__(self, page, device: dict):
        self.page, self.device = page, device
        self.dir = OUT / device["name"]; self.dir.mkdir(parents=True, exist_ok=True)
        self.states: list[dict] = []
        self.n = 0

    def audit(self, state: str, scope: str | None = None):
        if STATE_FILTER and not re.search(STATE_FILTER, state):
            return
        page = self.page
        settle(page)
        self.n += 1
        found = {k: [] for k in ALL_KINDS}
        opts = {"phone": self.device["phone"], "scope": scope, "occlusion": True, "alignment": True}
        res = page.evaluate(AUDIT_JS, opts)
        if res.get("error"):
            self.states.append({"state": state, "error": res["error"]}); print(f"  ! {state}: {res['error']}"); return
        meta = res["meta"]; merge(found, res)
        # step through inner scroll containers so content below their fold is audited too (occlusion already scrolls each target in)
        steps = 0
        for sc in page.evaluate(SCROLLERS_JS, scope):
            sel = f"[data-la-scroller='{sc['id']}']"
            positions = []
            if sc["y"]:
                positions += [("top", min(sc["sh"] - sc["ch"], int(k * sc["ch"] * 0.8))) for k in range(1, 12) if k * sc["ch"] * 0.8 < sc["sh"] - sc["ch"] + sc["ch"] * 0.8]
            if sc["x"]:
                positions += [("left", min(sc["sw"] - sc["cw"], int(k * sc["cw"] * 0.8))) for k in range(1, 6) if k * sc["cw"] * 0.8 < sc["sw"] - sc["cw"] + sc["cw"] * 0.8]
            for axis, pos in positions[:12]:
                if steps >= 30: break
                steps += 1
                page.evaluate("([s, a, p]) => { const e = document.querySelector(s); if (e) e[a === 'top' ? 'scrollTop' : 'scrollLeft'] = p; }", [sel, axis, pos])
                page.wait_for_timeout(60)
                merge(found, page.evaluate(AUDIT_JS, {**opts, "occlusion": False, "alignment": False}))
            page.evaluate("(s) => { const e = document.querySelector(s); if (e) { e.scrollTop = 0; e.scrollLeft = 0; e.removeAttribute('data-la-scroller'); } }", sel)
        safe = re.sub(r"[^a-z0-9]+", "-", state.lower()).strip("-")[:60]
        shot = self.dir / f"{self.n:02d}-{safe}.png"
        try:
            page.screenshot(path=shot, full_page=True, scale="css", timeout=30000)
        except Exception as e:  # noqa: BLE001
            print(f"  ! screenshot {state}: {str(e).splitlines()[0][:100]}")
        counts = {k: len(found[k]) for k in ALL_KINDS}
        self.states.append({"state": state, "scope": scope, "screenshot": str(shot.relative_to(OUT)), "counts": counts, "meta": meta, "scroll_steps": steps, **found})
        flag = "FAIL" if any(counts[k] for k in FAIL_KINDS) else "ok  "
        print(f"  {flag} {state:44s} " + " ".join(f"{SHORT[k]}={counts[k]}" for k in ALL_KINDS))

    def note_error(self, state: str, err: Exception):
        lines = [l.strip() for l in str(err).splitlines() if l.strip()]
        why = [l for l in lines if re.search(r"intercepts pointer|not visible|not stable|outside of the viewport|detached|waiting for", l)]
        msg = (lines[0] if lines else repr(err))[:200] + (" | " + " | ".join(dict.fromkeys(why))[:400] if why else "")
        self.states.append({"state": state, "error": msg}); print(f"  ! {state}: {msg}")


def dev_context(browser, device: dict, pw):
    user = "layout-" + device["name"]
    kw = {"reduced_motion": "reduce"}
    if device.get("descriptor"):
        kw.update(pw.devices[device["descriptor"]]); kw.pop("default_browser_type", None)
    else:
        kw.update({"viewport": device["viewport"], "device_scale_factor": 1})
        if device.get("touch"): kw.update({"has_touch": True, "is_mobile": device["engine"] == "chromium"})
    ctx = browser.new_context(**kw)

    def add_dev_user(route):
        headers = {**route.request.headers, "x-dev-user": user}
        route.continue_(headers=headers)
    ctx.route(re.compile(r"^https?://[^/]+/api/"), add_dev_user)
    return ctx


def walk(pw, device: dict) -> dict:
    browser = getattr(pw, device["engine"]).launch()
    ctx = dev_context(browser, device, pw)
    page = ctx.new_page()
    page.set_default_timeout(15000)
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)[:200]))
    A = Auditor(page, device)
    phone = device["phone"]
    print(f"\n== {device['name']} ({device['engine']}) ==")

    def step(state: str, fn):
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            A.note_error(state, e)
            for _ in range(2):
                page.keyboard.press("Escape"); page.wait_for_timeout(200)

    def close_all():
        for _ in range(3):
            btn = page.get_by_role("button", name=re.compile("^(Close details|Close clause card|Close clause)$"))
            vis = [i for i in range(btn.count()) if btn.nth(i).is_visible()]
            if vis:
                btn.nth(vis[-1]).click(); page.wait_for_timeout(300); continue
            if page.locator(".drawer, .clause[role=dialog], [role=dialog]").count():
                page.keyboard.press("Escape"); page.wait_for_timeout(300); continue
            break

    def tab(name: str, wait: int = 900):
        page.get_by_role("tab", name=name).first.click(); page.wait_for_timeout(wait)

    def seg(name: str):
        b = page.get_by_role("button", name=name, exact=True)
        if b.count() and b.first.is_visible():
            b.first.click(); page.wait_for_timeout(500); return True
        return False

    # ---- start screen → Alex
    page.goto(BASE, wait_until="load", timeout=60000)   # WebKit never reaches networkidle here; wait for the app shell instead
    page.wait_for_selector("h1", timeout=30000); page.wait_for_timeout(1500)
    step("start-screen", lambda: A.audit("start-screen"))

    def open_alex():
        if page.get_by_role("heading", name="Starting point").count():
            page.locator("button", has_text="Alex Chen").first.click(); page.wait_for_timeout(1200)
        page.wait_for_selector("text=checkpoints completed", timeout=20000); page.wait_for_timeout(2500)
    step("open-alex", open_alex)
    step("journey-map", lambda: A.audit("journey-map (no selection)"))

    # ---- every island (procedure, START, Harbor Light, marginal, visited chips) and the procedure drawer fully expanded
    ISL = "#passage-islands button:not(.cp-btn):not([data-cp-of]):not(.pv-cp):not(.stitch)"
    labels = page.locator(ISL).evaluate_all("bs => bs.map(b => (b.getAttribute('aria-label') || b.textContent || '').trim())")
    seen_l = set()
    for i, lab in enumerate(labels):
        short = re.split(r" ·|:|,", lab)[0].strip()[:40] or f"island {i}"
        if short in seen_l: short = f"{short} #{i}"
        seen_l.add(short)

        def one(i=i, short=short):
            close_all()
            if phone: seg("Map view")
            page.locator(ISL).nth(i).scroll_into_view_if_needed(); page.locator(ISL).nth(i).click(); page.wait_for_timeout(1000)
            A.audit(f"island: {short}")
            if page.locator(".drawer details").count():
                page.evaluate("() => document.querySelectorAll('.drawer details').forEach(d => { d.open = true; })"); page.wait_for_timeout(500)
                A.audit(f"drawer expanded: {short}")
            close_all()
        step(f"island: {short}", one)

    # ---- arriving from a checkpoint row on the passage (the desktop route markers went with the desktop layout)
    def checkpoint_phone():
        close_all(); seg("Map view")
        b = page.locator("#passage-islands .pv-cp")
        if b.count():
            b.first.scroll_into_view_if_needed(); b.first.click(); page.wait_for_timeout(900); A.audit("checkpoint row → drawer"); close_all()
    step("checkpoint", checkpoint_phone)

    # ---- root canal drawer: clause card at each depth, assistant answer, advice template
    def clause_depths():
        close_all()
        page.locator("button[aria-label^='Root canal']").first.click(); page.wait_for_timeout(1200)
        st = page.locator(".drawer [data-section='share'] .stitch").first
        st.scroll_into_view_if_needed(); st.click(); page.wait_for_timeout(700)
        card = page.locator(".clause[role=dialog]").first
        radios = card.get_by_role("radio")
        names = [radios.nth(k).inner_text().strip() for k in range(radios.count())]
        if not names: A.audit("clause card (drawer)")
        for k, nm in enumerate(names):
            radios.nth(k).click(); page.wait_for_timeout(500)
            A.audit(f"clause card depth: {nm}")
        page.keyboard.press("Escape"); page.wait_for_timeout(400)
    step("clause card", clause_depths)

    def assistant():
        if not page.locator(".drawer").count():
            page.locator("button[aria-label^='Root canal']").first.click(); page.wait_for_timeout(1200)
        ta = page.locator(".drawer textarea").first
        ta.scroll_into_view_if_needed(); ta.fill("What happens to the annual maximum on this line?")
        page.locator(".drawer").get_by_role("button", name="Ask", exact=True).first.click(); page.wait_for_timeout(2500)
        page.locator(".drawer .as-answer").first.scroll_into_view_if_needed()
        A.audit("assistant: demo answer")
        ta.fill("Should I get the crown?")
        page.locator(".drawer").get_by_role("button", name="Ask", exact=True).first.click(); page.wait_for_timeout(2000)
        A.audit("assistant: advice template")
        close_all()
    step("assistant", assistant)

    # ---- care timeline: stage and checkpoint detail; overview list
    def care():
        close_all()
        seg("Care timeline")
        A.audit("care timeline")
        page.locator("button[aria-label^='Before your visit']").first.scroll_into_view_if_needed()
        page.locator("button[aria-label^='Before your visit']").first.click(); page.wait_for_timeout(500)
        A.audit("care stage: Before your visit")
        if phone:   # the phone stage detail is a modal sheet over the timeline: close it before using the timeline again
            close_all()
        page.locator("button[aria-label^='Appointment information recorded']").first.click(); page.wait_for_timeout(500)
        A.audit("care checkpoint detail")
        close_all()
    step("care timeline", care)

    def overview():
        close_all()
        seg("Overview list"); page.wait_for_timeout(300)
        A.audit("overview list")
        seg("Map view")
    step("overview list", overview)

    # ---- My plan: page, compass, every landmark, add procedure + reader
    def plan():
        close_all(); tab("My plan")
        A.audit("my plan")
        cmp = page.locator(".compass").first
        if cmp.count():
            cmp.scroll_into_view_if_needed(); A.audit("my plan: compass", scope=".compass")
        lm = page.locator(".pa-stop")   # the painted plan map's five stops (phone-only app; the flat atlas buttons are gone)
        for k in range(lm.count()):
            def one(k=k):
                close_all()
                b = page.locator(".pa-stop").nth(k)
                term = b.locator(".pa-term").inner_text().strip()
                b.scroll_into_view_if_needed(); b.click(); page.wait_for_timeout(900)
                A.audit(f"my plan landmark: {term}")
                close_all()
            step(f"landmark {k}", one)
    step("my plan", plan)

    def add_proc():
        close_all()
        det = page.locator("details", has_text="Add a procedure").first
        if not det.count(): return
        if not det.evaluate("d => d.open"): det.locator("summary").first.click(); page.wait_for_timeout(600)
        det.scroll_into_view_if_needed()
        A.audit("my plan: add a procedure open")
        if page.locator(".tpr-sample").count():
            page.locator(".tpr-sample").first.click(); page.wait_for_timeout(200)
            page.get_by_role("button", name="Read these lines").click(); page.wait_for_timeout(2500)
            page.locator(".tpr").first.scroll_into_view_if_needed()
            A.audit("my plan: treatment-plan reader rows")
        det.locator("summary").first.click(); page.wait_for_timeout(300)
    step("add procedure", add_proc)

    # ---- fog (FM26H): plan, journey, drawer
    def fog():
        close_all()
        page.locator("label.plan-pick select").first.select_option("FM26H"); page.wait_for_timeout(1600)
        close_all()
        A.audit("fog: my plan (FM26H)")
        tab("My journey", 1500); seg("Map view")
        A.audit("fog: journey map (FM26H)")
        page.locator("button[aria-label^='Root canal']").first.click(); page.wait_for_timeout(1100)
        A.audit("fog: procedure drawer (FM26H)")
        close_all()
        tab("My plan", 600)
        page.locator("label.plan-pick select").first.select_option("ML26"); page.wait_for_timeout(1400)
        close_all()
    step("fog", fog)

    # ---- Compare
    def compare():
        close_all(); tab("Compare", 2500)
        A.audit("compare")
        page.locator("table.grid tbody button[aria-expanded]").first.click(); page.wait_for_timeout(700)
        A.audit("compare: clause popover")
        close_all()
        if page.locator("[data-slot=popover-content]").count(): page.keyboard.press("Escape"); page.wait_for_timeout(300)
    step("compare", compare)

    # ---- Documents, clause card, reminders
    def documents():
        close_all(); tab("Documents", 1500)
        A.audit("documents")
        page.locator("ol.clauses li button").first.click(); page.wait_for_timeout(1200)
        A.audit("documents: clause card")
        page.get_by_role("button", name="Close clause card").click(); page.wait_for_timeout(300)
        rm = page.locator(".rm-item").first
        if rm.count():
            rm.scroll_into_view_if_needed()
            scope = page.evaluate("() => { const r = document.querySelector('.rm-item'); const p = r && (r.closest('section,aside,[class*=reminder],[class*=rm-]:not(.rm-item)') || r.parentElement); if (!p) return null; p.setAttribute('data-la-scope', 'reminders'); return \"[data-la-scope='reminders']\"; }")
            A.audit("reminders", scope=scope)
    step("documents", documents)

    # ---- upload wizard: every step
    def upload():
        close_all()
        page.get_by_role("button", name="Add a plan document").first.click(); page.wait_for_timeout(800)
        A.audit("upload 1: choose a file")
        txt = OUT / "not-a-pdf.txt"; txt.write_text("plain text, not a PDF")
        page.locator("input[type=file]").first.set_input_files(str(txt)); page.wait_for_timeout(600)
        A.audit("upload 1: type error")
        # client redaction: the fictional sample's on-device review (count, chips, the open identifier list, terms, redacted text)
        page.get_by_role("button", name="Try a fictional sample statement").click()
        page.wait_for_selector("[role=dialog] [data-rs-headline]", timeout=60000); page.wait_for_timeout(1200)
        A.audit("upload 2: personal details (sample)")
        page.locator("[role=dialog] summary.rs-list-summary").click(); page.wait_for_timeout(400)
        A.audit("upload 2: personal details, identifier list open")
        page.get_by_role("button", name="Choose another file").click(); page.wait_for_timeout(600)
        page.locator("input[type=file]").first.set_input_files(str(ROOT / "fixtures/documents/harborview_certificate.pdf"))
        page.wait_for_selector("[role=dialog] [data-rs-headline]", timeout=60000); page.wait_for_timeout(800)
        A.audit("upload 2: personal details (certificate)")
        page.get_by_role("button", name="Continue", exact=True).click(); page.wait_for_timeout(400)
        A.audit("upload 3: extraction running")
        page.wait_for_selector("text=Review the fields", timeout=240000); page.wait_for_timeout(500)
        A.audit("upload 3: extraction done")
        page.get_by_role("button", name="Review the fields").click(); page.wait_for_timeout(900)
        A.audit("upload 4: review table")
        page.get_by_role("button", name="Confirm all verified quotes").click(); page.wait_for_timeout(1500)
        for _ in range(60):
            if page.locator(".up-count[data-undecided='0']").count(): break
            row = page.locator(".up-row:not([data-decided])").filter(has=page.locator(".up-req")).first
            if not row.count(): row = page.locator(".up-row:not([data-decided])").first
            if not row.count(): break
            row.get_by_role("button", name="Not in document").first.click(); page.wait_for_timeout(400)
        A.audit("upload 4: review table decided")
        page.locator("[role=dialog] .hb-root").first.focus()
        page.keyboard.down("Space"); page.wait_for_timeout(1200); page.keyboard.up("Space")
        page.wait_for_selector("text=/Published as UP\\d+/", timeout=30000); page.wait_for_timeout(600)
        A.audit("upload 5: published")
        page.keyboard.press("Escape"); page.wait_for_timeout(900)
        opts = page.locator("label.plan-pick select option").evaluate_all("os => os.map(o => [o.value, o.textContent])")
        up = next((o for o in opts if (o[0] or "").startswith("upload:")), None)
        if up:
            page.locator("label.plan-pick select").first.select_option(up[0])
            try: page.wait_for_selector(".pdf-stitch", timeout=20000)
            except Exception: pass  # noqa: BLE001
            page.wait_for_timeout(800)
            A.audit("documents: uploaded plan (UP1)")
            page.locator("label.plan-pick select").first.select_option("ML26"); page.wait_for_timeout(1000)
    step("upload", upload)

    browser.close()
    return {"device": device["name"], "engine": device["engine"], "phone": phone, "page_errors": errors, "states": A.states}


def main():
    t0 = time.time()
    report = {"base": BASE, "generated": time.strftime("%Y-%m-%d %H:%M:%S"), "devices": []}
    with sync_playwright() as pw:
        for d in DEVICES:
            if ONLY and d["name"] not in ONLY: continue
            if not ONLY and d.get("optin"): continue
            try:
                report["devices"].append(walk(pw, d))
            except Exception as e:  # noqa: BLE001
                report["devices"].append({"device": d["name"], "error": str(e).splitlines()[0][:300], "states": []})
                print(f"!! {d['name']}: {e}")
    totals = {k: 0 for k in ALL_KINDS}
    table = []
    for dv in report["devices"]:
        for st in dv["states"]:
            c = st.get("counts")
            if c:
                for k in ALL_KINDS: totals[k] += c[k]
            table.append({"device": dv["device"], "state": st["state"], **(c or {"error": st.get("error")})})
    report["totals"] = totals
    report["table"] = table
    report["seconds"] = round(time.time() - t0)
    (OUT / "report.json").write_text(json.dumps(report, indent=1))
    print("\n| device | view / state | overlap | clipping | occlusion | overflow | tiny | alignment | clip(named) | covered by panel |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for r in table:
        if "error" in r: print(f"| {r['device']} | {r['state']} | error: {str(r['error'])[:60]} ||||||||"); continue
        print(f"| {r['device']} | {r['state']} | {r['overlap']} | {r['clipping']} | {r['occlusion']} | {r['overflow']} | {r['tiny']} | {r['alignment']} | {r['clipping_named']} | {r['occlusion_panel']} |")
    print("\nTotals: " + ", ".join(f"{k}={v}" for k, v in totals.items()) + f"  ({report['seconds']} s) → {OUT / 'report.json'}")
    sys.exit(1 if any(totals[k] for k in FAIL_KINDS) else 0)


if __name__ == "__main__":
    main()
