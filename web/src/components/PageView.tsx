import { useEffect, useRef, useState } from "react";
import { PLAN } from "../lib/copy/plan";
import * as pdfjs from "pdfjs-dist";
import type { Stitch } from "../lib/types";
import { circled } from "../lib/stitches";
import { renderSequential, stitchKey } from "../lib/pdfRender";

// Vite-friendly worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Props { url: string; stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; dim?: boolean; /** The document's title, for each page's text alternative. */ title?: string }

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** One rendered page: the pdf.js page, its viewport, the visible canvas and an untouched copy of the render (the overlay restores from it). */
interface RenderedPage { p: number; page: pdfjs.PDFPageProxy; vp: pdfjs.PageViewport; wrap: HTMLDivElement; canvas: HTMLCanvasElement; base: HTMLCanvasElement; rects: Map<string, Promise<number[][]>> }

/** Find viewport rectangles for a quote on a page by matching the text layer. Returns [] when not found (margin-stitch fallback). */
async function locate(page: pdfjs.PDFPageProxy, viewport: pdfjs.PageViewport, quote: string): Promise<number[][]> {
  const tc = await page.getTextContent();
  const items = tc.items.filter((it: any) => "str" in it) as any[];
  let joined = ""; const spans: [number, number][] = [];
  for (const it of items) { const start = joined.length; joined += it.str + " "; spans.push([start, joined.length]); }
  const idx = norm(joined).indexOf(norm(quote));
  if (idx < 0) return [];
  // map normalized index back approximately: normalization only collapses whitespace, so positions shift little; use a tolerant window
  const end = idx + norm(quote).length;
  const rects: number[][] = [];
  items.forEach((it, i) => {
    const [a, b] = spans[i];
    if (b < idx || a > end) return;
    const [sx, , , sy, x, y] = it.transform;
    const h = Math.hypot(sy, it.transform[2]) || sy;
    const r = viewport.convertToViewportRectangle([x, y, x + it.width * (sx / Math.abs(sx || 1)), y + h]);
    rects.push([Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.abs(r[2] - r[0]), Math.abs(r[3] - r[1])]);
  });
  return rects;
}

/**
 * Stitch chips whose quotes sit on the same line used to land on top of each other (one chip hid the next, and their hit areas
 * overlapped). After a chip is placed, nudge it right of any chip it collides with, wrapping to the next row at the page edge.
 */
function place(tag: HTMLElement, placed: Box[], pageWidth: number) {
  const w = tag.offsetWidth, h = tag.offsetHeight;
  if (!w || !h) { placed.push(boxOf(tag)); return; }
  let x = tag.offsetLeft, y = tag.offsetTop;
  for (let i = 0; i < 24; i++) {
    const hit = placed.find((b) => x < b.x + b.w + CHIP_GAP && x + w + CHIP_GAP > b.x && y < b.y + b.h + CHIP_GAP && y + h + CHIP_GAP > b.y);
    if (!hit) break;
    x = hit.x + hit.w + CHIP_GAP;
    if (x + w > pageWidth) { x = Math.max(0, tag.offsetLeft); y = hit.y + hit.h + CHIP_GAP; }
  }
  tag.style.left = `${x}px`; tag.style.top = `${y}px`; tag.style.right = "auto";
  placed.push({ x, y, w, h });
}
type Box = { x: number; y: number; w: number; h: number };
const CHIP_GAP = 6;
const boxOf = (el: HTMLElement): Box => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });

const token = (name: string, fallback: string) => (typeof document === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

/**
 * The Page: real document pages; everything dimmed except stitched sentences, which stay at full opacity and wear chips.
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
    rp.wrap.querySelectorAll(".pdf-stitch, .pdf-outline").forEach((n) => n.remove());
    if (!pageStitches.length) return;
    const dpr = rp.canvas.width / rp.vp.width;
    const placed: Box[] = [];
    // dim everything, then re-draw highlighted regions at full opacity (+ outline)
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.33; ctx.fillStyle = token("--paper", "#f6f0e3"); ctx.fillRect(0, 0, rp.canvas.width, rp.canvas.height); ctx.restore();
    pageStitches.forEach((s, i) => {
      const rects = located[i];
      const tag = document.createElement("button"); tag.type = "button"; tag.className = "pdf-stitch"; tag.textContent = `${s.doc} ${circled(s.n)}`;
      tag.setAttribute("aria-label", `Stitch ${s.n}, ${s.topic.replace(/[_:]/g, " ")}, page ${rp.p}`);
      tag.dataset.stitch = s.id; tag.setAttribute("aria-pressed", "false");
      tag.onclick = () => latest.current.onSelect(s);
      if (rects.length) {
        const minX = Math.min(...rects.map((r) => r[0])), minY = Math.min(...rects.map((r) => r[1]));
        const maxX = Math.max(...rects.map((r) => r[0] + r[2])), maxY = Math.max(...rects.map((r) => r[1] + r[3]));
        const pad = 2;
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.drawImage(rp.base, (minX - pad) * dpr, (minY - pad) * dpr, (maxX - minX + 2 * pad) * dpr, (maxY - minY + 2 * pad) * dpr,
          minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad);
        ctx.restore();
        // the outline is a positioned box, not canvas ink, so selection restyles it without repainting the page (a11y-9)
        const box = document.createElement("span"); box.className = "pdf-outline"; box.dataset.stitch = s.id; box.setAttribute("aria-hidden", "true");
        Object.assign(box.style, { left: `${minX - pad}px`, top: `${minY - pad}px`, width: `${maxX - minX + 2 * pad}px`, height: `${maxY - minY + 2 * pad}px` });
        rp.wrap.appendChild(box);
        tag.style.top = `${Math.max(0, minY - 22)}px`; tag.style.left = `${Math.max(0, minX)}px`;
      } else {
        tag.classList.add("pdf-stitch-margin"); tag.style.top = "8px"; tag.style.right = "8px";   // fallback: margin stitch
      }
      rp.wrap.appendChild(tag);
      place(tag, placed, rp.vp.width);
    });
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
}
