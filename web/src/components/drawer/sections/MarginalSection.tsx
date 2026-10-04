import { RuleGlyph } from "@/components/pipeline/RuleGlyph";
import { DRAWER } from "@/lib/copy/drawer";
import { clockWords } from "@/lib/drawer";
import { stitchForCite } from "@/lib/stitches";
import { docOf, Fact, Row, Section, type SectionProps } from "./shared";

/**
 * A marginal island (spec §3.2): a procedure mentioned at the consultation but not on the treatment plan. The drawer shows the coverage RULE
 * only, never an amount: not covered → one closed checkpoint with the exclusion stitch; covered → class, plan-pays %, deductible applicability
 * and frequency as rules, with the sentence that no estimate is calculated because no fee or allowed amount is recorded.
 */
export function MarginalSection({ island, rule, plan, stitches, onSelectStitch }: SectionProps) {
  const doc = docOf(plan);
  const excluded = rule ? rule.covered === false : false;
  return (
    <Section k="procedure" title={DRAWER.sRule} className="dsec-first">
      <p className="dsec-lede"><strong>{island.title}</strong>{island.subtitle ? <span className="muted"> · {island.subtitle}</span> : null}</p>
      {excluded ? (
        <>
          <p className="closed-line"><RuleGlyph rule="X" className="text-terracotta" /> <Fact evidence="DOC" stitch={stitchForCite(rule?.exclusion?.cite, stitches, doc)} onSelectStitch={onSelectStitch}>{DRAWER.marginalNotCovered}</Fact></p>
          {rule?.exclusion?.cite?.quote && <figure className="wording"><blockquote>“{rule.exclusion.cite.quote}”</blockquote><figcaption>{rule.exclusion.cite.doc ?? doc}, page {rule.exclusion.cite.page}</figcaption></figure>}
          <p className="dsec-note">{DRAWER.marginalSentence}</p>
        </>
      ) : rule ? (
        <>
          <dl className="dsec-dl">
            <Row term={DRAWER.planCategory}><Fact evidence={rule.category_status ?? "DOC"} stitch={stitchForCite(rule.category_cite, stitches, doc)} onSelectStitch={onSelectStitch}>{rule.category ?? DRAWER.waitingInfo}</Fact></Row>
            {rule.plan_pays_pct != null && <Row term={DRAWER.planPaysPct}><Fact evidence="DOC" stitch={stitchForCite(rule.coverage_cite, stitches, doc)} onSelectStitch={onSelectStitch}>{rule.plan_pays_pct}%</Fact></Row>}
            {rule.deductible_applies != null && <Row term={DRAWER.deductibleApplies}><Fact evidence="DOC" stitch={stitchForCite(rule.deductible_cite, stitches, doc)} onSelectStitch={onSelectStitch}>{rule.deductible_applies ? DRAWER.applies : DRAWER.waivedFor(rule.category ?? "")}</Fact></Row>}
            {(rule.frequency ?? []).map((f, i) => <Row key={i} term={DRAWER.sFrequency}><Fact evidence={f.cite ? "DOC" : "UNKNOWN"} stitch={stitchForCite(f.cite, stitches, doc)} onSelectStitch={onSelectStitch}>{DRAWER.frequencySentence(f.n, clockWords(f.clock, f.n))}</Fact></Row>)}
          </dl>
          <p className="dsec-note">{DRAWER.marginalSentence} {DRAWER.marginalCovered}</p>
        </>
      ) : (
        <p className="dsec-note"><Fact evidence="UNKNOWN">{DRAWER.marginalSentence}</Fact></p>
      )}
    </Section>
  );
}

export default MarginalSection;
