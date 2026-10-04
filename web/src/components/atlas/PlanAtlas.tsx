import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LANDMARKS, type LandmarkId } from "@/lib/copy";
import { hasDrawn, markDrawn } from "@/lib/drawRegistry";
import { useReducedMotion } from "@/lib/motion";
import type { RouteSegment } from "@/lib/passage";
import { RouteLine } from "./RouteLine";
import { StartHarbor } from "./StartHarbor";

/**
 * My plan, painted in the Passage concept (owner direction 05:58: "use the same map concept in the main page"; addendum §C). The five
 * landmarks are painted stops on the same inked, dashed RouteLine that runs down the coast of the CinematicStage plate:
 * harbor (Your plan) = the START pier with its boat · bridge (Deductible) = an island plate crossed by an inked bridge · cove (Coverage)
 * = the island plate mirrored and warmed · lookout (Annual maximum) = island-major · lighthouse (Cost breakdown) = island-lighthouse.
 * Stops alternate sides down the column; each label is a parchment lozenge in the Passage island-label style (familiar term prominent,
 * place name small italic, the value with its evidence). Each stop is ONE real <button> (the whole row: plate + label, ≥ 44 px) whose
 * accessible name carries the term, the place, the value and its evidence; the paint is aria-hidden.
 * Layout: measured from the column width (ResizeObserver), pixel coordinates, so plates keep their aspect at 320–480 px and the dashes
 * keep their size. Motion (transform/opacity only): the route draws once per session (lib/drawRegistry `plan-route`) while each stop
 * rises in as the pen reaches it; selecting a stop dollies the camera (translateY, 700 ms cubic-bezier(.76,0,.24,1)) so the stop sits in
 * the strip above the bottom sheet, and closing the sheet returns it. Reduced motion: drawn route, every stop present, the camera jumps.
 */
export interface PlanStop {
  /** The value shown on the label (a <Money> or words). */
  value?: ReactNode;
  /** The evidence shown under the value (an EvidenceBadge, a ribbon or the "calculated" note). */
  evidence?: ReactNode;
  /** Accessible summary appended to "{term} ({place})": value and evidence in words. */
  aria?: string;
  /** "unknown": the value is not stated or not provided (dashed label); "fog": waiting for information (fog over the plate). */
  state?: "unknown" | "fog";
}

export interface PlanAtlasProps {
  selected: LandmarkId | null;
  onSelect: (id: LandmarkId, el: HTMLElement | null) => void;
  stops: Partial<Record<LandmarkId, PlanStop>>;
  /** Accessible name of the map group. */
  label?: string;
}

type Side = "left" | "right";
export interface StopLayout { id: LandmarkId; side: Side; top: number; height: number; cx: number; cy: number; plate: { x: number; y: number; w: number; h: number }; label: { x: number; w: number } }
export interface PlanLayout { w: number; h: number; stops: StopLayout[]; route: RouteSegment[] }

const PLATE_ASPECT = 1106 / 1422;
const SIDES: Side[] = ["left", "right", "left", "right", "left"];
const PAD_TOP = 4;
const PAD_BOTTOM = 76;          // the stage's bottom fade sits here, under the last label

