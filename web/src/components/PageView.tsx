import { useEffect, useRef, useState } from "react";
import { PLAN } from "../lib/copy/plan";
import * as pdfjs from "pdfjs-dist";
import type { Stitch } from "../lib/types";
import { circled } from "../lib/stitches";
import { renderSequential, stitchKey } from "../lib/pdfRender";
import { clusterPins, quoteItemRange } from "../lib/pageview";

// Vite-friendly worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Props { url: string; stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; dim?: boolean; /** The document's title, for each page's text alternative. */ title?: string }

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** One rendered page: the pdf.js page, its viewport, the visible canvas and an untouched copy of the render (the overlay restores from it). */
interface RenderedPage { p: number; page: pdfjs.PDFPageProxy; vp: pdfjs.PageViewport; wrap: HTMLDivElement; canvas: HTMLCanvasElement; base: HTMLCanvasElement; rects: Map<string, Promise<number[][]>> }

/** Find viewport rectangles for a quote on a page by matching the text layer. Returns [] when not found (margin-stitch fallback).
 *  Only the items the quote covers (lib/pageview quoteItemRange, raw offsets) are measured, so the highlight stays on the quoted line. */
async function locate(page: pdfjs.PDFPageProxy, viewport: pdfjs.PageViewport, quote: string): Promise<number[][]> {
  const tc = await page.getTextContent();
  const items = tc.items.filter((it: any) => "str" in it) as any[];
  const range = quoteItemRange(items.map((it) => String(it.str)), quote);
  if (!range) return [];
  const rects: number[][] = [];
  for (let i = range[0]; i <= range[1]; i++) {
    const it = items[i];
    if (!String(it.str).trim()) continue;
    const [sx, , , sy, x, y] = it.transform;
    const h = Math.hypot(sy, it.transform[2]) || sy;
    const r = viewport.convertToViewportRectangle([x, y, x + it.width * (sx / Math.abs(sx || 1)), y + h]);
    rects.push([Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.abs(r[2] - r[0]), Math.abs(r[3] - r[1])]);
  }
  return rects;
}

const PIN_GAP = 48;   // a 24 px pin with its 44 px hit area plus air: closer lines share one grouped pin (layout-4)

/** One pin in the left margin, ending just before the text column; a run of close lines shares one pin that opens a list. */
function makePin(group: { s: Stitch; top: number; x: number }[], page: number, pageWidth: number, selectedId: string | undefined, onSelect: (s: Stitch) => void): HTMLElement {
  const first = group[0].s;
  const ns = group.map((g) => g.s.n);
  const lo = Math.min(...ns), hi = Math.max(...ns);
  const box = document.createElement("div"); box.className = "pdf-pin";
  const tag = document.createElement("button"); tag.type = "button"; tag.className = "unstyled pdf-stitch";
  const top = Math.max(0, Math.min(...group.map((g) => g.top)) - 6);
  const x = Math.min(...group.map((g) => g.x));
  box.style.top = `${top}px`;
  if (x >= 64) box.style.right = `${pageWidth - x + 10}px`; else box.style.left = "2px";
  if (group.length === 1) {
    tag.textContent = `${first.doc} ${circled(first.n)}`;
    tag.setAttribute("aria-label", `Stitch ${first.n}, ${first.topic.replace(/[_:]/g, " ")}, page ${page}`);
    tag.dataset.stitch = first.id; tag.setAttribute("aria-pressed", "false");
    tag.onclick = () => onSelect(first);
    box.appendChild(tag);
    return box;
  }
  tag.textContent = `${first.doc} ${circled(lo)}–${circled(hi)}`;
  tag.setAttribute("aria-label", `Stitches ${lo} to ${hi}, ${group.length} clauses, page ${page}`);
  const list = document.createElement("ul"); list.className = "pdf-stitch-list";
  const open = group.some((g) => g.s.id === selectedId);
  list.hidden = !open; tag.setAttribute("aria-expanded", String(open)); tag.dataset.group = group.map((g) => g.s.id).join(" ");
  for (const g of group) {
    const li = document.createElement("li");
    const b = document.createElement("button"); b.type = "button"; b.className = "unstyled pdf-stitch-item";
    b.textContent = `${circled(g.s.n)} ${g.s.topic.replace(/[_:]/g, " ")}`;
    b.dataset.stitch = g.s.id; b.setAttribute("aria-pressed", "false");
    b.onclick = () => onSelect(g.s);
    li.appendChild(b); list.appendChild(li);
  }
  tag.onclick = () => { list.hidden = !list.hidden; tag.setAttribute("aria-expanded", String(!list.hidden)); };
  list.onkeydown = (e) => { if (e.key === "Escape") { list.hidden = true; tag.setAttribute("aria-expanded", "false"); tag.focus(); } };
  box.appendChild(tag); box.appendChild(list);
  return box;
}

