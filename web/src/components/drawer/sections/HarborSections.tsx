import { MissingInputs } from "@/components/CostTrail";
import { EvidenceBadge } from "@/components/Primitives";
import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { calcInputs, rangeWords } from "@/lib/drawer";
import { stepContextFor, stitchesForLine, uniqueStitches } from "@/lib/stitches";
import type { CoverageRule, IslandVM, PassageVM, Progress, Stitch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Figure, Row, Section, type SectionProps } from "./shared";

const statusWord = (i: IslandVM) => (i.state === "estimate" ? DRAWER.statusEstimate : i.state === "not_covered" ? DRAWER.statusNotCovered : i.state === "unresolved" ? DRAWER.statusUnresolved : DRAWER.statusPending);

/**
 * The Harbor Light's sections (spec §3.4): the route totals (you pay / plan pays, upper bound, "—" + Waiting for information when unresolved),
 * the per-island table (name, you pay, plan pays, status), the soundings after the last island, the processing-order note, the engine's
 * assumptions and movers range, the "could change" sentence, and the count of care stages after the route. Visited islands' claim figures
 * never enter these totals.
 */
/** The stitch a per-island cell carries: the line's coverage-share clause (its own class row), else the first clause behind the line. */
function cellStitch(i: IslandVM, rules: CoverageRule[], stitches: Stitch[]): Stitch | undefined {
  if (!i.line) return undefined;
  const ctx = stepContextFor(i.line, rules);
  const list = stitchesForLine(i.line, stitches, ctx);
  return list.find((s) => ctx?.coverageCite && s.quote === ctx.coverageCite.quote) ?? list.find((s) => s.ruleCodes.includes("CO")) ?? list[0];
}

export function HarborSections({ island, vm, rules, benefits, estimate, stitches, onSelectStitch, stageProgress }: SectionProps & { vm: PassageVM; stageProgress?: Progress["stages"] }) {
  const unresolved = !estimate || estimate.status === "unresolved";
  const chips: Stitch[] = estimate ? uniqueStitches(estimate.ledger.lines.flatMap((l) => stitchesForLine(l, stitches, stepContextFor(l, rules)))) : [];
  const last = vm.islands[vm.islands.length - 1];
  const after = last?.soundingsAfter ?? null;
  const inputs = calcInputs(undefined, estimate, benefits);
  const stagesAfter = island.stageIds.map((id) => stageProgress?.find((p) => p.id === id)).filter((p): p is Progress["stages"][number] => !!p);
  return (
    <>
      <Section k="finalCost" title={DRAWER.sTotals} className="dsec-first">
        <p className={cn("final-hero", unresolved && "final-hero-unresolved")}>
          <span className="final-hero-term">{DRAWER.routeYouPay}</span>
          <Figure cents={unresolved ? null : vm.totals.youPay} evidence="DOC" calc inputs={inputs} hero stitches={chips.slice(0, 3)} onSelectStitch={onSelectStitch} className="final-hero-amt" />
        </p>
        <p className="final-sub">
          <span>{DRAWER.routePlanPays}</span>{" "}
          <Figure cents={unresolved ? null : vm.totals.planPays} evidence="DOC" calc inputs={inputs} calcLabel={null} stitch={chips[0]} onSelectStitch={onSelectStitch} className="fig-plan" />
          {vm.totals.upperBound ? <span className="muted"> {DRAWER.upperBoundWord}</span> : null}
        </p>
        {estimate?.movers?.range && estimate.movers.range[0] !== estimate.movers.range[1] && (
          <p className="range"><EvidenceBadge status="UNKNOWN" /> {rangeWords(estimate.movers.range, estimate.movers.movers)}</p>
        )}
        {estimate && estimate.status === "unresolved" && <MissingInputs estimate={estimate} compact />}
      </Section>
      {vm.islands.length > 0 && (
        <Section k="calculation" title={DRAWER.sPerIsland}>
          <p className="dsec-note">{DRAWER.harborTableNote}</p>
          <table className="harbor-table">
            <thead><tr><th scope="col">{DRAWER.island}</th><th scope="col">{DRAWER.youPay}</th><th scope="col">{DRAWER.planPaysRow}</th><th scope="col">{DRAWER.status}</th></tr></thead>
            <tbody>
              {vm.islands.map((i) => {
                const known = i.state === "estimate" || i.state === "not_covered";
                const st = known ? cellStitch(i, rules, stitches) : undefined;
                const cellInputs = st ? [] : calcInputs(i.item, estimate, benefits);
                return (
                  <tr key={i.id} className={`island-${i.state}`}>
                    <th scope="row">{i.title}{i.subtitle ? <span className="muted"> · {i.subtitle}</span> : null}</th>
                    {/* data-label: the column name shown above each figure when the phone stacks the row (drawer.css) */}
                    <td data-label={DRAWER.youPay}><Figure cents={i.youPay} evidence={known ? "USER" : "UNKNOWN"} calc={known} inputs={cellInputs} calcLabel={null} stitch={st} onSelectStitch={onSelectStitch} waiting={false} className="fig-patient" /></td>
                    <td data-label={DRAWER.planPaysRow}><Figure cents={i.planPays} evidence={known ? "USER" : "UNKNOWN"} calc={known} inputs={cellInputs} calcLabel={null} stitch={st} onSelectStitch={onSelectStitch} waiting={false} className="fig-plan" /></td>
                    <td data-label={DRAWER.status}>{statusWord(i)}{i.upperBound ? ` ${DRAWER.upperBoundWord}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {after && (
            <dl className="dsec-dl">
              <Row term={DRAWER.soundingsAfterRoute}>
                <span className="soundings-line">
                  <span>{DRAWER.deductibleLeft} <Figure cents={after.deductible} evidence="USER" calc inputs={["USER"]} calcLabel={DRAWER.calculatedShort} waiting={false} /></span>
                  <span>{DRAWER.maximumLeft} {after.unlimited || after.annualMax == null ? <span className="muted">{DRAWER.noMaxApplies}</span> : <Figure cents={after.annualMax} evidence="USER" calc inputs={["USER"]} calcLabel={DRAWER.calculatedShort} waiting={false} />}</span>
                </span>
              </Row>
            </dl>
          )}
        </Section>
      )}
      <Section k="evidence" title={DRAWER.sAfterRoute}>
        {estimate?.ledger.order_note && <p className="note"><strong>{DRAWER.orderNote}.</strong> {estimate.ledger.order_note}</p>}
        {estimate && estimate.assumptions.length > 0 && <p className="note"><EvidenceBadge status="ASSUMED" /> {estimate.assumptions.join("; ")}</p>}
        <p className="dsec-lede">{island.stageIds.length ? DRAWER.afterRouteStages(island.stageIds.length) : DRAWER.noAfterRoute}</p>
        {stagesAfter.length > 0 && (
          <ul className="dsec-list harbor-stages">
            {stagesAfter.map((p) => <li key={p.id}>{DRAWER.stageProgress(p.title, p.completed, p.total)}</li>)}
          </ul>
        )}
        <p className="could-change">{estimate?.ledger.could_change ?? UI.couldChange}</p>
      </Section>
    </>
  );
}

export default HarborSections;
