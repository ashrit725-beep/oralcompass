import { DRAWER } from "@/lib/copy/drawer";
import { claimsOf } from "@/lib/drawer";
import { Fact, Figure, Row, Section, type SectionProps } from "./shared";

/**
 * A visited island (spec §3.2): the claim figures as the benefit statement recorded them, every figure USER with the statement date; nothing
 * is recomputed and nothing here enters the pipeline or any total. Claims come from `island.claim` or, by id, from `benefits.claims`.
 */
export function VisitedSection({ island, benefits }: SectionProps) {
  const claim = island.claim ?? claimsOf(benefits?.claims).find((c) => c.id === island.itemId || c.id === island.id) ?? null;
  const date = benefits?.source?.date ?? benefits?.last_updated ?? "";
  return (
    <Section k="procedure" title={DRAWER.sClaim} className="dsec-first">
      <p className="dsec-note">{DRAWER.visitedNote(date || (claim?.date ?? ""))}</p>
      {claim ? (
        <dl className="dsec-dl">
          <Row term={DRAWER.claimDate}><Fact evidence="USER"><span className="tabular-nums">{claim.date}</span></Fact></Row>
          <Row term={DRAWER.sProcedure}><Fact evidence="USER">{island.title}{claim.tooth ? ` · ${DRAWER.toothWord(claim.tooth)}` : ""}</Fact></Row>
          <Row term={DRAWER.dentistFee}><Figure cents={claim.dentist_fee_cents ?? null} evidence="USER" waiting={false} /></Row>
          <Row term={DRAWER.allowedAmount}><Figure cents={claim.allowed_cents ?? null} evidence="USER" waiting={false} /></Row>
          <Row term={DRAWER.planPaid}><Figure cents={claim.plan_paid_cents ?? null} evidence="USER" waiting={false} /></Row>
          <Row term={DRAWER.youPaid}><Figure cents={claim.patient_paid_cents ?? null} evidence="USER" waiting={false} /></Row>
          <Row term={DRAWER.deductibleApplied}><Figure cents={claim.deductible_applied_cents ?? null} evidence="USER" waiting={false} /></Row>
          <Row term={DRAWER.recordSource}><Fact evidence="USER">{claim.source ?? island.item?.source ?? ""}</Fact></Row>
        </dl>
      ) : (
        <dl className="dsec-dl">
          <Row term={DRAWER.sProcedure}><Fact evidence="USER">{island.title}{island.subtitle ? ` · ${island.subtitle}` : ""}</Fact></Row>
          {island.item && <Row term={DRAWER.dentistFee}><Figure cents={island.item.dentist_fee_cents} evidence="USER" waiting={false} /></Row>}
          {island.item && <Row term={DRAWER.recordSource}><Fact evidence="USER">{island.item.source}</Fact></Row>}
        </dl>
      )}
    </Section>
  );
}

export default VisitedSection;