const token = (name: string, fallback: string) => (typeof document === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

/**
 * The Page: real document pages; everything dimmed except stitched sentences, which stay at full opacity under a highlighter wash, with
 * one margin pin per line (close lines share a grouped pin).
 * The canvases are rendered ONCE per `url` (web-correctness-16); the dim + highlight + chips are an overlay pass that repaints from the
 * untouched copy of each page when the stitch set, the selection or `dim` changes, so typing in the clause filter or pressing a stitch no
 * longer re-downloads and re-renders the document. Selecting a stitch only restyles the outline box and chip that already exist, so the
 * pressed chip keeps keyboard focus (a11y-9). Each page is a labelled group whose canvas carries a text alternative (a11y-8). A superseded run never appends pages (cancel checked after every await), its render
 * task is cancelled and the pdf.js document is destroyed on cleanup.
 */
export function PageView({ url, stitches, selected, onSelect, dim = true, title }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const pages = useRef<RenderedPage[]>([]);
  const overlayGen = useRef(0);
  const [status, setStatus] = useState("loading");
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // the overlay reads the latest props without re-running the render effect
  const latest = useRef({ stitches, selected, onSelect, dim, title });
  latest.current = { stitches, selected, onSelect, dim, title };
  const key = stitchKey(stitches);

  /** Repaint one page's overlay from its untouched copy. Async only while locating quotes; the drawing itself is synchronous. */
  async function paint(rp: RenderedPage, gen: number) {
    const { stitches: all, dim: dimOn } = latest.current;
    const pageStitches = dimOn ? all.filter((s) => s.page === rp.p) : [];
    const located = await Promise.all(pageStitches.map((s) => {
      let r = rp.rects.get(s.quote);
      if (!r) { r = locate(rp.page, rp.vp, s.quote).catch(() => []); rp.rects.set(s.quote, r); }
      return r;
    }));
    if (gen !== overlayGen.current) return;                     // a newer overlay pass owns the canvas now
    const ctx = rp.canvas.getContext("2d")!;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(rp.base, 0, 0); ctx.restore();
    rp.wrap.querySelectorAll(".pdf-pin, .pdf-outline").forEach((n) => n.remove());
    if (!pageStitches.length) return;
    const dpr = rp.canvas.width / rp.vp.width;
    // dim everything, then re-draw the quoted lines at full opacity with a highlighter wash and a thin margin rule (layout-25)
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.33; ctx.fillStyle = token("--paper", "#f6f0e3"); ctx.fillRect(0, 0, rp.canvas.width, rp.canvas.height); ctx.restore();
    const highlight = token("--gold-soft", "#e7cf8f"), rule = token("--gold", "#c59a3c");
    const pins: { s: Stitch; top: number; x: number }[] = [];
    const margin: Stitch[] = [];
    pageStitches.forEach((s, i) => {
      const rects = located[i];
      if (!rects.length) { margin.push(s); return; }
      const minX = Math.min(...rects.map((r) => r[0])), minY = Math.min(...rects.map((r) => r[1]));
      const maxX = Math.max(...rects.map((r) => r[0] + r[2])), maxY = Math.max(...rects.map((r) => r[1] + r[3]));
      const pad = 2, bx = minX - pad, by = minY - pad, bw = maxX - minX + 2 * pad, bh = maxY - minY + 2 * pad;
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(rp.base, bx * dpr, by * dpr, bw * dpr, bh * dpr, bx, by, bw, bh);
      ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.55; ctx.fillStyle = highlight; ctx.fillRect(bx, by, bw, bh);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.fillStyle = rule; ctx.fillRect(Math.max(0, bx - 5), by, 2, bh);
      ctx.restore();
      // the selection ring is a positioned box, not canvas ink, so selecting restyles it without repainting the page (a11y-9)
      const box = document.createElement("span"); box.className = "pdf-outline"; box.dataset.stitch = s.id; box.setAttribute("aria-hidden", "true");
      Object.assign(box.style, { left: `${bx}px`, top: `${by}px`, width: `${bw}px`, height: `${bh}px` });
      rp.wrap.appendChild(box);
      pins.push({ s, top: minY, x: minX });
    });
    const sel = latest.current.selected?.id, pick = (st: Stitch) => latest.current.onSelect(st);
    // one pin per line in the left margin; lines closer than PIN_GAP share one grouped pin (layout-4)
    for (const g of clusterPins(pins.map((q) => q.top), PIN_GAP)) rp.wrap.appendChild(makePin(g.map((i) => pins[i]), rp.p, rp.vp.width, sel, pick));
    if (margin.length) {   // fallback: quotes not found in the text layer share one margin pin at the top right
      const box = makePin(margin.map((s) => ({ s, top: 8, x: 0 })), rp.p, rp.vp.width, sel, pick);
      box.classList.add("pdf-stitch-margin"); box.style.left = ""; box.style.right = "8px";
      rp.wrap.appendChild(box);
    }
    markSelected(rp.wrap, latest.current.selected?.id);
  }

  // render the pages once per document
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    const el = host.current;
    if (!el) return;
    el.innerHTML = ""; pages.current = []; setStatus("loading");
    const loading = pdfjs.getDocument(url);
    (async () => {
      const doc = await loading.promise;
      if (cancelled) return;
      const width = Math.min(el.clientWidth || 600, 900);
      const done = await renderSequential<RenderedPage>(doc.numPages, async (p) => {
        const page = await doc.getPage(p);
        const scale = width / page.getViewport({ scale: 1 }).width;
        const vp = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        const wrap = document.createElement("div"); wrap.className = "pdf-page"; wrap.dataset.page = String(p);
        wrap.setAttribute("role", "group"); wrap.setAttribute("aria-label", PLAN.docsPageGroup(p, doc.numPages));
        wrap.style.width = `${vp.width}px`; wrap.style.height = `${vp.height}px`;
        const canvas = document.createElement("canvas"); canvas.width = vp.width * dpr; canvas.height = vp.height * dpr;
        canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
        canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", PLAN.docsPageAlt(p, doc.numPages, latest.current.title ?? ""));
        const ctx = canvas.getContext("2d")!; ctx.scale(dpr, dpr);
        const rt = page.render({ canvasContext: ctx, viewport: vp }); task = rt;
        await rt.promise; task = null;
        const base = document.createElement("canvas"); base.width = canvas.width; base.height = canvas.height; base.getContext("2d")!.drawImage(canvas, 0, 0);
        wrap.appendChild(canvas);
        return { p, page, vp, wrap, canvas, base, rects: new Map() };
      }, (_p, rp) => {
        el.appendChild(rp.wrap); pages.current.push(rp);
        void paint(rp, overlayGen.current);
      }, () => cancelled);
      if (done) setStatus("ready");
    })().catch((e) => { if (!cancelled && e?.name !== "RenderingCancelledException") setStatus(`error: ${e.message}`); });
    return () => {
      cancelled = true;
      task?.cancel();
      void loading.destroy();      // also destroys the document and frees the worker's copy
    };
  }, [url]);

  // the overlay: repaint every rendered page when the stitch set or the dim switch changes
  useEffect(() => {
    const gen = ++overlayGen.current;
    pages.current.forEach((rp) => { void paint(rp, gen); });
  }, [key, dim]);

  // selection: restyle the existing outline + chip only (no repaint, focus stays on the pressed chip; a11y-9)
  useEffect(() => { if (host.current) markSelected(host.current, selected?.id); }, [selected?.id]);

  // scroll to the selected stitch's page once it exists
  useEffect(() => {
    if (!selected || !host.current) return;
    const target = host.current.querySelector<HTMLElement>(`.pdf-page[data-page="${selected.page}"]`);
    target?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [selected?.id, status === "ready"]);

  return (
    <section className="page" aria-label={PLAN.docsPlanDocument}>
      <div ref={host} className="pdf-host" />
      <p className="sr-only" aria-live="polite">{status === "ready" ? PLAN.docsRendered : status}</p>
    </section>
  );
}

function markSelected(root: HTMLElement, id: string | undefined) {
  root.querySelectorAll<HTMLElement>("[data-stitch]").forEach((n) => {
    const on = !!id && n.dataset.stitch === id;
    n.classList.toggle("is-selected", on);
    if (n.tagName === "BUTTON") n.setAttribute("aria-pressed", String(on));
  });
  // a grouped pin opens its list when it holds the selected stitch (it never closes one the reader opened)
  root.querySelectorAll<HTMLElement>("[data-group]").forEach((tag) => {
    if (!id || !(tag.dataset.group ?? "").split(" ").includes(id)) return;
    const list = tag.nextElementSibling as HTMLElement | null;
    if (list) { list.hidden = false; tag.setAttribute("aria-expanded", "true"); }
  });
}
