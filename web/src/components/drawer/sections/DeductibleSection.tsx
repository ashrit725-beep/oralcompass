import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { calcInputs, remainingBeforeLine, stitchForCheckpoint } from "@/lib/drawer";
import { stitchForCite } from "@/lib/stitches";
import { docOf, Fact, Figure, Row, Section, type SectionProps } from "./shared";

/**
 * Section 3 · Deductible (spec §4.4): plan deductible (DOC + stitch, or "Not stated"), whether it applies to this category or is waived,
 * remaining before this procedure (USER + the server's derivation sentence), applied to this line (the D step; $0.00 is information) with
 * the checkpoint explanation, and remaining after (the engine's `remaining_after`). Omitted when the plan has no deductible field.
 */
export function DeductibleSection({ island, line, item, trail, rule, plan, benefits, estimate, stitches, onSelectStitch }: SectionProps) {
  const doc = docOf(plan);
  const ded = plan.deductible_individual;
  if (!ded) return null;
  const planStitch = stitchForCite(ded.cite, stitches, doc);
  const dStep = trail?.steps.find((s) => s.key === "deductible");
  const dStitch = stitchForCheckpoint("D", dStep?.stitch ?? null, rule, plan, stitches) ?? planStitch;
  const category = rule?.category ?? null;
  const waived = category ? plan.deductible_waived_classes.includes(category) : false;
  const applies = rule?.deductible_applies ?? (category ? !waived : null);
  const beforeLine = remainingBeforeLine("deductible", island.lineIndex, estimate?.ledger.lines ?? [], benefits);
  const remainingBefore = beforeLine.cents;
  const derivation = benefits?.derivation?.remaining_deductible ?? null;
  return (
    <Section k="deductible" title={DRAWER.sDeductible}>
      <dl className="dsec-dl">
        <Row term={DRAWER.planDeductible} note={ded.note && ded.status !== "DOC" ? ded.note : null}>
          {ded.value != null ? <Figure cents={ded.value} evidence={ded.status} stitch={planStitch} onSelectStitch={onSelectStitch} /> : <Fact evidence={ded.status ?? "UNKNOWN"}><span className="muted">{UI.notStated}</span></Fact>}
        </Row>
        <Row term={DRAWER.appliesToCategory} note={plan.deductible_waiver_note && waived ? plan.deductible_waiver_note : null}>
          {applies == null ? <Fact evidence="UNKNOWN"><span className="muted">{UI.notStated}</span></Fact>
            : <Fact evidence="DOC" stitch={stitchForCite(rule?.deductible_cite, stitches, doc) ?? planStitch} onSelectStitch={onSelectStitch}>{applies ? DRAWER.applies : DRAWER.waivedFor(category ?? "")}</Fact>}
        </Row>
        <Row term={DRAWER.remainingBefore} note={beforeLine.calculated ? DRAWER.remainingBeforeLater : derivation}>
          {beforeLine.calculated ? <Figure cents={remainingBefore} evidence="USER" calc inputs={["USER"]} calcLabel={DRAWER.calcFromRoute} stitch={dStitch} onSelectStitch={onSelectStitch} />
            : <Figure cents={remainingBefore} evidence="USER" />}
        </Row>
        {dStep && (
          <Row term={DRAWER.appliedToLine} note={dStep.explanation}>
            <Figure cents={dStep.change == null ? null : -dStep.change} evidence="DOC" calc inputs={calcInputs(item, estimate, benefits)} calcLabel={null} stitch={dStitch} onSelectStitch={onSelectStitch} />
          </Row>
        )}
        {line && line.status === "estimate" && (
          <Row term={DRAWER.remainingAfter}>
            <Figure cents={line.remaining_after?.deductible_cents ?? null} evidence="USER" calc inputs={["USER"]} calcLabel={DRAWER.calcFromRoute} stitch={dStitch} onSelectStitch={onSelectStitch} />
          </Row>
        )}
      </dl>
    </Section>
  );
}

export default DeductibleSection;
