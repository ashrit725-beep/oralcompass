import { DRAWER } from "@/lib/copy/drawer";
import { claimsOf, clockWords } from "@/lib/drawer";
import { stitchForCite } from "@/lib/stitches";
import { docOf, Fact, Flag, Row, Section, type SectionProps } from "./shared";

/**
 * Section 6 · Frequency (spec §4.4): one sentence per frequency rule ("covered 2 per calendar year") with its stitch, the service dates for
 * this procedure on the benefit statement (USER) or "None recorded", and, when the line is closed by a frequency limit, the engine's own
 * step label verbatim. Collapsed by default on the phone. Omitted when the rule has no frequency clause and no F step.
 */
export function FrequencySection({ line, item, rule, plan, benefits, stitches, onSelectStitch, mobile }: SectionProps) {
  const doc = docOf(plan);
  const freq = rule?.frequency ?? [];
  const closed = line?.status === "not_covered" && line.steps[0]?.rule === "F" ? line.steps[0] : null;
  if (freq.length === 0 && !closed) return null;
  const key = item?.procedure_key ?? line?.procedure_key ?? rule?.procedure_key;
  const dates = claimsOf(benefits?.claims).filter((c) => c.procedure_key === key).map((c) => c.date).sort();
  return (
    <Section k="frequency" title={DRAWER.sFrequency} collapsible={mobile} defaultOpen={!mobile}>
      {closed && <Flag text={closed.label} />}
      <ul className="dsec-list dsec-rules">
        {freq.map((f, i) => (
          <li key={i}>
            <Fact evidence={f.cite ? "DOC" : "UNKNOWN"} stitch={stitchForCite(f.cite, stitches, doc)} onSelectStitch={onSelectStitch}>
              {DRAWER.frequencySentence(f.n, clockWords(f.clock, f.n))}
            </Fact>
          </li>
        ))}
      </ul>
      <dl className="dsec-dl">
        <Row term={DRAWER.serviceDates}>
          {dates.length ? <Fact evidence="USER"><span className="tabular-nums">{dates.join(", ")}</span></Fact> : <span className="muted">{DRAWER.noServiceDates}</span>}
        </Row>
      </dl>
    </Section>
  );
}

export default FrequencySection;
