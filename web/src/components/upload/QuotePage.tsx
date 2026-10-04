import { useEffect, useRef, useState } from "react";
import { StageLoader } from "@/components/StageLoader";
import { UPLOAD } from "@/lib/copy/upload";
import { DEV_USER_HEADER } from "@/lib/upload";

/**
 * QuotePage (spec §7.3 step 4 "Open page"): renders ONE page of the uploaded PDF with the quote's text-layer rectangle outlined when the
 * quote verified on that page. The bytes come from the owner-scoped `GET /me/documents/{id}/file` (private, no-store) into a blob URL that
 * is revoked on unmount; pdf.js is imported lazily (its own chunk). Static canvas: no animation. The status line is the pane's live region.
 */
export interface QuotePageProps {
  docId: string;
  page: number;
  quote: string | null;
  verified: boolean;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function QuotePage({ docId, page, quote, verified }: QuotePageProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;
    (async () => {
      try {
        const r = await fetch(`/api/me/documents/${docId}/file`, { headers: { ...DEV_USER_HEADER } });
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        blobUrl = URL.createObjectURL(blob);
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument(blobUrl).promise;
        const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
        const el = host.current;
        if (!el || cancelled) return;
        const width = Math.min(el.clientWidth || 480, 720);
        const base = p.getViewport({ scale: 1 });
        const vp = p.getViewport({ scale: width / base.width });
        const canvas = document.createElement("canvas");
        const dpr = window.devicePixelRatio || 1;
        canvas.width = vp.width * dpr; canvas.height = vp.height * dpr;
        canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(dpr, dpr);
        await p.render({ canvasContext: ctx, viewport: vp }).promise;
        if (verified && quote) {
          const content = await p.getTextContent();
          const items = content.items.filter((it): it is typeof it & { str: string; transform: number[]; width: number; height: number } => "str" in it);
          const joined = items.map((it) => it.str).join(" ");
          const idx = norm(joined).indexOf(norm(quote));
          if (idx >= 0) {
            const end = idx + norm(quote).length;
            let pos = 0;
            const rects: number[][] = [];
            for (const it of items) {
              const s = norm(it.str);
              const a = pos, b = pos + s.length;
              if (b > idx && a < end && s) {
                const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
                const h = Math.max(8, it.height * vp.scale);
                rects.push([x, y - h, it.width * vp.scale, h]);
              }
              pos = b + 1;
            }
            if (rects.length) {
              const minX = Math.min(...rects.map((r) => r[0])), minY = Math.min(...rects.map((r) => r[1]));
              const maxX = Math.max(...rects.map((r) => r[0] + r[2])), maxY = Math.max(...rects.map((r) => r[1] + r[3]));
              ctx.save();
              ctx.strokeStyle = getComputedStyle(el).getPropertyValue("--terracotta").trim() || "currentColor";
              ctx.lineWidth = 2;
              ctx.strokeRect(minX - 3, minY - 3, maxX - minX + 6, maxY - minY + 6);
              ctx.restore();
            }
          }
        }
        el.innerHTML = "";
        el.appendChild(canvas);
        setState("ready");
        await doc.destroy().catch(() => undefined);
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [docId, page, quote, verified]);

  return (
    <figure className="up-page" aria-label={UPLOAD.pageTitle(page)}>
      {state === "loading" && <StageLoader label={UPLOAD.pageLoading} size="sm" />}
      {state === "error" && <p role="alert" className="up-error">{UPLOAD.unreadable}</p>}
      <div ref={host} className="up-page-canvas" />
      {quote && <figcaption className="up-caption">{verified ? UPLOAD.quoteVerified : UPLOAD.quoteNearby}: <q>{quote}</q></figcaption>}
    </figure>
  );
}

export default QuotePage;
