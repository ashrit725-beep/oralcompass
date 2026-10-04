import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { hasDrawn, markDrawn } from "@/lib/drawRegistry";
import { useReducedMotion } from "@/lib/motion";

/** Layout effects measure the page; on the server (static render in tests) they become plain effects. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * CinematicStage (owner direction "Don't make the map in a contained in a box; remember the app has to be cinematic", mobile-only app):
 * the full-bleed painted stage that both maps stand on. No border, radius or card: the painting runs edge to edge across the app column,
 * starts right under the shell's header and dissolves into the parchment at its bottom edge (a tall gradient fade, never a hard line).
 *
 * Layers, bottom → top, inside the camera: the painted plate (portrait tiles of `/art/{art}-passage.webp`, every other tile mirrored so
 * the seams continue the painting), the vignette, the title card (serif display title + the two strongest facts on a parchment-to-clear
 * scrim, AA contrast over the darkest water), the map layer (`children`). The bottom fade sits outside the camera so it never moves.
 *
 * Camera, transform and opacity only (no blur, bounce, glow or sparkle); reduced motion renders every end state at once:
 * - establishing shot: on the first view per session (lib/drawRegistry key `stage:{art}`) the plate settles from scale 1.06 to 1 over
 *   1.6 s, cubic-bezier(.16,1,.3,1), while the map draws its route;
 * - idle Ken Burns: the plate alone drifts 1 → 1.02 over 40 s, alternate; paused while the document is hidden;
 * - dolly: any descendant of the map layer carrying `data-stage-focus="true"` (STAGE_FOCUS_ATTR) is a selection; the camera moves
 *   (700 ms, cubic-bezier(.76,0,.24,1)) so it sits in the visible strip above the bottom sheet, and returns when the attribute goes.
 *   The selection is measured with offsets (immune to the camera's own transform) and the sheet's resting top edge.
 * Scroll parallax is not built: a second scroll-driven layer over a tall composited plate does not hold 60 fps on a throttled phone.
 */
export const STAGE_FOCUS_ATTR = "data-stage-focus";

export interface CinematicStageProps {
  art: "journey" | "plan";
  title: ReactNode;
  facts: ReactNode;
  /** The map layer (HTML controls over painted SVG), drawn over the plate. */
  children: ReactNode;
  /** Minimum stage height (CSS length); the stage otherwise grows with its map layer. */
  height?: string;
}

/** The portrait plates are 1080 × 1920 (art/LICENSE.md). */
const PLATE_RATIO = 1920 / 1080;
const MAX_TILES = 12;

interface Camera { ty: number; ox: number; oy: number; s: number }

/** Offset of `el` inside `root` from the offsetParent chain (CSS transforms do not change offsets). Null when the chain misses `root`. */
function offsetWithin(el: HTMLElement, root: HTMLElement): { x: number; y: number } | null {
  let x = 0, y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft; y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent) return null;
    if (parent !== root && !root.contains(parent)) return null;
    node = parent;
  }
  return node === root ? { x, y } : null;
}

/** Resting top edge of the open bottom sheet (vaul content is fixed to the bottom; its height is unaffected by the slide transform). */
function sheetTop(): number | null {
  const sheet = document.querySelector<HTMLElement>('[data-vaul-drawer][data-vaul-drawer-direction="bottom"], [role="dialog"][aria-modal="true"]');
  if (!sheet || !sheet.offsetHeight) return null;
  return window.innerHeight - sheet.offsetHeight;
}

