import { forwardRef, type ReactNode } from "react";
import { DRAWER } from "@/lib/copy/drawer";
import { signed } from "@/lib/stitches";
import type { CheckpointRule, Evidence, Stitch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EvidenceBadge, StitchChip } from "@/components/Primitives";
import { RollingAmount } from "./RollingAmount";
import { RuleGlyph } from "./RuleGlyph";

export type NodeOwner = "patient" | "plan" | "nobody" | "basis" | "info";

export interface PipelineNodeProps {
  rule: CheckpointRule;
  term: string;
  /** The amount leaving this node (null → em dash + the waiting words). */
  amountOut: number | null;
  /** The signed change at this node; omitted on the fee and you-pay nodes. */
  change?: number | null;
  owner: NodeOwner;
  /** Coverage split: rendered as two amounts (plan / you) instead of one. */
  split?: { plan: number; patient: number; planPct: number };
  /** The clause behind this node; when absent the evidence badge is shown instead. */
  stitch?: Stitch;
  /** Extra stitches (the you-pay node lists every clause of the line). */
  stitches?: Stitch[];
  evidence: Evidence;
  onSelectStitch: (s: Stitch) => void;
  /** Words under the amount (e.g. the fog node's missing inputs). */
  children?: ReactNode;
  showArrow?: boolean;
  isTotal?: boolean;
  isClosed?: boolean;
}

/**
 * One node of the dollar pipeline (spec §4.5 node anatomy): term (13 muted), amount (18 tabular ink; the you-pay node terracotta 22),
 * change line (signed; terracotta only when the owner is the patient, `−` glyph never colour alone), badge or stitch chip. Owner colour is
 * never the only signal: the owner words are printed (`your share`, `plan share`, `not owed by you`, `basis`). The two `pipe-port` spans are
 * the beam anchors (right edge out, left edge in). The `.node` class is the container the trust check inspects for a badge or stitch.
 */
export const PipelineNode = forwardRef<HTMLLIElement, PipelineNodeProps>(function PipelineNode(
  { rule, term, amountOut, change, owner, split, stitch, stitches, evidence, onSelectStitch, children, showArrow, isTotal, isClosed }, ref,
) {
  const ownerWord = owner === "patient" ? DRAWER.ownerPatient : owner === "plan" ? DRAWER.ownerPlan : owner === "nobody" ? DRAWER.ownerNobody : owner === "basis" ? DRAWER.ownerBasis : null;
  const chips = stitches && stitches.length ? stitches : stitch ? [stitch] : [];
  return (
    <li ref={ref} className={cn("node", `node-owner-${owner}`, isTotal && "node-total", isClosed && "node-closed", rule === "missing" && "node-fog")} data-rule={rule}>
      <span className="pipe-port pipe-port-in" aria-hidden="true" />
      <span className="pipe-port pipe-port-out" aria-hidden="true" />
      {showArrow && (
        <svg className="pipe-arrow" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
          <path d="M2 7h9M8 3.5L11.5 7 8 10.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <p className="node-term"><RuleGlyph rule={rule} size={16} /> {term}</p>
      {split ? (
        <div className="node-amounts">
          <span className="node-split"><span className="node-split-word">{DRAWER.ownerPlan}</span> <RollingAmount cents={split.plan} evidence={evidence} badge={false} /></span>
          <span className="node-split node-split-you"><span className="node-split-word">{DRAWER.ownerPatient}</span> <RollingAmount cents={split.patient} evidence={evidence} badge={false} /></span>
        </div>
      ) : (
        <div className="node-amounts">
          <RollingAmount cents={amountOut} evidence={evidence} badge={false} size={isTotal ? "lg" : "md"} />
          {amountOut == null && rule !== "missing" && <span className="node-waiting">{DRAWER.waitingInfo}</span>}
        </div>
      )}
      {change != null && !split && (
        <p className={cn("node-change", change < 0 && owner === "patient" && "node-change-patient")}>
          <span className="pipe-delta">{change === 0 ? DRAWER.noChange : signed(change)}</span>{ownerWord && change !== 0 ? <span className="node-owner-word"> · {ownerWord}</span> : null}
        </p>
      )}
      {children}
      <p className="node-mark">
        {chips.length ? chips.slice(0, 3).map((s) => <StitchChip key={s.id} stitch={s} onSelect={onSelectStitch} />) : <EvidenceBadge status={evidence} />}
        {isTotal && <span className="node-total-word">{DRAWER.ownerTotal}</span>}
      </p>
    </li>
  );
});

export default PipelineNode;
