import { useState } from "react";
import { UI } from "../lib/copy";
import { money, signed, stitchForLabel, stitchForStep } from "../lib/stitches";
import { buildTrail } from "../lib/trail";
import type { LedgerLine, SavedEstimate, Stitch } from "../lib/types";
import { EvidenceBadge, StitchChip } from "./Primitives";

interface Props {
  estimate: SavedEstimate; stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; prominentScope?: boolean;
  /** Render one line only, without the line tabs, the estimate hero and the estimate-level notes (the drawer's "How was this calculated?"). */
  lineIndex?: number;
}

/**
 * The lighthouse: one procedure at a time, a fixed trail from the dentist's fee to what you pay.
 * Each step shows amount in → rule → change → amount out, the explanation and the clause stitch. Amounts are checked to reconcile.
 * With `lineIndex` the same trail renders a single line inside the procedure drawer: no tabs, no hero (the drawer's Final cost section
 * carries it), every amount sits in the step's `<li>` next to its stitch chip or badge, and the receipt table keeps its stitch in the amount cell.
 */
export function CostTrail({ estimate, stitches, selected, onSelect, prominentScope, lineIndex }: Props) {
  const lines = estimate.ledger.lines;
  const [idx, setIdx] = useState(0);
  const one = lineIndex != null;
  if (estimate.status === "unresolved" && lines.length === 0) {
    return <MissingInputs estimate={estimate} />;
  }
  const line: LedgerLine | undefined = lines[Math.min(one ? lineIndex : idx, lines.length - 1)];
  if (!line) return <MissingInputs estimate={estimate} />;
  const trail = buildTrail(line);
  const hid = one ? `trail-h-${lineIndex}` : "trail-h";
  return (
    <section className={`trail ${one ? "trail-one" : ""}`} aria-labelledby={hid}>
      <h3 id={hid} className={one ? "sr-only" : undefined}>{UI.ledgerTitle}</h3>
      {!one && (
        <p className="hero" aria-live="polite">
          <span className="total">{money(estimate.user_estimated_payment_cents)}</span>
          <span className="sub">{UI.planPays}: {money(estimate.insurer_estimated_payment_cents)}{estimate.plan_payment_is_upper_bound ? " (upper bound)" : ""}</span>
        </p>
      )}
      {!one && estimate.status === "unresolved" && <MissingInputs estimate={estimate} compact />}
      {!one && lines.length > 1 && (
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
          const mark = st ? <StitchChip stitch={st} selected={selected?.id === st.id} prominent={prominentScope} onSelect={onSelect} /> : s.rule === "fee" ? <EvidenceBadge status="USER" /> : one ? <EvidenceBadge status={s.rule === "total" ? "DOC" : "USER"} /> : null;
          return (
            <li key={s.key} className={`trail-step owner-${s.owner} ${s.key === "you" ? "is-total" : ""}`}>
              <div className="ts-head">
                <span className="ts-n" aria-hidden="true">{i + 1}</span>
                <h4>{s.title}</h4>
                {!one && mark}
              </div>
              {one ? (
                <p className="ts-amounts ts-amounts-inline">
                  <span className="amt">
                    {s.amountIn != null && <><span className="ts-k">Amount in</span> {money(s.amountIn)}</>}
                    {s.change != null && <> <span className="ts-k">· Change</span> <span className={s.change < 0 ? "neg" : ""}>{signed(s.change)}</span></>}
                    {s.split && <> <span className="ts-k">· Split</span> plan {money(s.split.plan)} ({s.split.planPct}%) · you {money(s.split.patient)} ({100 - s.split.planPct}%)</>}
                    {s.amountOut != null && <> <span className="ts-k">· {s.key === "you" ? "You pay" : "Amount out"}</span> <span className="out">{money(s.amountOut)}</span></>}
                  </span>
                  {mark}
                </p>
              ) : (
                <dl className="ts-amounts">
                  {s.amountIn != null && <><dt>Amount in</dt><dd className="amt">{money(s.amountIn)}</dd></>}
                  {s.change != null && <><dt>Change</dt><dd className={`amt ${s.change < 0 ? "neg" : ""}`}>{signed(s.change)}</dd></>}
                  {s.split && <><dt>Split</dt><dd className="amt">plan {money(s.split.plan)} ({s.split.planPct}%) · you {money(s.split.patient)} ({100 - s.split.planPct}%)</dd></>}
                  {s.amountOut != null && <><dt>{s.key === "you" ? "You pay" : "Amount out"}</dt><dd className="amt out">{money(s.amountOut)}</dd></>}
                </dl>
              )}
              <p className="ts-why">{s.explanation}</p>
              {st && <p className="ts-clause"><q>{st.quote}</q> <span className="where">({st.doc}, {st.pageNote ?? `p.${st.page}`})</span></p>}
            </li>
          );
        })}
      </ol>
      {trail.reconciles === true && <p className="reconcile ok">✓ {UI.reconciles}</p>}
      {trail.reconciles === false && <p className="reconcile warn" role="alert">{UI.reconcileWarn}</p>}
      {trail.upperBound && <p className="flag">{UI.upperBound}</p>}
      {!one && line.flags.map((f, i) => <p key={i} className="flag">{f}</p>)}
      {line.remaining_after?.deductible_cents != null && (
        <p className="note">Remaining after this line: deductible {money(line.remaining_after.deductible_cents)} · annual maximum {line.remaining_after.annual_max_cents == null ? "no maximum applies" : money(line.remaining_after.annual_max_cents)}</p>
      )}
      <details className="receipt-details" open={trail.reconciles === false || undefined}>
        <summary>Engine receipt (every step, as computed)</summary>
        <table className="receipt"><tbody>
          {line.steps.map((s, i) => {
            const st = one ? stitchForStep(s, stitches) : undefined;
            return (
              <tr key={i} className={`owner-${s.owner}`}>
                <th scope="row">{s.label}</th>
                <td className="amt">{s.cents < 0 ? `−${money(-s.cents)}` : money(s.cents)}{one ? <> {st ? <StitchChip stitch={st} onSelect={onSelect} /> : <EvidenceBadge status="USER" />}</> : null}</td>
                {!one && <td className="st">{s.stitch ?? ""}</td>}
              </tr>
            );
          })}
          <tr className="line-total"><th scope="row">Line: you pay · plan pays</th><td className="amt">{money(line.patient_cents)} · {money(line.plan_cents)}{one ? <> <EvidenceBadge status="DOC" /></> : null}</td>{!one && <td />}</tr>
        </tbody></table>
      </details>
      {!one && estimate.ledger.order_note && <p className="note">{estimate.ledger.order_note}</p>}
      {!one && estimate.assumptions.length > 0 && <p className="note"><EvidenceBadge status="ASSUMED" /> {estimate.assumptions.join("; ")}</p>}
      {!one && <p className="could-change">{estimate.ledger.could_change}</p>}
    </section>
  );
}

export function MissingInputs({ estimate, compact }: { estimate: SavedEstimate; compact?: boolean }) {
  return (
    <section className={`missing ${compact ? "compact" : ""}`} aria-labelledby="missing-h">
      <h3 id="missing-h"><EvidenceBadge status="UNKNOWN" /> {UI.missingTitle}</h3>
      {!compact && <p>{UI.missingIntro}</p>}
      <ul>
        {estimate.missing_inputs.map((m, i) => <li key={i}><strong>{m.input}</strong>: {m.how}</li>)}
        {estimate.missing_inputs.length === 0 && estimate.ledger.flags.map((f, i) => <li key={i}>{f}</li>)}
      </ul>
      {estimate.movers?.range && <p className="range">{UI.rangeBecause(money(estimate.movers.range[0]), money(estimate.movers.range[1]), estimate.movers.movers.filter((m) => m.impact_cents).map((m) => m.unknown).join(" and "))}</p>}
    </section>
  );
}
