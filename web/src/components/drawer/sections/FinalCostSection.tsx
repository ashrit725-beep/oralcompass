import { CostPipeline } from "@/components/pipeline/CostPipeline";
import { DRAWER } from "@/lib/copy/drawer";
import { stitchesForLine } from "@/lib/stitches";
import type { Stitch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Figure, Flag, Section, type SectionProps } from "./shared";

/**
 * Section 10 · Final cost (spec §4.4, §4.5): the hero `You pay` (serif, terracotta ink, the drawer's one focal point) stitched to every clause
 * of the line, the estimated plan payment (+ upper bound), the benefit year, then the CostPipeline for this line, the reconciliation line
 * and the "could change" sentence. Unresolved → "—" + Waiting for information with the UNKNOWN badge (never $0.00 from a null).
 * Not covered → the engine's closed-step label and the "full fee is your share" sentence. Always rendered for procedure islands.
 */
export function FinalCostSection(props: SectionProps & { estimateId?: string; first?: boolean }) {
  const { island, line, item, rule, plan, estimate, stitches, onSelectStitch, mobile, estimateId, first, benefits } = props;
  if (!line) return null;
  const chips: Stitch[] = stitchesForLine(line, stitches);
  const unresolved = line.status === "unresolved";
  const otherFlags = line.flags.filter((f) => !/waiting|alternate/i.test(f));
  return (
    <Section k="finalCost" title={DRAWER.sFinalCost} className={cn(first && "dsec-first")}>
      <p className={cn("final-hero", unresolved && "final-hero-unresolved")}>
        <span className="final-hero-term">{DRAWER.youPay}</span>
        <Figure cents={line.patient_cents} evidence="DOC" calc hero stitches={chips.slice(0, 3)} onSelectStitch={onSelectStitch} className="final-hero-amt" />
      </p>
      <p className="final-sub">
        <span>{DRAWER.estimatedPlanPayment}</span>{" "}
        <Figure cents={line.plan_cents} evidence="DOC" calc stitch={chips[0]} onSelectStitch={onSelectStitch} className="fig-plan" />
        {line.plan_is_upper_bound ? <span className="muted"> {DRAWER.upperBoundWord}</span> : null}
        {line.benefit_year ? <span className="muted"> · {DRAWER.benefitYear(line.benefit_year)}</span> : null}
      </p>
      {line.status === "not_covered" && (
        <>
          <Flag text={line.steps[0]?.label ?? ""} />
          <p className="dsec-note">{DRAWER.notCoveredLine}</p>
        </>
      )}
      <CostPipeline line={line} item={item} rule={rule} plan={plan} stitches={stitches} benefits={benefits} estimateId={estimateId ?? estimate?.id} missing={estimate?.missing_inputs ?? island.missing} mobile={mobile} onSelectStitch={onSelectStitch} vertical />
      {otherFlags.map((f, i) => <Flag key={i} text={f} />)}
      <p className="could-change">{estimate?.ledger.could_change ?? ""}</p>
    </Section>
  );
}

export default FinalCostSection;