/** Top of the strip the camera may use: under a fixed or sticky app header when the shell pins one, else just under the status bar. */
function visibleTop(): number {
  let top = 8;
  document.querySelectorAll<HTMLElement>(".appbar, [data-app-header]").forEach((h) => {
    const pos = getComputedStyle(h).position;
    if (pos !== "fixed" && pos !== "sticky") return;
    const r = h.getBoundingClientRect();
    if (r.top <= 1 && r.bottom > 0) top = Math.max(top, r.bottom + 8);
  });
  return top;
}

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.visibilityState === "hidden");
  useEffect(() => {
    const on = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return hidden;
}

export function CinematicStage({ art, title, facts, children, height }: CinematicStageProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const sessionKey = `stage:${art}`;
  const [establish] = useState(() => !hasDrawn(sessionKey));
  useEffect(() => { markDrawn(sessionKey); }, [sessionKey]);
  const hidden = useDocumentHidden();
  const stageRef = useRef<HTMLElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [tiles, setTiles] = useState(3);
  const [cam, setCam] = useState<Camera | null>(null);
  const lastOrigin = useRef<{ ox: number; oy: number }>({ ox: 0, oy: 0 });

  // enough plate tiles to cover the stage at its current width (each tile is width × 16/9 tall)
  useIsoLayoutEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const w = el.clientWidth, h = el.scrollHeight;
      if (!w || !h) return;
      setTiles(Math.min(MAX_TILES, Math.max(1, Math.ceil(h / (w * PLATE_RATIO)) + 1)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the dolly: follow the descendant that carries data-stage-focus="true"
  useEffect(() => {
    const map = mapRef.current, camera = cameraRef.current, stage = stageRef.current;
    if (!map || !camera || !stage || typeof MutationObserver === "undefined") return;
    let frame = 0, tries = 0;
    const settle = () => {
      const el = map.querySelector<HTMLElement>(`[${STAGE_FOCUS_ATTR}="true"]`);
      if (!el) { setCam(null); return; }
      const off = offsetWithin(el, camera);
      if (!off) { setCam(null); return; }
      // the sheet mounts with the selection; give it a few frames to exist before falling back to "the lower 55 % is covered"
      const top = sheetTop();
      if (top == null && tries++ < 12) { frame = requestAnimationFrame(settle); return; }
      const bottom = top ?? window.innerHeight * 0.45;
      const upper = Math.min(visibleTop(), bottom);
      const strip = bottom - upper;
      const cx = off.x + el.offsetWidth / 2, cy = off.y + el.offsetHeight / 2;
      const restY = stage.getBoundingClientRect().top + cy;
      const target = upper + strip / 2;
      lastOrigin.current = { ox: cx, oy: cy };
      // a gentle push-in only when the whole selection fits the strip; otherwise its centre lands mid-strip at scale 1
      setCam({ ty: Math.round(target - restY), ox: cx, oy: cy, s: strip >= el.offsetHeight * 1.1 ? 1.04 : 1 });
    };
    const schedule = () => { cancelAnimationFrame(frame); tries = 0; frame = requestAnimationFrame(settle); };
    const mo = new MutationObserver(schedule);
    mo.observe(map, { subtree: true, childList: true, attributes: true, attributeFilter: [STAGE_FOCUS_ATTR] });
    return () => { mo.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  const origin = cam ?? lastOrigin.current;
  const cameraStyle: CSSProperties = {
    transformOrigin: `${origin.ox}px ${origin.oy}px`,
    transform: cam ? `translate3d(0, ${cam.ty}px, 0) scale(${cam.s})` : "none",
    transition: reduce ? "none" : undefined,
  };
  const src = `/art/${art}-passage.webp`;

  return (
    <section ref={stageRef} className={`cin-stage cin-${art}`} aria-labelledby={titleId} data-hidden={hidden ? "" : undefined} data-dolly={cam ? "" : undefined}
             style={height ? { minHeight: height } : undefined}>
      <div ref={cameraRef} className="cin-camera" style={cameraStyle}>
        <div className="cin-plate" aria-hidden="true">
          <div className={`cin-settle ${establish && !reduce ? "is-establishing" : ""}`}>
          <div className={`cin-drift ${reduce ? "" : "motion-drift"}`}>
            {Array.from({ length: tiles }, (_, i) => (
              <img key={i} src={src} alt="" width={1080} height={1920} decoding="async" draggable={false}
                   loading={i < 2 ? "eager" : "lazy"} className={i % 2 ? "cin-tile is-mirror" : "cin-tile"} />
            ))}
          </div>
          </div>
          <div className="cin-vignette" />
        </div>
        <header className="cin-title">
          <h2 id={titleId} tabIndex={-1} className="cin-title-h">{title}</h2>
          <div className="cin-facts">{facts}</div>
        </header>
        <div ref={mapRef} className="cin-map">{children}</div>
      </div>
      <div className="cin-fade" aria-hidden="true" />
    </section>
  );
}

export default CinematicStage;
