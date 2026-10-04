import { StitchChip } from "@/components/Primitives";
import { DRAWER } from "@/lib/copy/drawer";
import { stitchForCheckpoint } from "@/lib/drawer";
import { money } from "@/lib/stitches";
import { docOf, Figure, Row, Section, type SectionProps } from "./shared";

/**
 * Section 4 · Coverage share (spec §4.4): the sentence the rule row states ("Your plan lists Type II at 60% of the allowed amount after the
 * deductible.") with its stitch, the plan share and your share from the trail's split, and a two-segment bar (8 px, water for the plan,
 * sand for you, labels in ink; `role="img"` carrying the same sentence). Omitted when the rule row has no plan-pays percentage.
 */
export function CoverageShareSection({ trail, rule, plan, stitches, onSelectStitch }: SectionProps) {
  if (rule?.plan_pays_pct == null) return null;
  const share = trail?.steps.find((s) => s.key === "share");
  const stitch = stitchForCheckpoint("CO", share?.stitch ?? null, rule, plan, stitches);
  const planPct = share?.split?.planPct ?? rule.plan_pays_pct;
  const youPct = 100 - planPct;
  const split = share?.split;
  const category = rule.category ?? docOf(plan);
  return (
    <Section k="share" title={DRAWER.sShare}>
      <p className="dsec-lede">
        {DRAWER.shareSentence(category, rule.plan_pays_pct)} {stitch ? <StitchChip stitch={stitch} onSelect={onSelectStitch} /> : null}
      </p>
      {split && (
        <>
          <dl className="dsec-dl">
            <Row term={DRAWER.planShare} note={`${planPct}%`}>
              <Figure cents={split.plan} evidence="DOC" stitch={stitch} onSelectStitch={onSelectStitch} className="fig-plan" />
            </Row>
            <Row term={DRAWER.yourShare} note={`${youPct}%`}>
              <Figure cents={split.patient} evidence="DOC" stitch={stitch} onSelectStitch={onSelectStitch} className="fig-patient" />
            </Row>
          </dl>
          <div className="share-bar" role="img" aria-label={DRAWER.shareBar(planPct, money(split.plan), money(split.patient))}>
            <span className="share-bar-plan" style={{ flexBasis: `${planPct}%` }} />
            <span className="share-bar-you" style={{ flexBasis: `${youPct}%` }} />
          </div>
          <p className="share-bar-legend" aria-hidden="true">
            <span><span className="share-swatch share-swatch-plan" /> {DRAWER.planShare} {planPct}%</span>
            <span><span className="share-swatch share-swatch-you" /> {DRAWER.yourShare} {youPct}%</span>
          </p>
        </>
      )}
      {share && <p className="dsec-note">{share.explanation}</p>}
    </Section>
  );
}

export default CoverageShareSection;
