import { useState, type ReactNode } from "react";
import { LANDMARKS, type LandmarkId } from "../../lib/copy";
import { ArtPlate } from "./ArtPlate";
import { AtlasDefs, Compass, Grain, Island, Scenery, Vignette } from "./Paper";

interface Props {
  selected: LandmarkId | null; onSelect: (id: LandmarkId) => void;
  /** Text summary per landmark (goes into the button's accessible name). */
  summary: Partial<Record<LandmarkId, string>>;
  /** Optional rich summary per landmark (e.g. a <Money> with its evidence) rendered instead of the plain text. */
  summaryNode?: Partial<Record<LandmarkId, ReactNode>>;
  compact?: boolean;
}

const W = 1000, H = 520;
const POS: Record<LandmarkId, { x: number; y: number }> = { harbor: { x: 150, y: 330 }, bridge: { x: 360, y: 215 }, cove: { x: 560, y: 350 }, lookout: { x: 740, y: 180 }, lighthouse: { x: 880, y: 330 } };

/**
 * My plan: five painted landmarks on one coast. Familiar insurance terms stay the prominent label; the place name is the small one.
 * The lighthouse landmark is the painted `island-lighthouse` plate (ArtPlate: webp → png → the SVG lighthouse below, addendum §C3);
 * the beam animates only in the SVG fallback (class `motion-drift`, off under reduced motion). The SVG is aria-hidden; the buttons are the UI.
 */
