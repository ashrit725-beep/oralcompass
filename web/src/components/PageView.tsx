import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { Stitch } from "../lib/types";
import { circled } from "../lib/stitches";

// Vite-friendly worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Props { url: string; stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; dim?: boolean }

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

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
          for (const s of pageStitches) {
            const rects = await locate(page, vp, s.quote);
            const tag = document.createElement("button"); tag.type = "button"; tag.className = "pdf-stitch"; tag.textContent = `${s.doc} ${circled(s.n)}`;
            tag.setAttribute("aria-label", `Stitch ${s.n}, ${s.topic.replace(/[_:]/g, " ")}, page ${p}`);
            tag.onclick = () => onSelect(s);
            if (rects.length) {
              const minX = Math.min(...rects.map(r => r[0])), minY = Math.min(...rects.map(r => r[1]));
              const maxX = Math.max(...rects.map(r => r[0] + r[2])), maxY = Math.max(...rects.map(r => r[1] + r[3]));
              const pad = 2;
              ctx.save(); ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
              ctx.drawImage(full, (minX - pad) * devicePixelRatio, (minY - pad) * devicePixelRatio, (maxX - minX + 2 * pad) * devicePixelRatio, (maxY - minY + 2 * pad) * devicePixelRatio,
                minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad);
              ctx.strokeStyle = selected?.id === s.id ? "#b45309" : "#1f2a37"; ctx.lineWidth = selected?.id === s.id ? 3 : 1.5;
              ctx.strokeRect(minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad); ctx.restore();
              tag.style.top = `${Math.max(0, minY - 22)}px`; tag.style.left = `${Math.max(0, minX)}px`;
            } else {
              tag.classList.add("pdf-stitch-margin"); tag.style.top = "8px"; tag.style.right = "8px";   // fallback: margin stitch
            }
            wrap.appendChild(tag);
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