/** Pixel layout of the five stops for a column `w` px wide (pure; unit-tested). */
export function planLayout(width: number): PlanLayout {
  const w = Math.max(280, Math.min(560, Math.round(width)));
  const lw = Math.round(w * 0.5 - 22);
  let y = PAD_TOP;
  const stops: StopLayout[] = LANDMARKS.map((l, i) => {
    const side = SIDES[i];
    const harbor = l.id === "harbor";
    const pw = Math.round(w * (l.id === "lighthouse" ? 0.48 : harbor ? 0.44 : 0.42));
    const ph = harbor ? Math.round(w * 0.27) : Math.round(pw * PLATE_ASPECT);
    const height = ph + (harbor ? 20 : 26);
    const cx = Math.round(side === "left" ? w * 0.26 : w * 0.74);
    const top = y;
    const cy = Math.round(top + height / 2);
    y += height;
    return {
      id: l.id, side, top, height, cx, cy,
      plate: { x: Math.round(cx - pw / 2), y: Math.round(cy - ph / 2), w: pw, h: ph },
      label: { x: side === "left" ? Math.round(w * 0.5 + 6) : Math.round(w * 0.5 - 6 - lw), w: lw },
    };
  });
  const h = y + PAD_BOTTOM;
  const route: RouteSegment[] = stops.slice(1).map((s, i) => {
    const a = stops[i];
    const k = (s.cy - a.cy) * 0.55;
    return { from: a.id, to: s.id, closed: false, d: `M ${a.cx} ${a.cy} C ${a.cx} ${a.cy + k}, ${s.cx} ${s.cy - k}, ${s.cx} ${s.cy}` };
  });
  return { w, h, stops, route };
}

const PLATE_SRC: Record<LandmarkId, string> = {
  harbor: "", bridge: "/art/island-generic.webp", cove: "/art/island-generic.webp", lookout: "/art/island-major.webp", lighthouse: "/art/island-lighthouse.webp",
};
const ROUTE_KEY = "plan-route";
const SEG_START = 0.25, SEG_GAP = 0.34;   // seconds: segment i starts at SEG_START + i × SEG_GAP and draws for 0.7 s (RouteLine)
const arrival = (i: number) => (i === 0 ? 0.05 : SEG_START + (i - 1) * SEG_GAP + 0.55);

function Bridge() {
  // an inked timber bridge across the island's waist (decorative; inside the aria-hidden plate)
  return (
    <svg className="pa-bridge" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <path d="M 6 30 Q 50 2 94 30" fill="none" stroke="var(--paper)" strokeOpacity={0.7} strokeWidth={7} strokeLinecap="round" />
      <path d="M 6 30 Q 50 4 94 30" fill="none" stroke="var(--wood)" strokeWidth={4.2} strokeLinecap="round" />
      <path d="M 6 30 Q 50 4 94 30" fill="none" stroke="var(--ink)" strokeWidth={0.9} strokeLinecap="round" />
      <path d="M 8 24 Q 50 -3 92 24" fill="none" stroke="var(--ink)" strokeWidth={1.1} strokeLinecap="round" />
      {[18, 30, 42, 58, 70, 82].map((x) => {
        const t = (x - 6) / 88, yDeck = 30 - 4 * 26 * t * (1 - t) - 1, yRail = 24 - 4 * 27 * t * (1 - t) + 0.5;
        return <path key={x} d={`M ${x} ${yRail} L ${x} ${yDeck}`} stroke="var(--ink)" strokeWidth={1.1} strokeLinecap="round" />;
      })}
    </svg>
  );
}

