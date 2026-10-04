import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { conditionWords, stitchForCheckpoint } from "@/lib/drawer";
import { Fact, Figure, Flag, Row, Section, type SectionProps } from "./shared";

interface Condition { procedure_key: string; condition: string; basis_key: string | null; text?: string }
const humanize = (k: string | null) => (k ? k.replace(/_/g, " ") : DRAWER.basisUnnamed);

/**
 * Section 8 · Alternate benefit (downgrade) (spec §4.4): UNKNOWN → badge + the absence sentence + the engine flag; DOC with conditions →
 * "When a crown is placed on a molar, the plan pays on the allowance for cast crown." with its stitch, then what applied to this line (the
 * AB basis step and the difference step from the trail, or "Does not apply to tooth N."); the upper-bound flag when the plan's share is one.
 * Collapsed on the phone. Omitted when the rule row has no alternate-benefit field.
 */
export function AlternateBenefitSection({ line, item, trail, rule, plan, stitches, onSelectStitch, mobile }: SectionProps) {
  const ab = rule?.alternate_benefit;
  if (!ab) return null;
  const key = item?.procedure_key ?? line?.procedure_key ?? rule?.procedure_key;
  const conditions = ((ab.conditions ?? plan.alternate_benefit?.conditions ?? []) as Condition[]).filter((c) => !key || c.procedure_key === key);
  const altStep = trail?.steps.find((s) => s.key === "alternate");
  const stitch = stitchForCheckpoint("AB", altStep?.stitch ?? null, rule, plan, stitches);
  const flags = (line?.flags ?? []).filter((f) => /alternate/i.test(f));
  const diff = altStep?.change != null ? -altStep.change : null;
  return (
    <Section k="alternate" title={DRAWER.sAlternate} collapsible={mobile} defaultOpen={!mobile}>
      {ab.status === "UNKNOWN" ? (
        <>
          <p className="dsec-lede"><Fact evidence="UNKNOWN">{DRAWER.alternateUnknown}</Fact></p>
          {ab.note && <p className="dsec-note">{ab.note}</p>}
          {flags.map((f, i) => <Flag key={i} text={f} />)}
        </>
      ) : (
        <>
          {conditions.length ? conditions.map((c, i) => (
            <p key={i} className="dsec-lede"><Fact evidence={ab.status} stitch={stitch} onSelectStitch={onSelectStitch}>{DRAWER.alternateSentence(conditionWords(c.condition), humanize(c.basis_key))}</Fact></p>
          )) : <p className="dsec-lede"><Fact evidence={ab.status} stitch={stitch} onSelectStitch={onSelectStitch}>{DRAWER.alternateNoConditions}</Fact></p>}
          <dl className="dsec-dl">
            {altStep ? (
              <>
                <Row term={DRAWER.alternateBasis} note={altStep.explanation}>
                  <Figure cents={altStep.change} evidence="DOC" signed stitch={stitch} onSelectStitch={onSelectStitch} className="fig-basis" />
                </Row>
                <Row term={DRAWER.alternateDifference}>
                  <Figure cents={diff} evidence="DOC" stitch={stitch} onSelectStitch={onSelectStitch} className="fig-patient" />
                </Row>
              </>
            ) : (
              <Row term={DRAWER.appliedToLine}>
                <Fact evidence={ab.status} stitch={stitch} onSelectStitch={onSelectStitch}>{item?.tooth ? DRAWER.notApplyTooth(item.tooth) : DRAWER.notApplyLine}</Fact>
              </Row>
            )}
          </dl>
          {ab.note && <p className="dsec-note">{ab.note}</p>}
          {flags.map((f, i) => <Flag key={i} text={f} />)}
        </>
      )}
      {(line?.plan_is_upper_bound || trail?.upperBound) && <Flag text={UI.upperBound} />}
    </Section>
  );
}

export default AlternateBenefitSection;
