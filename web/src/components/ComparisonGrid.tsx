import { UI } from "../lib/copy";
import type { ComparisonResponse, PlanFixture } from "../lib/types";
import { EvidenceBadge } from "./Primitives";

interface Props { data: ComparisonResponse; plans: Record<string, PlanFixture> }

/** Fixed topic rows, one column per plan in the USER's order, factual differences, eligibility under every header. No sort, no winner. */
export function ComparisonGrid({ data, plans }: Props) {
  const cols = data.result.columns;
  return (
    <section className="compare" aria-labelledby="cmp-h">
      <h2 id="cmp-h">Side by side</h2>
      <p className="banner">{UI.availabilityBanner}</p>
      <p className="note">{UI.comparisonNote}</p>
      <div className="grid-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th scope="col">Topic</th>
              {cols.map((c) => {
                const p = plans[c];
                return (
                  <th scope="col" key={c}>
                    <div className="plan-h">
                      <strong>{p?.title ?? c}</strong>
                      {p?.is_fictional && <span className="ribbon">{UI.fictional}</span>}
                      {p?.catalog && <small>{p.catalog.where_offered.text} · Eligibility: {p.catalog.eligibility.text}</small>}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.result.grid.map((row) => (
              <>
                <tr key={row.topic}>
                  <th scope="row">{row.topic}</th>
                  {row.cells.map((cell, i) => (
                    <td key={i}><div>{cell.text}</div><EvidenceBadge status={cell.badge} />{cell.cite && <small className="cite"> {cell.cite}</small>}</td>
                  ))}
                </tr>
                <tr key={row.topic + "-d"} className="differences"><td colSpan={cols.length + 1}>{row.differences}</td></tr>
              </>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Same estimate, each plan</h3>
      <div className="rails">
        {cols.map((c) => {
          const L = data.result.ledgers[c];
          return (
            <article key={c} className="rail" aria-label={`${c} ledger`}>
              <h4>{plans[c]?.title ?? c}</h4>
              {L.status === "unresolved" ? (
                <p className="unresolved"><EvidenceBadge status="UNKNOWN" /> {UI.unresolved} {L.not_provided.join(", ")}</p>
              ) : (
                <p className="hero"><span className="total">${(L.patient_total_cents! / 100).toFixed(2)}</span><span className="sub">{UI.planPays}: ${(L.plan_total_cents! / 100).toFixed(2)}{L.plan_total_is_upper_bound ? " (upper bound)" : ""}</span></p>
              )}
              {L.flags.map((f, i) => <p key={i} className="flag">{f}</p>)}
              <p className="note">Premium (employee only, monthly): {plans[c]?.premium_monthly?.employee_only?.value != null ? `$${(plans[c].premium_monthly.employee_only.value! / 100).toFixed(2)}` : "not stated in this document"}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
