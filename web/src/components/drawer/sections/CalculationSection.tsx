import { CostTrail } from "@/components/CostTrail";
import { EvidenceBadge, StitchChip } from "@/components/Primitives";
import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { stitchForCheckpoint } from "@/lib/drawer";
import { money, stitchForLabel } from "@/lib/stitches";
import { equationRows, type EquationPart } from "@/lib/trail";
import type { CheckpointRule } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Section, type SectionProps } from "./shared";

const ruleOfKey: Record<string, CheckpointRule> = { fee: "fee", allowed: "N", alternate: "AB", deductible: "D", "share-plan": "CO", "share-you": "CO", max: "M", you: "total", x: "X" };

function Part({ p }: { p: EquationPart }) {
  if (p.kind === "op") return <span className="eq-op">{` ${p.op} `}</span>;
  if (p.kind === "pct") return <span className="eq-num">{p.pct}%</span>;
  return <span className="eq-num">{money(p.cents)}</span>;
}

/**
 * Section 11 · How was this calculated? (spec §4.4, addendum B3 graft): a `<details>` (open on desktop, and on the phone when the drawer was
 * opened from a checkpoint) holding the equation rows ("$980.00 × 60% = $588.00 plan share", formatted only from the trail's reconciled step
 * amounts, each row ending with its stitch chip), the reconciliation line only when the trail reconciles, then the existing CostTrail for
 * this line alone (no line tabs) with the engine receipt table one click away. Always rendered for procedure islands.
 */
export function CalculationSection({ line, island, trail, rule, plan, estimate, stitches, onSelectStitch, mobile, arrivedAt }: SectionProps) {
  if (!line || !trail || !estimate) return null;
  const rows = equationRows(trail, {
    fee: DRAWER.eqFee, allowed: DRAWER.eqAllowed, basis: DRAWER.eqBasis, afterDeductible: DRAWER.eqAfterDeductible, planShare: DRAWER.eqPlanShare,
    yourShare: DRAWER.eqYourShare, planPays: DRAWER.eqPlanPays, youPay: DRAWER.eqYouPay, fullFee: DRAWER.eqFullFee,
  });
  const lineIndex = island.lineIndex ?? estimate.ledger.lines.indexOf(line);
  const open = !mobile || !!arrivedAt;
  return (
    <Section k="calculation" title={DRAWER.sCalculation} collapsible defaultOpen={open} className="calc-section">
      <ol className="eq-rows" aria-label={DRAWER.equationsLabel}>
        {rows.map((r) => {
          const cpRule = ruleOfKey[r.key] ?? "missing";
          const stitch = stitchForCheckpoint(cpRule, r.stitch, rule, plan, stitches) ?? stitchForLabel(r.stitch, cpRule, stitches);
          const resultEvidence = r.key === "fee" ? "USER" : "DOC";
          return (
            <li key={r.key} className={cn("eq-row", `owner-${r.owner}`)}>
              <span className="eq-expr">
                {(r.parts.length > 1 ? r.parts.slice(0, -2) : []).map((p, i) => <Part key={i} p={p} />)}
                {r.parts.length > 1 && <span className="eq-op"> = </span>}
                {r.result != null ? <span className="amt tabular-nums">{money(r.result)}</span> : null}
              </span>
              <span className="eq-label">{r.label}</span>
              {stitch ? <StitchChip stitch={stitch} onSelect={onSelectStitch} /> : <EvidenceBadge status={resultEvidence} />}
            </li>
          );
        })}
      </ol>
      {trail.reconciles === true && <p className="reconcile ok">✓ {UI.reconciles}</p>}
      {trail.reconciles !== true && <p className="dsec-note">{DRAWER.reconcilesOnlyNote}</p>}
      <details className="full-trail" open={trail.reconciles === false || undefined}>
        <summary>{DRAWER.fullTrail}</summary>
        <CostTrail estimate={estimate} stitches={stitches} onSelect={onSelectStitch} lineIndex={lineIndex >= 0 ? lineIndex : 0} />
      </details>
      <p className="calc-footer muted small">{DRAWER.calcFooter}</p>
    </Section>
  );
}

export default CalculationSection;