export function PlanAtlas({ selected, onSelect, summary, summaryNode, compact = false }: Props) {
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const [plateFailed, setPlateFailed] = useState(false);
  const svgLighthouse = (
    <g>
      <path d="M -14 40 L -9 -40 L 9 -40 L 14 40 Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.2" />
      {[-20, 0, 20].map((y) => <rect key={y} x={-12} y={y} width={24} height={8} fill="var(--terracotta)" />)}
      <rect x={-10} y={-50} width={20} height={12} fill="var(--gold)" />
      <path d="M -10 -50 L 0 -60 L 10 -50 Z" fill="var(--ink)" />
      <path className="beam motion-drift" d="M 10 -46 L 120 -80 L 120 -20 Z" fill="var(--gold)" opacity="0.28" />
    </g>
  );
  return (
    <div className={`map plan-map ${compact ? "is-compact" : ""}`} role="group" aria-label="Plan map">
      <svg className="map-paint" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
        <AtlasDefs />
        <rect width={W} height={H} fill="url(#oc-water)" />
        <Scenery w={W} h={H} horizon={0.34} />
        <rect width={W} height={H} fill="url(#oc-ripples)" opacity="0.45" className="ripples motion-drift" />
        {/* coastline */}
        <g filter="url(#oc-wobble)">
          <path d={`M 0 ${H} L 0 400 C 120 380 160 300 260 290 C 360 280 380 240 470 250 C 560 262 600 330 700 300 C 790 272 820 220 900 240 C 950 252 980 300 ${W} 280 L ${W} ${H} Z`} fill="url(#oc-land)" />
          <path d={`M 0 ${H} L 0 410 C 120 390 160 312 260 302 C 360 292 380 252 470 262 C 560 274 600 342 700 312 C 790 284 820 232 900 252 C 950 264 980 312 ${W} 292 L ${W} ${H} Z`} fill="var(--sand)" opacity="0.35" />
        </g>
        <Island cx={560} cy={395} r={60} />
        {/* harbor */}
        <g transform={`translate(${POS.harbor.x} ${POS.harbor.y})`}>
          <rect x={-70} y={10} width={140} height={10} fill="var(--wood)" rx={2} />
          {[-50, -20, 10, 40].map((x) => <rect key={x} x={x} y={18} width={6} height={16} fill="var(--wood)" />)}
          <path d="M -40 8 l 14 -40 l 8 40 Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />
          <path d="M -26 8 l 0 -44" stroke="var(--ink)" strokeWidth="1.2" />
          <ellipse cx={-26} cy={10} rx={26} ry={6} fill="var(--wood)" />
        </g>
        {/* bridge */}
        <g transform={`translate(${POS.bridge.x} ${POS.bridge.y})`} fill="none" stroke="var(--wood)" strokeWidth="5" strokeLinecap="round">
          <path d="M -70 20 Q 0 -40 70 20" />
          <path d="M -70 30 Q 0 -30 70 30" strokeWidth="3" />
          {[-50, -25, 0, 25, 50].map((x) => <path key={x} d={`M ${x} ${20 - (1 - (x / 70) ** 2) * 60 * 0.95} L ${x} ${30 - (1 - (x / 70) ** 2) * 60 * 0.95 + 6}`} strokeWidth="2" />)}
        </g>
        {/* cove */}
        <g transform={`translate(${POS.cove.x} ${POS.cove.y})`}>
          <path d="M -70 0 C -40 50 40 50 70 0" fill="var(--water-light)" stroke="var(--sand)" strokeWidth="6" />
          <circle cx={0} cy={36} r={6} fill="var(--terracotta)" />
          <circle cx={-22} cy={28} r={4} fill="var(--gold)" />
          <circle cx={20} cy={30} r={4} fill="var(--paper)" />
        </g>
        {/* lookout */}
        <g transform={`translate(${POS.lookout.x} ${POS.lookout.y})`}>
          <path d="M -34 40 L 0 -40 L 34 40 Z" fill="var(--forest)" />
          <rect x={-10} y={-20} width={20} height={16} fill="var(--wood)" />
          <path d="M -14 -20 L 0 -32 L 14 -20 Z" fill="var(--terracotta)" />
          <path d="M 0 -40 l 0 -16" stroke="var(--ink)" strokeWidth="1.5" />
          <path d="M 0 -56 l 16 5 l -16 5 Z" fill="var(--gold)" />
        </g>
        {/* lighthouse: painted plate, SVG fallback */}
        <g transform={`translate(${POS.lighthouse.x} ${POS.lighthouse.y})`}>
          <ArtPlate slot="island-lighthouse" x={-120} y={-135} w={230} h={175} preserveAspectRatio="xMidYMax meet" fallback={svgLighthouse} onFallback={() => setPlateFailed(true)} />
        </g>
        {plateFailed && <Compass x={W - 60} y={58} />}
        {!plateFailed && <Compass x={W - 60} y={58} size={40} />}
        <Grain />
        <Vignette />
      </svg>
      {!compact && (
        <div className="map-controls">
          {LANDMARKS.map((l) => (
            <button key={l.id} type="button" className={`landmark-btn ${selected === l.id ? "is-selected" : ""}`} style={{ left: pct(POS[l.id].x, W), top: pct(POS[l.id].y + 58, H) }}
                    aria-pressed={selected === l.id} aria-label={`${l.term} (${l.place})${summary[l.id] ? `: ${summary[l.id]}` : ""}`} onClick={() => onSelect(l.id)}>
              <span className="lm-term">{l.term}</span>
              <span className="lm-place">{l.place}</span>
              {(summaryNode?.[l.id] ?? summary[l.id]) && <span className="lm-sum">{summaryNode?.[l.id] ?? summary[l.id]}</span>}
            </button>
          ))}
        </div>
      )}
      {compact && (
        <ol className="landmark-list" aria-label="Landmarks">
          {LANDMARKS.map((l) => (
            <li key={l.id}>
              <button type="button" className={`landmark-row unstyled ${selected === l.id ? "is-selected" : ""}`} aria-pressed={selected === l.id}
                      aria-label={`${l.term} (${l.place})${summary[l.id] ? `: ${summary[l.id]}` : ""}`} onClick={() => onSelect(l.id)}>
                <span className="lm-term">{l.term}</span><span className="lm-place">{l.place}</span><span className="lm-sum">{summaryNode?.[l.id] ?? summary[l.id] ?? ""}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
