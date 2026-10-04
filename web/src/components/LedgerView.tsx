import { UI } from "@/lib/copy";
import { PLAN } from "@/lib/copy/plan";
import { ledgerEvidence } from "@/lib/compass-model";
import { money, stitchForStep } from "@/lib/stitches";
import type { Ledger, Movers, Stitch } from "@/lib/types";
import { Money } from "@/components/Money";
import { EvidenceBadge, StitchChip } from "@/components/Primitives";

interface Props { ledger: Ledger; movers?: Movers | null; stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; prominentScope?: boolean }

/** Receipt-shaped Ledger. Every money line renders through <Money> and wears the stitch of the sentence that produced it (or its badge). */
export function LedgerView({ ledger, movers, stitches, selected, onSelect, prominentScope }: Props) {
  const ev = ledgerEvidence(ledger);
  if (ledger.status === "unresolved") {
    return (
      <section className="ledger" aria-labelledby="ledger-h">
        <h2 id="ledger-h">{UI.ledgerTitle}</h2>
        <p className="hero unresolved"><EvidenceBadge status="UNKNOWN" /> {PLAN.cmpUnresolvedFor} {ledger.not_provided.join(", ")}</p>
        {ledger.flags.map((f, i) => <p key={i} className="flag">{f}</p>)}
        {movers?.range && <p className="range">{UI.rangeBecause(money(movers.range[0]), money(movers.range[1]), movers.movers.filter((m) => m.impact_cents).map((m) => m.unknown).join(" and "))}</p>}
      </section>
    );
  }
  return (
    <section className="ledger" aria-labelledby="ledger-h">
      <h2 id="ledger-h">{UI.ledgerTitle}</h2>
      <p className="hero">
        <span className="rail-total"><Money cents={ledger.patient_total_cents} evidence={ev} className="total" /></span>
        <span className="sub">{UI.planPays}: <Money cents={ledger.plan_total_cents} evidence={ev} />{ledger.plan_total_is_upper_bound ? ` ${PLAN.cmpUpperBound}` : ""}</span>
      </p>
      {ledger.lines.map((line, li) => (
        <article key={li} className={`line line-${line.status}`} aria-label={line.label}>
          <h3>{line.label}{line.benefit_year ? <span className="year"> · benefit year {line.benefit_year}</span> : null}</h3>
          <table className="receipt">
            <tbody>
              {line.steps.map((s, si) => {
                const st = stitchForStep(s, stitches);
                return (
                  <tr key={si} className={`owner-${s.owner}`}>
                    <th scope="row">{s.label}</th>
                    <td className="amt-cell"><Money cents={s.cents} evidence={st ? "DOC" : "USER"} signed={s.cents < 0} badge={!st} /></td>
                    <td className="st">{st ? <StitchChip stitch={st} selected={selected?.id === st.id} prominent={prominentScope} onSelect={onSelect} /> : null}</td>
                  </tr>
                );
              })}
              <tr className="line-total"><th scope="row">Line: you pay · plan pays</th><td className="amt-cell"><Money cents={line.patient_cents} evidence={ev} /> · <Money cents={line.plan_cents} evidence={ev} /></td><td /></tr>
              {line.remaining_after?.annual_max_cents != null && (
                <tr className="remaining"><th scope="row">Remaining after this line: deductible · annual maximum</th><td className="amt-cell"><Money cents={line.remaining_after.deductible_cents} evidence={ev} /> · <Money cents={line.remaining_after.annual_max_cents} evidence={ev} /></td><td /></tr>
              )}
            </tbody>
          </table>
          {line.flags.map((f, i) => <p key={i} className="flag">{f}</p>)}
        </article>
      ))}
      {ledger.order_note && <p className="note">{ledger.order_note}</p>}
      {ledger.assumptions.length > 0 && <p className="note"><EvidenceBadge status="ASSUMED" /> {ledger.assumptions.join("; ")}</p>}
      {ledger.not_provided.length > 0 && <p className="note"><EvidenceBadge status="UNKNOWN" /> {ledger.not_provided.join(", ")}</p>}
      {movers && movers.movers.length > 0 && (
        <table className="movers" aria-label="What moves these numbers">
          <caption>What moves these numbers</caption>
          <thead><tr><th scope="col">Not provided</th><th scope="col">Changes the total by up to</th></tr></thead>
          <tbody>{movers.movers.map((m) => (
            <tr key={m.unknown}><th scope="row">{m.unknown}</th><td className="amt-cell">{m.impact_cents == null ? <><span>unresolved</span> <EvidenceBadge status="UNKNOWN" /></> : m.zero_impact ? "does not change your numbers this year" : <Money cents={m.impact_cents} evidence="ASSUMED" />}</td></tr>
          ))}</tbody>
        </table>
      )}
      <p className="could-change">{ledger.could_change}</p>
    </section>
  );
}
