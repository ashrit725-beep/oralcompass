import { UI } from "../lib/copy";
import { money, stitchForStep } from "../lib/stitches";
import type { Ledger, Movers, Stitch } from "../lib/types";
import { EvidenceBadge, StitchChip } from "./Primitives";

interface Props { ledger: Ledger; movers?: Movers | null; stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; prominentScope?: boolean }

/** Receipt-shaped Ledger. Every money line wears the stitch of the sentence that produced it. */
export function LedgerView({ ledger, movers, stitches, selected, onSelect, prominentScope }: Props) {
  if (ledger.status === "unresolved") {
    return (
      <section className="ledger" aria-labelledby="ledger-h">
        <h2 id="ledger-h">{UI.ledgerTitle}</h2>
        <p className="hero unresolved"><EvidenceBadge status="UNKNOWN" /> {UI.unresolved} {ledger.not_provided.join(", ")}</p>
        {ledger.flags.map((f, i) => <p key={i} className="flag">{f}</p>)}
        {movers?.range && <p className="range">{UI.rangeBecause(money(movers.range[0]), money(movers.range[1]), movers.movers.filter(m => m.impact_cents).map(m => m.unknown).join(" and "))}</p>}
      </section>
    );
  }
  return (
    <section className="ledger" aria-labelledby="ledger-h">
      <h2 id="ledger-h">{UI.ledgerTitle}</h2>
      <p className="hero" aria-live="polite">
        <span className="total">{money(ledger.patient_total_cents)}</span>
        <span className="sub">{UI.planPays}: {money(ledger.plan_total_cents)}{ledger.plan_total_is_upper_bound ? " (upper bound)" : ""}</span>
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
                    <td className="amt">{s.cents < 0 ? `−${money(-s.cents)}` : money(s.cents)}</td>
                    <td className="st">{st ? <StitchChip stitch={st} selected={selected?.id === st.id} prominent={prominentScope} onSelect={onSelect} /> : <EvidenceBadge status="USER" />}</td>
                  </tr>
                );
              })}
              <tr className="line-total"><th scope="row">Line: you pay · plan pays</th><td className="amt">{money(line.patient_cents)} · {money(line.plan_cents)}</td><td /></tr>
              {line.remaining_after?.annual_max_cents != null && (
                <tr className="remaining"><th scope="row">Remaining after this line: deductible · annual maximum</th><td className="amt">{money(line.remaining_after.deductible_cents)} · {money(line.remaining_after.annual_max_cents)}</td><td /></tr>
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
            <tr key={m.unknown}><th scope="row">{m.unknown}</th><td className="amt">{m.impact_cents == null ? "unresolved" : m.zero_impact ? "does not change your numbers this year" : money(m.impact_cents)}</td></tr>
          ))}</tbody>
        </table>
      )}
      <p className="could-change">{ledger.could_change}</p>
    </section>
  );
}
