import { MissingInputs } from "@/components/CostTrail";
import { EvidenceBadge } from "@/components/Primitives";
import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { money, stitchesForLine, uniqueStitches } from "@/lib/stitches";
import type { IslandVM, PassageVM, Stitch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Figure, Row, Section, type SectionProps } from "./shared";

const statusWord = (i: IslandVM) => (i.state === "estimate" ? DRAWER.statusEstimate : i.state === "not_covered" ? DRAWER.statusNotCovered : i.state === "unresolved" ? DRAWER.statusUnresolved : DRAWER.statusPending);

/**
 * The Harbor Light's sections (spec §3.4): the route totals (you pay / plan pays, upper bound, "—" + Waiting for information when unresolved),
 * the per-island table (name, you pay, plan pays, status), the soundings after the last island, the processing-order note, the engine's
 * assumptions and movers range, the "could change" sentence, and the count of care stages after the route. Visited islands' claim figures
 * never enter these totals.
 */
export function HarborSections({ island, vm, estimate, stitches, onSelectStitch }: SectionProps & { vm: PassageVM }) {
  const unresolved = !estimate || estimate.status === "unresolved";
  const chips: Stitch[] = estimate ? uniqueStitches(estimate.ledger.lines.flatMap((l) => stitchesForLine(l, stitches))) : [];
  const last = vm.islands[vm.islands.length - 1];
  const after = last?.soundingsAfter ?? null;
  return (
    <>
      <Section k="finalCost" title={DRAWER.sTotals} className="dsec-first">
        <p className={cn("final-hero", unresolved && "final-hero-unresolved")}>
          <span className="final-hero-term">{DRAWER.routeYouPay}</span>
          <Figure cents={unresolved ? null : vm.totals.youPay} evidence="DOC" hero stitches={chips.slice(0, 3)} onSelectStitch={onSelectStitch} className="final-hero-amt" />
        </p>
        <p className="final-sub">
          <span>{DRAWER.routePlanPays}</span>{" "}
          <Figure cents={unresolved ? null : vm.totals.planPays} evidence="DOC" stitch={chips[0]} onSelectStitch={onSelectStitch} className="fig-plan" />
          {vm.totals.upperBound ? <span className="muted"> {DRAWER.upperBoundWord}</span> : null}
        </p>
        {estimate?.movers?.range && estimate.movers.range[0] !== estimate.movers.range[1] && (
          <p className="range"><EvidenceBadge status="UNKNOWN" /> {UI.rangeBecause(money(estimate.movers.range[0]), money(estimate.movers.range[1]), estimate.movers.movers.filter((m) => m.impact_cents).map((m) => m.unknown).join(" and "))}</p>
        )}
        {estimate && estimate.status === "unresolved" && <MissingInputs estimate={estimate} compact />}
      </Section>
      {vm.islands.length > 0 && (
        <Section k="calculation" title={DRAWER.sPerIsland}>
          <table className="harbor-table">
            <thead><tr><th scope="col">{DRAWER.island}</th><th scope="col">{DRAWER.youPay}</th><th scope="col">{DRAWER.planPaysLede}</th><th scope="col">{DRAWER.status}</th></tr></thead>
            <tbody>
              {vm.islands.map((i) => (
                <tr key={i.id} className={`island-${i.state}`}>
                  <th scope="row">{i.title}{i.subtitle ? <span className="muted"> · {i.subtitle}</span> : null}</th>
                  <td><Figure cents={i.youPay} evidence={i.state === "estimate" || i.state === "not_covered" ? "DOC" : "UNKNOWN"} waiting={false} /></td>
                  <td><Figure cents={i.planPays} evidence={i.state === "estimate" || i.state === "not_covered" ? "DOC" : "UNKNOWN"} waiting={false} /></td>
                  <td>{statusWord(i)}{i.upperBound ? ` ${DRAWER.upperBoundWord}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {after && (
            <dl className="dsec-dl">
              <Row term={DRAWER.soundingsAfterRoute}>
                <span className="soundings-line">
                  <span>{DRAWER.deductibleLeft} <Figure cents={after.deductible} evidence="USER" waiting={false} /></span>
                  <span>{DRAWER.maximumLeft} {after.unlimited || after.annualMax == null ? <span className="muted">{DRAWER.noMaxApplies}</span> : <Figure cents={after.annualMax} evidence="USER" waiting={false} />}</span>
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
        <p className="could-change">{estimate?.ledger.could_change ?? UI.couldChange}</p>
      </Section>
    </>
  );
}

export default HarborSections;
