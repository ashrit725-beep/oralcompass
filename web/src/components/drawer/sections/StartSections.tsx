import { BenefitsCompass } from "@/components/compass/BenefitsCompass";
import { MissingInputs } from "@/components/CostTrail";
import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { BenefitStatementForm } from "@/components/records/BenefitStatementForm";
import { networkWord } from "@/lib/drawer";
import type { Evidence } from "@/lib/types";
import { Fact, Figure, Row, Section, type SectionProps } from "./shared";

/**
 * The START harbor's sections (spec §3.4): the plan facts (title, document version, fictional ribbon, network word with its status), the
 * records facts (benefit statement source and date, remaining deductible and annual maximum with the server's derivation sentences, conflict
 * note), the compact Benefits compass, the Benefit statement form, and the missing-inputs list when the estimate has no lines.
 * The Benefit statement form is the plan agent's `components/records/BenefitStatementForm.tsx` (imported statically since integration: the
 * module also sits in the main chunk through LandmarkContent, so a lazy import would not split it).
 */

export function StartSections({ plan, benefits, estimate, stitches, onSelectStitch, onRecordsChanged }: SectionProps & { onOpenLandmark?: (id: never) => void }) {
  const planRef = estimate?.plan_code ?? plan.plan_code;
  const net = estimate?.inputs.network ?? null;
  const netStatus: Evidence = estimate?.inputs.network_status ?? "UNKNOWN";
  const noLines = !!estimate && estimate.status === "unresolved" && estimate.ledger.lines.length === 0;
  return (
    <>
      <Section k="procedure" title={DRAWER.sPlan}>
        <dl className="dsec-dl">
          <Row term={DRAWER.planTitle}>{plan.title}{plan.is_fictional ? <span className="ribbon">{UI.fictional}</span> : null}</Row>
          <Row term={DRAWER.planVersion}><span className="scope">{plan.source_document.version_label}</span> <span className="muted">{plan.source_document.title}</span></Row>
          <Row term={DRAWER.networkStatus}>
            {networkWord(net) ? <Fact evidence={netStatus}>{networkWord(net)}</Fact> : <Fact evidence="UNKNOWN"><span className="muted">{DRAWER.networkNotProvided}</span></Fact>}
          </Row>
          {benefits?.coverage_start ? <Row term={DRAWER.coverageStart}><Fact evidence="USER"><span className="tabular-nums">{benefits.coverage_start}</span></Fact></Row> : null}
        </dl>
      </Section>
      <Section k="allowance" title={DRAWER.sRecords}>
        {benefits ? (
          <dl className="dsec-dl">
            <Row term={DRAWER.statementSource}><Fact evidence="USER">{benefits.source?.label ?? UI.usageNotFromPlan}{benefits.source?.date ? <span className="muted"> · {benefits.source.date}</span> : null}</Fact></Row>
            <Row term={DRAWER.remainingDeductible} note={benefits.derivation?.remaining_deductible}><Figure cents={benefits.remaining_deductible_cents} evidence="USER" /></Row>
            <Row term={DRAWER.remainingMax} note={benefits.derivation?.remaining_max}>
              {benefits.annual_max_unlimited ? <Fact evidence={plan.annual_max.status}>{DRAWER.unlimited}</Fact> : <Figure cents={benefits.remaining_max_cents} evidence="USER" />}
            </Row>
            {benefits.conflict && <Row term={UI.conflictTitle}><Fact evidence="CONFLICT">{benefits.conflict.note}</Fact></Row>}
          </dl>
        ) : <p className="muted"><Fact evidence="UNKNOWN">{DRAWER.noBenefits}</Fact></p>}
        <BenefitsCompass plan={plan} benefits={benefits} estimate={estimate} stitches={stitches} compact onOpenLandmark={() => undefined} onSelectStitch={onSelectStitch} />
      </Section>
      {noLines && estimate && <MissingInputs estimate={estimate} />}
      <Section k="deductible" title={DRAWER.sBenefitsForm} collapsible defaultOpen={noLines}>
        <p className="dsec-note">{DRAWER.benefitsFormNote}</p>
        <BenefitStatementForm planRef={planRef} plan={plan} benefits={benefits} onSaved={() => { onRecordsChanged?.(); window.dispatchEvent(new CustomEvent("oralcompass:records-changed")); }} />
      </Section>
    </>
  );
}

export default StartSections;
