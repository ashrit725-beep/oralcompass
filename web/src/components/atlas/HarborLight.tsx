import { useState } from "react";
import { useReducedMotion } from "@/lib/motion";
import { ArtPlate } from "./ArtPlate";
import { Island } from "./Paper";

/**
 * The Harbor Light (spec §3.4, §10): the `island-lighthouse` plate at ≈ 3.4r with its painted harbour and surf (SVG lighthouse +
 * `Island` fallback). The beam sweeps only while `lit` (estimate.status === "estimate"): a 7 s ease-in-out ±6° scenery loop in CSS
 * (`.beam`, class `motion-drift`, off under reduced motion where it rests at its mid position). In fog the lamp is lit but static.
 */
export function HarborLight({ x, y, r, lit, selected }: { x: number; y: number; r: number; lit: boolean; selected: boolean }) {
  const reduce = useReducedMotion();
  const [fallback, setFallback] = useState(false);
  const w = 3.4 * r, h = w * (1106 / 1422);
  // the lamp sits on the painted lantern (upper right of the plate's tower); the SVG fallback tower stands at the centre
  const lamp = fallback ? { x: x + r * 0.08, y: y - h * 0.38 } : { x: x + w * 0.15, y: y - h * 0.41 };
  return (
    <g className="harbor-light">
      <ellipse cx={x + 6} cy={y + h * 0.36} rx={w * 0.4} ry={h * 0.15} fill="var(--water-ink)" opacity={0.22} />
      <ArtPlate slot="island-lighthouse" x={x - w / 2} y={y - h / 2} w={w} h={h} preserveAspectRatio="xMidYMid meet" onFallback={() => setFallback(true)} fallback={
        <g>
          <Island cx={x} cy={y + 8} r={r * 0.8} />
          <g transform={`translate(${x} ${y - 10})`}>
            <path d="M -12 36 L -8 -34 L 8 -34 L 12 36 Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.2} />
            {[-18, 2, 20].map((yy) => <rect key={yy} x={-10} y={yy} width={20} height={7} fill="var(--terracotta)" />)}
            <rect x={-9} y={-44} width={18} height={11} fill="var(--gold)" />
            <path d="M -9 -44 L 0 -54 L 9 -44 Z" fill="var(--ink)" />
          </g>
        </g>
      } />
      {/* the lamp's beam: lit and sweeping only when the estimate is resolved */}
      <g transform={`translate(${lamp.x} ${lamp.y})`} opacity={lit ? 1 : 0.45}>
        <path className={lit && !reduce ? "beam motion-drift" : "beam"} d="M 0 0 L 120 -34 L 120 26 Z" fill="var(--gold-soft)" opacity={lit ? 0.3 : 0.15} style={{ transformOrigin: "0px 0px" }} />
        <circle r={4} fill={lit ? "var(--gold)" : "var(--sand)"} stroke="var(--ink)" strokeWidth={0.8} />
      </g>
      {selected && <ellipse cx={x} cy={y + r * 0.15} rx={w * 0.42} ry={h * 0.42} fill="none" stroke="var(--select)" strokeWidth={2.2} opacity={0.9} />}
    </g>
  );
}

export default HarborLight;
