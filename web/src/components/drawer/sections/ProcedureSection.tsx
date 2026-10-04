import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { itemFeeCents } from "@/lib/drawer";
import { stitchForCite } from "@/lib/stitches";
import type { Evidence } from "@/lib/types";
import { docOf, Fact, Figure, Row, Section, type SectionProps } from "./shared";

/**
 * Section 1 · Procedure (spec §4.4): name line, identifier (code as written on the estimate wins over the code printed in the document),
 * dates with their source words, the dentist's fee (USER, item source) and the plan category with its badge and stitch. Always rendered.
 */
export function ProcedureSection({ island, item, rule, plan, stitches, onSelectStitch }: SectionProps) {
  const doc = docOf(plan);
  const printed = rule?.code_as_printed ?? null;
  const dates: { word: string; value: string }[] = [];
  if (item?.appointment_date) dates.push({ word: DRAWER.dateAppointment, value: item.appointment_date });
  if (item?.planned_prep) dates.push({ word: DRAWER.datePrep, value: item.planned_prep });
  if (item?.planned_completion) dates.push({ word: DRAWER.dateCompletion, value: item.planned_completion });
  const catStatus: Evidence = rule?.category_status ?? (rule?.category ? "DOC" : "UNKNOWN");
  const catStitch = stitchForCite(rule?.category_cite, stitches, doc);
  const statusWord = item ? DRAWER.statusWord(item.status) : null;
  return (
    <Section k="procedure" title={DRAWER.sProcedure}>
      <p className="dsec-lede">
        <strong>{island.title}</strong>
        {item?.tooth ? <> · {DRAWER.toothWord(item.tooth)}</> : null}
        {statusWord ? <> · <span className="muted">{statusWord}</span></> : null}
      </p>
      <dl className="dsec-dl">
        <Row term={DRAWER.identifier}>
          {item?.code_as_written ? (
            <Fact evidence="USER"><span className="mono">{item.code_as_written}</span> <span className="muted">{DRAWER.asWritten}</span></Fact>
          ) : printed ? (
            <Fact evidence="DOC" stitch={catStitch ?? stitchForCite(printed.cite, stitches, doc)} onSelectStitch={onSelectStitch}>
              <span className="mono">{printed.code}</span> <span className="muted">{printed.descriptor}</span>{printed.review ? <span className="muted"> · {UI.reviewCode}</span> : null}
            </Fact>
          ) : (
            <Fact evidence="UNKNOWN"><span className="muted">{DRAWER.noCode}</span></Fact>
          )}
        </Row>
        <Row term={DRAWER.dates}>
          {dates.length ? (
            <ul className="dsec-list">{dates.map((d) => <li key={d.word}><span className="tabular-nums">{d.value}</span> <span className="muted">({d.word})</span></li>)}</ul>
          ) : <span className="muted">{UI.noDate}</span>}
        </Row>
        <Row term={DRAWER.dentistFee} note={item ? <>{item.source}{item.quantity > 1 ? ` · ${DRAWER.quantity(item.quantity)}` : ""}</> : null}>
          <Figure cents={itemFeeCents(item)} evidence="USER" />
        </Row>
        <Row term={DRAWER.planCategory} note={catStatus === "AMBIGUOUS" && rule?.note ? rule.note : null}>
          {rule?.category ? (
            <Fact evidence={catStatus} stitch={catStitch} onSelectStitch={onSelectStitch}>{rule.category}</Fact>
          ) : (
            <Fact evidence="UNKNOWN"><span className="muted">{UI.notStated}</span></Fact>
          )}
        </Row>
      </dl>
    </Section>
  );
}

export default ProcedureSection;
