import { createRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { motion } from "motion/react";
import { AnimatedBeam } from "@/components/magicui/animated-beam";
import { hasDrawn, markDrawn } from "@/lib/drawRegistry";
import { EASE, useReducedMotion } from "@/lib/motion";
import { EvidenceBadge } from "@/components/Primitives";
import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { checkpointsForLine, itemFeeCents, missingForLine } from "@/lib/drawer";
import { money, plainNote } from "@/lib/stitches";
import { stitchesForLine } from "@/lib/stitches";
import { buildTrail } from "@/lib/trail";
import type { Benefits, CoverageRule, LedgerLine, MissingInput, PlanFixture, Stitch, TreatmentItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PipelineNode } from "./PipelineNode";

export interface CostPipelineProps {
  line: LedgerLine;
  item?: TreatmentItem;
  rule?: CoverageRule;
  plan: PlanFixture;
  stitches: Stitch[];
  /** The plan's benefit record (remaining deductible / maximum): the same evidence inputs the map's checkpoints use. */
  benefits?: Benefits | null;
  /** The saved estimate id: a new id re-fires the beams once (source → target, pipeline order) and announces "Estimate updated". */
  estimateId?: string;
  missing?: MissingInput[];
  mobile?: boolean;
  onSelectStitch: (s: Stitch) => void;
  /** Rendered under the reconciliation line (e.g. the upper-bound flag). */
  className?: string;
  /** The vertical ledger (the 440 px drawer and the phone sheet): one full-width row per node, top to bottom in processing order. */
  vertical?: boolean;
}

/** The warn sentence shared with the lighthouse cost trail (lib/copy.ts `UI.reconcileWarn`; no em dash, R-02). */
export const RECONCILE_WARN = UI.reconcileWarn;

/**
 * CostPipeline (spec §4.5, component plan N2-A): a horizontal flow of nodes for one ledger line, built from `buildTrail(line).steps` through
 * `checkpointsForLine`. Connectors are Magic UI AnimatedBeam (ink path, sea → gold sweep, `repeat` 0 (one sweep), `delay = i × 0.12`, keyed on the
 * estimate id so the sweep fires once per recompute in pipeline order; static path under reduced motion). The arrowhead on each node's
 * in-port is the only arrow in the UI (it encodes flow direction). Phone: a 2-column grid without beams (arrows only). Unresolved line:
 * the fee node and a fog node listing the missing inputs; no numbers invented. The host surface's live region announces "Estimate updated" (no second region here).
 * Reduced motion: NumberFlow snaps, beams render the static connection, nothing else moves.
 * `vertical` (delight pass mo-10; spec §5.7 decision "vertical pipeline in the drawer"): in the 440 px drawer the horizontal track hid the
 * You pay node behind a sideways scroll. The ledger stacks the nodes; a 2 px rail behind them draws top to bottom once while each row
 * settles in processing order (fee → allowed → deductible → share → maximum → you pay, 120 ms apart), the receipt rolling into place.
 * It runs once per line and estimate in a session (lib/drawRegistry), so reopening an island shows the settled ledger.
 */
export function CostPipeline({ line, item, rule, plan, stitches, benefits = null, estimateId, missing = [], mobile = false, onSelectStitch, className, vertical = false }: CostPipelineProps) {
  const reduce = useReducedMotion();
  const revealKey = `pipe:${line.treatment_item_id ?? line.label}:${estimateId ?? "e"}`;
  const [reveal] = useState(() => vertical && !reduce && !hasDrawn(revealKey));
  useEffect(() => { if (vertical) markDrawn(revealKey); }, [vertical, revealKey]);
  const trail = useMemo(() => buildTrail(line), [line]);
  const lineMissing = useMemo(() => missingForLine(missing, line), [missing, line]);
  const cps = useMemo(() => checkpointsForLine(line, item, rule, plan, stitches, lineMissing, benefits), [line, item, rule, plan, stitches, lineMissing, benefits]);
  const lineStitches = useMemo(() => stitchesForLine(line, stitches, rule ? { coverageCite: rule.coverage_cite } : undefined), [line, stitches, rule]);
  const unresolved = line.status === "unresolved";
  const nodeCount = cps.length + (unresolved && item ? 1 : 0);

  const containerRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef<(HTMLLIElement | null)[]>([]);
  const outRefs = useMemo(() => Array.from({ length: nodeCount }, () => createRef<HTMLElement | null>() as RefObject<HTMLElement | null>), [nodeCount]);
  const inRefs = useMemo(() => Array.from({ length: nodeCount }, () => createRef<HTMLElement | null>() as RefObject<HTMLElement | null>), [nodeCount]);
  const [portsReady, setPortsReady] = useState(0);
  useLayoutEffect(() => {
    nodeEls.current.forEach((li, i) => {
      if (!li) return;
      (outRefs[i] as { current: HTMLElement | null }).current = li.querySelector<HTMLElement>(".pipe-port-out");
      (inRefs[i] as { current: HTMLElement | null }).current = li.querySelector<HTMLElement>(".pipe-port-in");
    });
    setPortsReady((n) => n + 1);
  }, [nodeCount, mobile, outRefs, inRefs]);

  // no live region here (a11y-25): the host surface (JourneyView, PlanView) owns the one polite region that announces a recompute

  const label = unresolved
    ? DRAWER.pipelineUnresolved(line.label)
    : DRAWER.pipelineLabel(line.label, cps.length, money(trail.fee), money(trail.youPay));

  let idx = 0;
  const nodes: React.ReactNode[] = [];
  if (unresolved && item) {
    const i = idx++;
    nodes.push(<PipelineNode key="fee" ref={(el) => { nodeEls.current[i] = el; }} rule="fee" term={DRAWER.dentistFee} amountOut={itemFeeCents(item)} owner="info" evidence="USER" onSelectStitch={onSelectStitch} revealIndex={reveal ? i : null} />);
  }
  for (const cp of cps) {
    const i = idx++;
    const isTotal = cp.rule === "total";
    nodes.push(
      <PipelineNode key={cp.key} ref={(el) => { nodeEls.current[i] = el; }} rule={cp.rule} term={cp.term} amountOut={cp.amountOut} change={cp.rule === "fee" || isTotal ? undefined : cp.change}
                    owner={cp.owner} split={cp.split} stitch={cp.stitch} stitches={isTotal ? lineStitches : undefined} evidence={cp.badge} onSelectStitch={onSelectStitch}
                    showArrow={i > 0 && !vertical} isTotal={isTotal} isClosed={cp.rule === "X" || cp.rule === "W" || cp.rule === "F"} revealIndex={reveal ? i : null}>
        {cp.rule === "missing" && (
          <ul className="node-missing">
            {lineMissing.map((m, k) => <li key={k}><strong>{m.input}</strong> <span className="muted">{m.how}</span></li>)}
            {lineMissing.length === 0 && cp.flags.map((f, k) => <li key={k}>{plainNote(f)}</li>)}
          </ul>
        )}
        {(cp.rule === "X" || cp.rule === "W" || cp.rule === "F") && <p className="node-closed-why">{cp.explanation}</p>}
      </PipelineNode>,
    );
  }

  if (vertical) {
    return (
      <div className={cn("pipeline-wrap pipeline-vertical", className)}>
        <div ref={containerRef} className="pipeline-ledger">
          <motion.span className="pipeline-rail" aria-hidden="true" initial={reveal ? { scaleY: 0 } : false} animate={{ scaleY: 1 }}
                       transition={{ duration: 0.24 + nodeCount * 0.12, ease: EASE.inOut, delay: 0.24 }} />
          <ol className="pipeline" aria-label={label} data-nodes={nodeCount}>
            {nodes}
          </ol>
        </div>
        {trail.reconciles === true && <p className="reconcile ok">✓ {UI.reconciles}</p>}
        {trail.reconciles === false && <p className="reconcile warn" role="alert">{RECONCILE_WARN}</p>}
        {unresolved && <p className="pipeline-unresolved"><EvidenceBadge status="UNKNOWN" /> {UI.missingTitle}</p>}
      </div>
    );
  }

  return (
    <div className={cn("pipeline-wrap", className)}>
      <div className="pipeline-scroll">
        <div ref={containerRef} className={cn("pipeline-track", mobile && "pipeline-track-grid")}>
          <ol className="pipeline" aria-label={label} data-nodes={nodeCount}>
            {nodes}
          </ol>
          {!mobile && nodeCount > 1 && (
            <div key={`${estimateId ?? "e"}-${portsReady}`} className="pipeline-beams" aria-hidden="true">
              {Array.from({ length: nodeCount - 1 }, (_, i) => (
                <AnimatedBeam key={i} containerRef={containerRef} fromRef={outRefs[i]} toRef={inRefs[i + 1]} delay={i * 0.12} repeat={0} duration={0.9} pathWidth={2} />
              ))}
            </div>
          )}
        </div>
      </div>
      {!mobile && nodeCount > 3 && <p className="pipeline-hint muted small">{DRAWER.pipelineHint}</p>}
      {trail.reconciles === true && <p className="reconcile ok">✓ {UI.reconciles}</p>}
      {trail.reconciles === false && <p className="reconcile warn" role="alert">{RECONCILE_WARN}</p>}
      {unresolved && <p className="pipeline-unresolved"><EvidenceBadge status="UNKNOWN" /> {UI.missingTitle}</p>}
    </div>
  );
}

export default CostPipeline;
