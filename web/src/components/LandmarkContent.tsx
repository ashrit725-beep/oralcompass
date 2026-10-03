import { useState } from "react";
import { BADGE_LABEL, LANDMARKS, PLAIN, UI, type LandmarkId } from "../lib/copy";
import { money, stitchForCite } from "../lib/stitches";
import type { Benefits, Cite, CoverageRule, PlanFixture, PlanSummary, SavedEstimate, Stitch, VJson } from "../lib/types";
import { DepthDial, EvidenceBadge, StitchChip } from "./Primitives";

interface Props {
  landmark: LandmarkId; plan: PlanFixture; summary: PlanSummary; benefits: Benefits | null; rules: CoverageRule[]; estimate: SavedEstimate | null;
  stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; prominentScope?: boolean; onOpenDocuments: () => void;
}

const netText = (n: PlanSummary["network"]) => (typeof n === "string" ? n : n?.text ?? "—");

/** One landmark card: depth 1 plain words · depth 2 your numbers · depth 3 exact wording. Every figure carries its badge and stitch. */
export function LandmarkContent({ landmark, plan, summary, benefits, rules, estimate, stitches, selected, onSelect, prominentScope, onOpenDocuments }: Props) {
  const [depth, setDepth] = useState<1 | 2 | 3>(1);
  const meta = LANDMARKS.find((l) => l.id === landmark)!;
  const doc = plan.source_document.version_label;
  const Fig = ({ v, label, kind = "money" }: { v: VJson<any> | undefined | null; label: string; kind?: "money" | "text" | "pct" }) => {
    if (!v) return <li><span className="k">{label}</span><span className="v"><EvidenceBadge status="UNKNOWN" /> {UI.notStated}</span></li>;
    const st = stitchForCite(v.cite ?? undefined, stitches, doc);
    const val = v.unlimited ? "Unlimited (no dollar maximum)" : v.value == null ? UI.notStated : kind === "money" ? money(v.value) : kind === "pct" ? `${v.value / 100}%` : String(v.value);
    return (
      <li>
        <span className="k">{label}</span>
        <span className="v"><strong className="num">{val}</strong> <EvidenceBadge status={v.status} /> {st && <StitchChip stitch={st} selected={selected?.id === st.id} prominent={prominentScope} onSelect={onSelect} />}</span>
        {depth === 3 && v.cite && <Wording cite={v.cite} doc={doc} />}
        {v.note && depth >= 2 && <small className="note">{v.note}</small>}
      </li>
    );
  };

  return (
    <article className="landmark" aria-labelledby="lm-h">
      <header className="lm-head">
        <p className="lm-kicker">{meta.place}</p>
        <h2 id="lm-h">{meta.term}</h2>
        <DepthDial depth={depth} onChange={setDepth} />
      </header>
      {depth === 1 && <p className="plain">{PLAIN[meta.topic] ?? PLAIN.plan}</p>}

      {landmark === "harbor" && (
        <ul className="facts">
          <li><span className="k">Plan</span><span className="v"><strong>{summary.plan_name}</strong> — {summary.option}</span></li>
          <li><span className="k">Insurer</span><span className="v">{summary.insurer}</span></li>
          <li><span className="k">Where it applies</span><span className="v">{summary.region ?? summary.where_offered?.text}</span></li>
          <li><span className="k">Network</span><span className="v">{netText(summary.network)}</span></li>
          <li><span className="k">In effect</span><span className="v">{summary.effective_dates?.text ?? `${summary.effective_dates?.start ?? "?"} – ${summary.effective_dates?.end ?? "?"}`}</span></li>
          <li><span className="k">Document</span><span className="v">{plan.source_document.title} <span className="muted">({plan.source_document.publisher ?? "—"}{plan.source_document.document_date ? `, ${plan.source_document.document_date}` : ""})</span>
            {plan.is_fictional ? <span className="ribbon">{UI.fictional}</span> : <span className="ribbon real">{UI.realPlan}</span>}</span></li>
          {summary.currency_note && <li><span className="k">{UI.outdated}</span><span className="v"><EvidenceBadge status="AMBIGUOUS" /> {summary.currency_note}</span></li>}
          <li><span className="k">Eligibility</span><span className="v">{summary.eligibility?.text}</span></li>
          <Fig v={plan.premium_monthly.employee_only ?? plan.premium_monthly.self_only ?? Object.values(plan.premium_monthly)[0]} label="Premium (employee only, monthly)" />
          <li><span className="k">Evidence</span><span className="v"><button type="button" className="linklike" onClick={onOpenDocuments}>{UI.evidenceTitle}</button>
            {plan.source_document.url && <> · <a href={plan.source_document.url} target="_blank" rel="noreferrer">{UI.openSource}</a></>}</span></li>
          {(plan.conflicts?.length ?? 0) > 0 && depth >= 2 && (
            <li><span className="k">{UI.conflictTitle}</span><span className="v"><EvidenceBadge status="CONFLICT" /> {plan.conflicts!.map((c) => c.field).join("; ")}</span></li>
          )}
        </ul>
      )}

      {landmark === "bridge" && (
        <ul className="facts">
          <Fig v={plan.deductible_individual} label="Deductible (per person)" />
          <Fig v={plan.deductible_family} label="Deductible (per family)" />
          {plan.deductible_individual_out?.value != null && <Fig v={plan.deductible_individual_out} label="Out-of-network deductible (per person)" />}
          <li><span className="k">Not applied to</span><span className="v">{plan.deductible_waived_classes.length ? plan.deductible_waived_classes.join(", ") : "no class is exempt in this document"}{plan.deductible_waiver_note && depth >= 2 ? <small className="note">{plan.deductible_waiver_note}</small> : null}</span></li>
          {depth >= 2 && <Usage benefits={benefits} which="deductible" />}
        </ul>
      )}

      {landmark === "cove" && (
        <>
          <ul className="facts">
            {plan.classes.map((c) => <Fig key={c.name} v={c.plan_share_bp_in} label={`${c.name} — plan pays (in-network)`} kind="pct" />)}
            <li><span className="k">Network rule</span><span className="v"><EvidenceBadge status={plan.oon_rule.status} /> {typeof plan.oon_rule.value === "string" ? plan.oon_rule.value : plan.oon_rule.value?.out ?? UI.notStated}
              {stitchForCite(plan.oon_rule.cite, stitches, doc) && <StitchChip stitch={stitchForCite(plan.oon_rule.cite, stitches, doc)!} selected={selected?.id === stitchForCite(plan.oon_rule.cite, stitches, doc)!.id} prominent={prominentScope} onSelect={onSelect} />}</span></li>
            <li><span className="k">Alternate benefit</span><span className="v"><EvidenceBadge status={plan.alternate_benefit.status} /> {plan.alternate_benefit.note ?? (plan.alternate_benefit.status === "DOC" ? "Clause present." : UI.notStated)}</span></li>
            <li><span className="k">Waiting periods</span><span className="v"><EvidenceBadge status={plan.waiting_months.status} /> {plan.waiting_months.value ? Object.entries(plan.waiting_months.value).map(([k, m]) => `${k}: ${m} months`).join("; ") : plan.waiting_months.note ?? UI.notStated}</span></li>
          </ul>
          {depth >= 2 && (
            <div className="rules-scroll">
              <table className="rules">
                <caption>Coverage by procedure, as stated in the document</caption>
                <thead><tr><th scope="col">Procedure</th><th scope="col">Class</th><th scope="col">Plan pays</th><th scope="col">Deductible</th><th scope="col">Frequency</th><th scope="col">Code as printed</th></tr></thead>
                <tbody>
                  {rules.map((r) => {
                    const cls = r.category_cite ? stitchForCite(r.category_cite, stitches, doc) : undefined;
                    return (
                      <tr key={r.procedure_key} className={r.covered === false ? "excluded" : ""}>
                        <th scope="row">{r.procedure_key.replace(/_/g, " ")}</th>
                        <td>{r.covered === false ? <><EvidenceBadge status="DOC" /> {r.exclusion?.text}</> : r.category ?? <EvidenceBadge status="UNKNOWN" />}{r.category_status === "AMBIGUOUS" && <EvidenceBadge status="AMBIGUOUS" />}
                          {cls && <StitchChip stitch={cls} selected={selected?.id === cls.id} prominent={prominentScope} onSelect={onSelect} />}</td>
                        <td className="amt">{r.plan_pays_pct != null ? `${r.plan_pays_pct}%` : "—"}</td>
                        <td>{r.deductible_applies == null ? "—" : r.deductible_applies ? "applies" : "waived"}</td>
                        <td>{r.frequency?.length ? r.frequency.map((f) => `${f.n} per ${f.clock.replace(/_/g, " ")}`).join("; ") : "—"}</td>
                        <td>{r.code_as_printed ? <>{r.code_as_printed.code}{r.code_as_printed.review && <small> ({UI.reviewCode})</small>}</> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {landmark === "lookout" && (
        <ul className="facts">
          <Fig v={plan.annual_max} label="Annual maximum (per person)" />
          {plan.annual_max_out && (plan.annual_max_out.value != null || plan.annual_max_out.unlimited) && <Fig v={plan.annual_max_out} label="Out-of-network annual maximum" />}
          {(plan.annual_max_exempt_classes?.length ?? 0) > 0 && <li><span className="k">Does not count toward it</span><span className="v">{plan.annual_max_exempt_classes!.join(", ")}</span></li>}
          <Fig v={plan.benefit_year_start_month} label="Benefit year starts (month)" kind="text" />
          {depth >= 2 && <Usage benefits={benefits} which="max" />}
          {depth >= 2 && estimate?.status === "estimate" && <li><span className="k">After the planned work</span><span className="v">{estimate.ledger.lines.map((l) => `${l.label}: ${l.remaining_after?.annual_max_cents == null ? "no maximum applies" : money(l.remaining_after.annual_max_cents)} left`).join(" · ")}</span></li>}
        </ul>
      )}

      {landmark === "lighthouse" && (
        <p className="plain">{estimate ? "The cost trail for your planned procedures is drawn below." : "No treatment items are recorded for this plan yet."}</p>
      )}
    </article>
  );
}

function Wording({ cite, doc }: { cite: Cite; doc: string }) {
  return <figure className="wording"><blockquote>“{cite.quote}”</blockquote><figcaption>{cite.doc ?? doc}, {cite.page_note ?? `page ${cite.page}`}</figcaption></figure>;
}

function Usage({ benefits, which }: { benefits: Benefits | null; which: "deductible" | "max" }) {
  if (!benefits) return <li><span className="k">Your usage</span><span className="v"><EvidenceBadge status="UNKNOWN" /> No benefit statement figures entered for this plan.</span></li>;
  const rem = which === "deductible" ? benefits.remaining_deductible_cents : benefits.remaining_max_cents;
  const der = which === "deductible" ? benefits.derivation.remaining_deductible : benefits.derivation.remaining_max;
  return (
    <li>
      <span className="k">{which === "deductible" ? "Remaining deductible" : "Remaining annual maximum"}</span>
      <span className="v"><strong className="num">{rem == null ? (benefits.annual_max_unlimited && which === "max" ? "no maximum applies" : UI.notStated) : money(rem)}</strong> <EvidenceBadge status="USER" /> <small className="note">{der} — {BADGE_LABEL.USER.toLowerCase()}: {benefits.source?.label ?? "—"}</small>
        {benefits.conflict && <small className="note"><EvidenceBadge status="CONFLICT" /> {benefits.conflict.note}</small>}</span>
    </li>
  );
}
