import { GLYPH_PATHS, type GlyphId } from "@/lib/islands";
import type { InsuranceCheckpointVM } from "@/lib/types";

/**
 * Checkpoint glyphs (spec §5.6): every rule glyph is an SVG path, never emoji; the word travels in the control's accessible name.
 * `Glyph` renders one glyph in a 24-box (used by the scene markers, the HTML checkpoint buttons, the vertical passage rows, the care
 * rail and the legend). `CheckpointMarker` is the painted marker in the aria-hidden scene; its HTML twin is the checkpoint row in PassageVertical.
 * Owner is never colour alone: terracotta is reserved for owner `patient` and the you-pay landing; owner `nobody` is a sand hatch
 * (addendum B1/B2); `plan` is sea ink; `basis` is wood; pass-through markers are hollow.
 */
export function Glyph({ id, size = 14, className }: { id: GlyphId; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {GLYPH_PATHS[id].map((p, i) => <path key={i} d={p.d} fill={p.fill ? "currentColor" : "none"} strokeDasharray={p.dashed ? "2.5 2.5" : undefined} />)}
    </svg>
  );
}

export type MarkerTone = "patient" | "plan" | "nobody" | "basis" | "info" | "closed" | "fog" | "passed" | "total";
export function toneOf(cp: InsuranceCheckpointVM | null, passThrough: boolean): MarkerTone {
  if (!cp) return "passed";
  if (cp.rule === "X" || cp.rule === "W" || cp.rule === "F") return "closed";
  if (cp.rule === "missing") return "fog";
  if (cp.rule === "total") return "total";
  if (passThrough) return "passed";
  if (cp.rule === "fee") return "info";
  return cp.owner === "plan" ? "plan" : cp.owner === "nobody" ? "nobody" : cp.owner === "basis" ? "basis" : cp.owner === "patient" ? "patient" : "info";
}
const STROKE: Record<MarkerTone, string> = { patient: "var(--owner-patient)", plan: "var(--owner-plan)", nobody: "var(--ink)", basis: "var(--owner-basis)", info: "var(--ink)", closed: "var(--closed)", fog: "var(--ink-soft)", passed: "var(--ink-soft)", total: "var(--owner-patient)" };
const FILL: Record<MarkerTone, string> = { patient: "var(--paper)", plan: "var(--paper)", nobody: "url(#oc-sand-hatch)", basis: "var(--paper)", info: "var(--paper)", closed: "var(--paper)", fog: "var(--paper)", passed: "var(--paper)", total: "var(--owner-patient)" };

export interface CheckpointMarkerProps { cp: InsuranceCheckpointVM | null; x: number; y: number; r: number; selected?: boolean; passThrough?: boolean; glyph?: GlyphId }

export function CheckpointMarker({ cp, x, y, r, selected = false, passThrough = false, glyph }: CheckpointMarkerProps) {
  const tone = toneOf(cp, passThrough);
  const id: GlyphId = glyph ?? (passThrough ? "passed" : ((cp?.glyph as GlyphId) ?? "passed"));
  const g = r * 1.4;
  return (
    <g transform={`translate(${x} ${y})`} className={`cp-mark cp-mark-${tone}`}>
      {selected && <circle r={r + 4} fill="none" stroke="var(--select)" strokeWidth={2} />}
      <circle r={r} fill={FILL[tone]} stroke={STROKE[tone]} strokeWidth={1.6} strokeDasharray={tone === "passed" || tone === "fog" ? "2.5 2.5" : undefined} />
      <g transform={`translate(${-g / 2} ${-g / 2})`} color={tone === "total" ? "var(--paper)" : STROKE[tone]}>
        <svg viewBox="0 0 24 24" width={g} height={g} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" overflow="visible">
          {GLYPH_PATHS[id].map((p, i) => <path key={i} d={p.d} fill={p.fill ? "currentColor" : "none"} strokeDasharray={p.dashed ? "2.5 2.5" : undefined} />)}
        </svg>
      </g>
    </g>
  );
}

/** Painted defs used by the markers (sand hatch for owner nobody). Rendered once inside the passage SVG. */
export function CheckpointDefs() {
  return (
    <defs>
      <pattern id="oc-sand-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4" height="4" fill="var(--sand)" />
        <line x1="0" y1="0" x2="0" y2="4" stroke="var(--paper)" strokeWidth="1.6" />
      </pattern>
    </defs>
  );
}

export default CheckpointMarker;
