import { useEffect, useRef, useState } from "react";
import { PLAN } from "../lib/copy/plan";
import * as pdfjs from "pdfjs-dist";
import type { Stitch } from "../lib/types";
import { circled } from "../lib/stitches";

// Vite-friendly worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface Props { url: string; stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; dim?: boolean; /** The document's title, for each page's text alternative. */ title?: string }

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

/**
 * The Page: real document pages; everything dimmed except stitched sentences, which stay at full opacity and wear chips.
 * Pages are drawn once per document and stitch set (keyed by content, not array identity): selecting a stitch only toggles classes on
 * the outline and chip that already exist, so the pressed chip keeps keyboard focus and the scroll position holds (a11y-9). Each page
 * is a labelled group whose canvas carries a text alternative pointing to the clause list (a11y-8).
 */
export function PageView({ url, stitches, selected, onSelect, dim = true, title }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("loading");
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;
  const stitchesRef = useRef(stitches); stitchesRef.current = stitches;
  const selectedIdRef = useRef(selected?.id); selectedIdRef.current = selected?.id;
  const stitchKey = stitches.map((s) => `${s.id}@${s.page}:${s.quote}`).join("|");

  useEffect(() => {
    let cancelled = false;
    const stitches = stitchesRef.current;
    (async () => {
      const el = host.current; if (!el) return;
      el.innerHTML = "";
      setStatus("loading");
      const doc = await pdfjs.getDocument(url).promise;
      const width = Math.min(el.clientWidth || 600, 900);
      for (let p = 1; p <= doc.numPages; p++) {
        if (cancelled) return;
        const page = await doc.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const scale = width / base.width;
        const vp = page.getViewport({ scale });
        const wrap = document.createElement("div"); wrap.className = "pdf-page"; wrap.dataset.page = String(p);
        wrap.setAttribute("role", "group"); wrap.setAttribute("aria-label", PLAN.docsPageGroup(p, doc.numPages));
        wrap.style.width = `${vp.width}px`; wrap.style.height = `${vp.height}px`;
        const canvas = document.createElement("canvas"); canvas.width = vp.width * devicePixelRatio; canvas.height = vp.height * devicePixelRatio;
        canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
        canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", PLAN.docsPageAlt(p, doc.numPages, title ?? ""));
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
            tag.dataset.stitch = s.id; tag.setAttribute("aria-pressed", "false");
            tag.onclick = () => onSelectRef.current(s);
            if (rects.length) {
              const minX = Math.min(...rects.map(r => r[0])), minY = Math.min(...rects.map(r => r[1]));
              const maxX = Math.max(...rects.map(r => r[0] + r[2])), maxY = Math.max(...rects.map(r => r[1] + r[3]));
              const pad = 2;
              ctx.save(); ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
              ctx.drawImage(full, (minX - pad) * devicePixelRatio, (minY - pad) * devicePixelRatio, (maxX - minX + 2 * pad) * devicePixelRatio, (maxY - minY + 2 * pad) * devicePixelRatio,
                minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad);
              ctx.restore();
              // the outline is a positioned box, not canvas ink, so selection restyles it without redrawing the page
              const box = document.createElement("span"); box.className = "pdf-outline"; box.dataset.stitch = s.id; box.setAttribute("aria-hidden", "true");
              Object.assign(box.style, { left: `${minX - pad}px`, top: `${minY - pad}px`, width: `${maxX - minX + 2 * pad}px`, height: `${maxY - minY + 2 * pad}px` });
              wrap.appendChild(box);
              tag.style.top = `${Math.max(0, minY - 22)}px`; tag.style.left = `${Math.max(0, minX)}px`;
            } else {
              tag.classList.add("pdf-stitch-margin"); tag.style.top = "8px"; tag.style.right = "8px";   // fallback: margin stitch
            }
            wrap.appendChild(tag);
          }
        }
        if (cancelled) return;
        el.appendChild(wrap);
        markSelected(el, selectedIdRef.current);
      }
      if (!cancelled) setStatus("ready");
    })().catch((e) => { if (!cancelled) setStatus(`error: ${e.message}`); });
    return () => { cancelled = true; };
  }, [url, stitchKey, dim, title]);

  // selection: restyle the existing outline + chip only (no redraw, focus stays on the pressed chip)
  useEffect(() => { if (host.current) markSelected(host.current, selected?.id); }, [selected?.id]);

  useEffect(() => {
    if (!selected || !host.current) return;
    const target = host.current.querySelector<HTMLElement>(`.pdf-page[data-page="${selected.page}"]`);
    target?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [selected?.id]);

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