export function PlanAtlas({ selected, onSelect, stops, label = "Plan map" }: PlanAtlasProps) {
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(390);
  const [instant] = useState(() => hasDrawn(ROUTE_KEY));
  const [camY, setCamY] = useState(0);
  const layout = planLayout(width);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => { const w = el.clientWidth; if (w > 0) setWidth(w); };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { markDrawn(ROUTE_KEY); }, []);

  // camera dolly: put the selected stop in the visible strip above the bottom sheet; closing returns the camera to rest
  useEffect(() => {
    const root = rootRef.current;
    const stage = root?.closest<HTMLElement>("[data-cinematic-stage]") ?? null;
    const apply = (dy: number) => {
      setCamY(dy);
      if (stage) { stage.style.setProperty("--camera-y", `${dy}px`); if (dy) stage.dataset.camera = "focus"; else delete stage.dataset.camera; }
    };
    if (!selected || !root) { apply(0); return; }
    const stop = layout.stops.find((s) => s.id === selected);
    if (!stop) return;
    let raf = 0, tries = 0;
    const measure = () => {
      const sheet = document.querySelector<HTMLElement>('[data-slot="drawer-content"]');
      if (!sheet && tries++ < 20) { raf = requestAnimationFrame(measure); return; }
      const vh = window.innerHeight;
      const sheetTop = sheet ? vh - sheet.offsetHeight : vh;             // offsetHeight ignores the sheet's own slide transform
      const top = root.getBoundingClientRect().top;                      // the map root itself never moves (the camera layer inside it does)
      const labelH = root.querySelector<HTMLElement>(`[data-stop="${stop.id}"] .pa-label`)?.offsetHeight ?? 80;
      const labelTop = top + stop.cy - labelH / 2;                       // the label is centred on its row
      const stripTop = 10, strip = sheetTop - stripTop;
      // the label is what must be read: centred in the strip above the sheet when it fits, else its top edge just under the strip's top
      const targetTop = strip >= labelH + 16 ? stripTop + (strip - labelH) / 2 : stripTop;
      const dy = Math.round(Math.max(-vh, Math.min(vh, targetTop - labelTop)));
      apply(Math.abs(dy) < 4 ? 0 : dy);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
    // the layout is derived from `width`; re-run when the selection or the column changes
  }, [selected, width]);   // eslint-disable-line react-hooks/exhaustive-deps

  const enter = !instant && !reduce;
  return (
    <div ref={rootRef} className={`pa ${selected ? "has-selection" : ""}`} role="group" aria-label={label} style={{ height: layout.h }}>
      <div className={`pa-camera ${reduce ? "is-instant" : ""}`} style={{ transform: camY ? `translate3d(0, ${camY}px, 0)` : undefined }}>
        <svg className="pa-route map-paint" width={layout.w} height={layout.h} viewBox={`0 0 ${layout.w} ${layout.h}`} aria-hidden="true" focusable="false">
          <RouteLine segments={layout.route} drawKey="plan" instant={instant} segmentDelay={(i) => SEG_START + i * SEG_GAP} />
        </svg>
        {layout.stops.map((s, i) => {
          const meta = LANDMARKS[i];
          const stop = stops[s.id] ?? {};
          const isSel = selected === s.id;
          return (
            <button key={s.id} type="button" data-stop={s.id}
                    className={`unstyled pa-stop side-${s.side} ${isSel ? "is-selected" : ""} ${stop.state ? `is-${stop.state}` : ""} ${enter ? "pa-enter" : ""}`}
                    style={{ top: s.top, height: s.height, animationDelay: enter ? `${arrival(i)}s` : undefined } as React.CSSProperties}
                    aria-pressed={isSel} aria-label={`${meta.term} (${meta.place})${stop.aria ? `: ${stop.aria}` : ""}`}
                    onClick={(e) => onSelect(s.id, e.currentTarget)}>
              <span className="pa-plate" aria-hidden="true" style={{ left: s.plate.x, top: s.plate.y - s.top, width: s.plate.w, height: s.plate.h }}>
                {s.id === "harbor" ? (
                  <svg className="pa-harbor" viewBox="-74 -50 148 80" preserveAspectRatio="xMidYMid meet" focusable="false"><StartHarbor x={0} y={0} /></svg>
                ) : (
                  <img src={PLATE_SRC[s.id]} alt="" decoding="async" className={`pa-plate-img plate-${s.id}`} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                )}
                {s.id === "bridge" && <Bridge />}
                {stop.state === "fog" && <img src="/art/fog-layer-1.webp" alt="" decoding="async" loading="lazy" className="pa-fog" />}
              </span>
              <span className="pa-label" style={s.side === "left" ? { left: s.label.x, maxWidth: s.label.w } : { right: layout.w - s.label.x - s.label.w, maxWidth: s.label.w }}>
                <span className="pa-term">{meta.term}</span>
                <span className="pa-place">{meta.place}</span>
                {stop.value != null && <span className="pa-value">{stop.value}</span>}
                {stop.evidence != null && <span className="pa-ev">{stop.evidence}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default PlanAtlas;
