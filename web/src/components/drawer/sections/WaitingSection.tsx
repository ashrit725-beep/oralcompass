import { DRAWER } from "@/lib/copy/drawer";
import { stitchForCite } from "@/lib/stitches";
import { docOf, Fact, Flag, Row, Section, type SectionProps } from "./shared";

/**
 * Section 7 · Waiting period (spec §4.4): UNKNOWN → the badge, the sentence that the pages do not state one, and the engine flag verbatim;
 * 0 months (DOC) → "no waiting period" with its stitch; n months → the sentence with its stitch plus the coverage start (USER) or UNKNOWN
 * with the two-branch flag. When the line is closed by a waiting period, the engine's step label is shown verbatim. Collapsed on the phone.
 * Omitted when the rule row has no waiting field.
 */
export function WaitingSection({ line, rule, plan, benefits, stitches, onSelectStitch }: SectionProps) {
  const doc = docOf(plan);
  const w = rule?.waiting;
  const closed = line?.status === "not_covered" && line.steps[0]?.rule === "W" ? line.steps[0] : null;
  if (!w && !closed) return null;
  const flags = (line?.flags ?? []).filter((f) => /waiting/i.test(f));
  const stitch = stitchForCite(w?.cite, stitches, doc) ?? stitchForCite(plan.waiting_months?.cite, stitches, doc);
  const category = rule?.category ?? doc;
  return (
    <Section k="waiting" title={DRAWER.sWaiting} collapsible defaultOpen={false}>
      {closed && <Flag text={closed.label} />}
      {w && w.status === "UNKNOWN" && (
        <>
          <p className="dsec-lede"><Fact evidence="UNKNOWN">{DRAWER.waitingUnknown}</Fact></p>
          {w.note && <p className="dsec-note">{w.note}</p>}
          {flags.map((f, i) => <Flag key={i} text={f} />)}
        </>
      )}
      {w && w.status !== "UNKNOWN" && w.months === 0 && (
        <p className="dsec-lede"><Fact evidence={w.status} stitch={stitch} onSelectStitch={onSelectStitch}>{DRAWER.waitingNone}</Fact></p>
      )}
      {w && w.status !== "UNKNOWN" && (w.months ?? 0) > 0 && (
        <>
          <p className="dsec-lede"><Fact evidence={w.status} stitch={stitch} onSelectStitch={onSelectStitch}>{DRAWER.waitingMonths(w.months ?? 0, category)}</Fact></p>
          <dl className="dsec-dl">
            <Row term={DRAWER.coverageStart}>
              {benefits?.coverage_start ? <Fact evidence="USER"><span className="tabular-nums">{benefits.coverage_start}</span></Fact> : <Fact evidence="UNKNOWN"><span className="muted">{DRAWER.waitingInfo}</span></Fact>}
            </Row>
          </dl>
          {!benefits?.coverage_start && flags.map((f, i) => <Flag key={i} text={f} />)}
        </>
      )}
      {w?.note && w.status !== "UNKNOWN" && <p className="dsec-note">{w.note}</p>}
    </Section>
  );
}

export default WaitingSection;
