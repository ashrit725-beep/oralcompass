import { useState } from "react";
import { UI } from "../lib/copy";
import { money, signed, stitchForLabel } from "../lib/stitches";
import { buildTrail } from "../lib/trail";
import type { LedgerLine, SavedEstimate, Stitch } from "../lib/types";
import { EvidenceBadge, StitchChip } from "./Primitives";

interface Props { estimate: SavedEstimate; stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; prominentScope?: boolean }

/**
 * The lighthouse: one procedure at a time, a fixed trail from the dentist's fee to what you pay.
 * Each step shows amount in → rule → change → amount out, the explanation and the clause stitch. Amounts are checked to reconcile.
 */
export function CostTrail({ estimate, stitches, selected, onSelect, prominentScope }: Props) {
  const lines = estimate.ledger.lines;
  const [idx, setIdx] = useState(0);
  if (estimate.status === "unresolved" && lines.length === 0) {
    return <MissingInputs estimate={estimate} />;
  }
  const line: LedgerLine | undefined = lines[Math.min(idx, lines.length - 1)];
  if (!line) return <MissingInputs estimate={estimate} />;
  const trail = buildTrail(line);
  return (
    <section className="trail" aria-labelledby="trail-h">
      <h3 id="trail-h">{UI.ledgerTitle}</h3>
      <p className="hero" aria-live="polite">
        <span className="total">{money(estimate.user_estimated_payment_cents)}</span>
        <span className="sub">{UI.planPays}: {money(estimate.insurer_estimated_payment_cents)}{estimate.plan_payment_is_upper_bound ? " (upper bound)" : ""}</span>
      </p>
      {estimate.status === "unresolved" && <MissingInputs estimate={estimate} compact />}
      {lines.length > 1 && (
        <div className="line-tabs" role="tablist" aria-label="Procedures on this estimate">
          {lines.map((l, i) => (
            <button key={i} role="tab" type="button" aria-selected={i === idx} className={i === idx ? "is-on" : ""} onClick={() => setIdx(i)}>
              {l.label} <small>{l.status === "estimate" ? money(l.patient_cents) : l.status === "not_covered" ? "not covered" : "unresolved"}</small>
            </button>
          ))}
        </div>
      )}
      <ol className="trail-steps" aria-label={`Cost trail for ${line.label}`}>
        {trail.steps.map((s, i) => {
          const st = stitchForLabel(s.stitch, s.rule, stitches);
          return (
            <li key={s.key} className={`trail-step owner-${s.owner} ${s.key === "you" ? "is-total" : ""}`}>
              <div className="ts-head">
                <span className="ts-n" aria-hidden="true">{i + 1}</span>
                <h4>{s.title}</h4>
                {st ? <StitchChip stitch={st} selected={selected?.id === st.id} prominent={prominentScope} onSelect={onSelect} /> : s.rule === "fee" ? <EvidenceBadge status="USER" /> : null}
              </div>
              <dl className="ts-amounts">
                {s.amountIn != null && <><dt>Amount in</dt><dd className="amt">{money(s.amountIn)}</dd></>}
                {s.change != null && <><dt>Change</dt><dd className={`amt ${s.change < 0 ? "neg" : ""}`}>{signed(s.change)}</dd></>}
                {s.split && <><dt>Split</dt><dd className="amt">plan {money(s.split.plan)} ({s.split.planPct}%) · you {money(s.split.patient)} ({100 - s.split.planPct}%)</dd></>}
                {s.amountOut != null && <><dt>{s.key === "you" ? "You pay" : "Amount out"}</dt><dd className="amt out">{money(s.amountOut)}</dd></>}
              </dl>
              <p className="ts-why">{s.explanation}</p>
              {st && <p className="ts-clause"><q>{st.quote}</q> <span className="where">— {st.doc}, {st.pageNote ?? `p.${st.page}`}</span></p>}
            </li>
          );
        })}
      </ol>
      {trail.reconciles === true && <p className="reconcile ok">✓ {UI.reconciles}</p>}
      {trail.reconciles === false && <p className="reconcile warn" role="alert">Amounts do not reconcile in this view — the engine ledger is authoritative; see the receipt below.</p>}
      {trail.upperBound && <p className="flag">{UI.upperBound}</p>}
      {line.flags.map((f, i) => <p key={i} className="flag">{f}</p>)}
      {line.remaining_after?.deductible_cents != null && (
        <p className="note">Remaining after this line — deductible {money(line.remaining_after.deductible_cents)} · annual maximum {line.remaining_after.annual_max_cents == null ? "no maximum applies" : money(line.remaining_after.annual_max_cents)}</p>
      )}
      <details className="receipt-details">
        <summary>Engine receipt (every step, as computed)</summary>
        <table className="receipt"><tbody>
          {line.steps.map((s, i) => <tr key={i} className={`owner-${s.owner}`}><th scope="row">{s.label}</th><td className="amt">{s.cents < 0 ? `−${money(-s.cents)}` : money(s.cents)}</td><td className="st">{s.stitch ?? ""}</td></tr>)}
          <tr className="line-total"><th scope="row">Line: you pay · plan pays</th><td className="amt">{money(line.patient_cents)} · {money(line.plan_cents)}</td><td /></tr>
        </tbody></table>
      </details>
      {estimate.ledger.order_note && <p className="note">{estimate.ledger.order_note}</p>}
      {estimate.assumptions.length > 0 && <p className="note"><EvidenceBadge status="ASSUMED" /> {estimate.assumptions.join("; ")}</p>}
      <p className="could-change">{estimate.ledger.could_change}</p>
    </section>
  );
}

export function MissingInputs({ estimate, compact }: { estimate: SavedEstimate; compact?: boolean }) {
  return (
    <section className={`missing ${compact ? "compact" : ""}`} aria-labelledby="missing-h">
      <h3 id="missing-h"><EvidenceBadge status="UNKNOWN" /> {UI.missingTitle}</h3>
      {!compact && <p>{UI.missingIntro}</p>}
      <ul>
        {estimate.missing_inputs.map((m, i) => <li key={i}><strong>{m.input}</strong> — {m.how}</li>)}
        {estimate.missing_inputs.length === 0 && estimate.ledger.flags.map((f, i) => <li key={i}>{f}</li>)}
      </ul>
      {estimate.movers?.range && <p className="range">{UI.rangeBecause(money(estimate.movers.range[0]), money(estimate.movers.range[1]), estimate.movers.movers.filter((m) => m.impact_cents).map((m) => m.unknown).join(" and "))}</p>}
    </section>
  );
}
