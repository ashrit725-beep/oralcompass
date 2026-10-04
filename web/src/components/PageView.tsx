import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { Stitch } from "../lib/types";
import { circled } from "../lib/stitches";
import { clusterPins, quoteItemRange } from "../lib/pageview";

// Vite-friendly worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Props { url: string; stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; dim?: boolean }

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

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
    tag.onclick = () => onSelect(first);
    box.appendChild(tag);
    return box;
  }
  tag.textContent = `${first.doc} ${circled(lo)}–${circled(hi)}`;
  tag.setAttribute("aria-label", `Stitches ${lo} to ${hi}, ${group.length} clauses, page ${page}`);
  const list = document.createElement("ul"); list.className = "pdf-stitch-list";
  const open = group.some((g) => g.s.id === selectedId);
  list.hidden = !open; tag.setAttribute("aria-expanded", String(open));
  for (const g of group) {
    const li = document.createElement("li");
    const b = document.createElement("button"); b.type = "button"; b.className = "unstyled pdf-stitch-item";
    b.textContent = `${circled(g.s.n)} ${g.s.topic.replace(/[_:]/g, " ")}`;
    if (g.s.id === selectedId) b.setAttribute("aria-current", "true");
    b.onclick = () => onSelect(g.s);
    li.appendChild(b); list.appendChild(li);
  }
  tag.onclick = () => { list.hidden = !list.hidden; tag.setAttribute("aria-expanded", String(!list.hidden)); };
  list.onkeydown = (e) => { if (e.key === "Escape") { list.hidden = true; tag.setAttribute("aria-expanded", "false"); tag.focus(); } };
  box.appendChild(tag); box.appendChild(list);
  return box;
}

/** The Page: real document pages; everything dimmed except stitched sentences, which stay at full opacity and wear chips. */
export function PageView({ url, stitches, selected, onSelect, dim = true }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("loading");
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const el = host.current; if (!el) return;
      el.innerHTML = "";
      const doc = await pdfjs.getDocument(url).promise;
      const width = Math.min(el.clientWidth || 600, 900);
      for (let p = 1; p <= doc.numPages; p++) {
        if (cancelled) return;
        const page = await doc.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const scale = width / base.width;
        const vp = page.getViewport({ scale });
        const wrap = document.createElement("div"); wrap.className = "pdf-page"; wrap.dataset.page = String(p);
        wrap.style.width = `${vp.width}px`; wrap.style.height = `${vp.height}px`;
        const canvas = document.createElement("canvas"); canvas.width = vp.width * devicePixelRatio; canvas.height = vp.height * devicePixelRatio;
        canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
        const ctx = canvas.getContext("2d")!; ctx.scale(devicePixelRatio, devicePixelRatio);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        wrap.appendChild(canvas);
        const pageStitches = stitches.filter((s) => s.page === p);
        if (dim && pageStitches.length) {
          // dim everything, then re-draw highlighted regions at full opacity (+ outline)
          const full = document.createElement("canvas"); full.width = canvas.width; full.height = canvas.height; full.getContext("2d")!.drawImage(canvas, 0, 0);
          ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.33; ctx.fillStyle = "#faf8f3"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore();
          // token colours for the canvas (no hex in the design system; the fallbacks are the :root values)
          const css = getComputedStyle(document.documentElement);
          const tok = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
          const highlight = tok("--gold-soft", "#e7cf8f"), rule = tok("--gold", "#c59a3c"), ring = tok("--terracotta", "#b86a4b");
          const pins: { s: Stitch; top: number; x: number }[] = [];
          const margin: Stitch[] = [];
          for (const s of pageStitches) {
            const rects = await locate(page, vp, s.quote);
            if (!rects.length) { margin.push(s); continue; }
            const minX = Math.min(...rects.map(r => r[0])), minY = Math.min(...rects.map(r => r[1]));
            const maxX = Math.max(...rects.map(r => r[0] + r[2])), maxY = Math.max(...rects.map(r => r[1] + r[3]));
            const pad = 2, bx = minX - pad, by = minY - pad, bw = maxX - minX + 2 * pad, bh = maxY - minY + 2 * pad;
            ctx.save(); ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
            ctx.drawImage(full, bx * devicePixelRatio, by * devicePixelRatio, bw * devicePixelRatio, bh * devicePixelRatio, bx, by, bw, bh);
            // a translucent highlighter wash behind the quote plus a thin rule in the margin; the outline marks only the selected stitch (layout-25)
            ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.55; ctx.fillStyle = highlight; ctx.fillRect(bx, by, bw, bh);
            ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.fillStyle = rule; ctx.fillRect(Math.max(0, bx - 5), by, 2, bh);
            if (selected?.id === s.id) { ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh); }
            ctx.restore();
            pins.push({ s, top: minY, x: minX });
          }
          for (const g of clusterPins(pins.map((q) => q.top), PIN_GAP)) wrap.appendChild(makePin(g.map((i) => pins[i]), p, vp.width, selected?.id, onSelect));
          if (margin.length) {   // fallback: quotes not found in the text layer share one margin pin at the top right
            const box = makePin(margin.map((s) => ({ s, top: 8, x: 0 })), p, vp.width, selected?.id, onSelect);
            box.classList.add("pdf-stitch-margin"); box.style.left = ""; box.style.right = "8px";
            wrap.appendChild(box);
          }
        }
        el.appendChild(wrap);
      }
      if (!cancelled) setStatus("ready");
    })().catch((e) => setStatus(`error: ${e.message}`));
    return () => { cancelled = true; };
  }, [url, stitches, selected?.id, dim]);

  useEffect(() => {
    if (!selected || !host.current) return;
    const target = host.current.querySelector<HTMLElement>(`.pdf-page[data-page="${selected.page}"]`);
    target?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [selected?.id]);

  return (
    <section className="page" aria-label="Plan document">
      <div ref={host} className="pdf-host" />
      <p className="sr-only" aria-live="polite">{status === "ready" ? "Document rendered." : status}</p>
    </section>
  );
}
