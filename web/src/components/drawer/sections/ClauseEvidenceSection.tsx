import { Button } from "@/components/ui/button";
import { PlainWords } from "@/components/PlainWords";
import { StitchChip } from "@/components/Primitives";
import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { citeForRule } from "@/lib/drawer";
import { stitchesForLine, stitchForCite, uniqueStitches } from "@/lib/stitches";
import type { CheckpointRule } from "@/lib/types";
import { docOf, Section, type SectionProps } from "./shared";

const RULE_CITES: CheckpointRule[] = ["N", "AB", "D", "CO", "M", "X", "W", "F"];

/**
 * Section 12 · Clause evidence (spec §4.4): every clause behind this line (the engine steps' stitches plus the rule row's cites), each as
 * a stitch chip with its quote and `doc, page`; pressing a chip opens the ClauseCard (`thread-pull`); "Open in Documents" sets the tab.
 * When the document is not stored, the official source link is offered instead of a rendered page. Each clause carries its "Plain words"
 * line (PlainWords: the clause explainer, lazy and cached per clause; the PLAIN template on any error).
 */
export function ClauseEvidenceSection({ line, rule, plan, estimate, stitches, onSelectStitch, onOpenDocuments }: SectionProps) {
  const doc = docOf(plan);
  const fromSteps = line ? stitchesForLine(line, stitches, rule ? { coverageCite: rule.coverage_cite } : undefined) : [];
  const fromRules = RULE_CITES.map((r) => stitchForCite(citeForRule(r, rule, plan), stitches, doc));
  const list = uniqueStitches([...fromSteps, ...fromRules, stitchForCite(rule?.category_cite, stitches, doc)]);
  const hasPdf = estimate?.sources?.plan_document?.has_stored_pdf ?? !!plan.source_document.path;
  const url = plan.source_document.url ?? null;
  const planRef = estimate?.plan_code ?? plan.plan_code;          // the explainer's plan reference ("ML26" or "upload:<id>")
  return (
    <Section k="evidence" title={DRAWER.sEvidence}>
      <p className="dsec-note">{DRAWER.evidenceIntro}</p>
      {list.length === 0 ? <p className="muted">{DRAWER.noClauses}</p> : (
        <ul className="evidence-list">
          {list.map((s) => (
            <li key={s.id} className="evidence-item">
              <StitchChip stitch={s} onSelect={onSelectStitch} />
              <q className="evidence-quote">{s.quote}</q>
              <span className="evidence-where">{s.doc}, {s.pageNote ?? `p.${s.page}`}</span>
              <PlainWords planRef={planRef} stitch={s} compact className="evidence-plain" />
            </li>
          ))}
        </ul>
      )}
      <div className="evidence-actions">
        <Button type="button" variant="outline" size="touch" onClick={() => { if (list[0]) onSelectStitch(list[0]); onOpenDocuments(); }}>{DRAWER.openInDocuments}</Button>
        {!hasPdf && url && <a className="evidence-source" href={url} target="_blank" rel="noopener noreferrer">{UI.openSource}</a>}
      </div>
      {!hasPdf && <p className="muted small">{DRAWER.noStoredPdf}</p>}
    </Section>
  );
}

export default ClauseEvidenceSection;
