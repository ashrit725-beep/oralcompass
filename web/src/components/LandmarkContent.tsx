import { Fragment, useMemo, useState } from "react";
import { BADGE_LABEL, LANDMARKS, PLAIN, UI, type LandmarkId } from "@/lib/copy";
import { PLAN } from "@/lib/copy/plan";
import { COMPASS } from "@/lib/copy/compass";
import { compassModel } from "@/lib/compass-model";
import type { UploadSummary } from "@/lib/plan-catalog";
import { stitchForCite } from "@/lib/stitches";
import type { Benefits, Cite, CoverageRule, PlanFixture, PlanRef, PlanSummary, SavedEstimate, Stitch, VJson } from "@/lib/types";
import { isUpload } from "@/lib/types";
import { DepthDial } from "@/components/DepthDial";
import { Money } from "@/components/Money";
import { EvidenceBadge, StitchChip } from "@/components/Primitives";
import { Gauge } from "@/components/compass/Gauge";
import { BenefitStatementForm } from "@/components/records/BenefitStatementForm";

interface Props {
  landmark: LandmarkId; plan: PlanFixture; summary: PlanSummary | UploadSummary; benefits: Benefits | null; rules: CoverageRule[]; estimate: SavedEstimate | null;
  stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; prominentScope?: boolean; onOpenDocuments: () => void;
  /** Controlled depth (the Restrictions list opens the cove at depth 3); uncontrolled when omitted. */
  depth?: 1 | 2 | 3; onDepth?: (d: 1 | 2 | 3) => void;
  /** The plan ref the benefit statement form writes to (never another plan's). */
  planRef: PlanRef; onBenefitsSaved: (b: Benefits) => void;
}

const netText = (n: PlanSummary["network"]) => (typeof n === "string" ? n : n?.text ?? UI.notStated);

/**
 * One landmark card: depth 1 plain words · depth 2 your numbers · depth 3 exact wording, on the RubberSegment DepthDial. Every figure
 * renders through <Money> with its badge and the clause stitch. Depth 2 of the bridge and the lookout holds that quadrant's Gauge
 * (bullet-bar meter) and the Benefit statement form (spec §4.5 / §4.6). Uploaded plans render with their UPn version label and banner;
 * fields the document does not state read "Not stated in this document" with the UNKNOWN badge, never a placeholder.
 */
export function LandmarkContent({ landmark, plan, summary, benefits, rules, estimate, stitches, selected, onSelect, prominentScope, onOpenDocuments, depth: depthProp, onDepth, planRef, onBenefitsSaved }: Props) {
  const [depthState, setDepthState] = useState<1 | 2 | 3>(1);
  const depth = depthProp ?? depthState;
  const setDepth = (d: 1 | 2 | 3) => { setDepthState(d); onDepth?.(d); };
  const meta = LANDMARKS.find((l) => l.id === landmark)!;
  const doc = plan.source_document.version_label;
  const upload = isUpload(planRef) ? (summary as UploadSummary) : null;
  const vm = useMemo(() => compassModel(plan, benefits, estimate), [plan, benefits, estimate]);
  const chip = (st: Stitch | undefined) => (st ? <StitchChip stitch={st} selected={selected?.id === st.id} prominent={prominentScope} onSelect={onSelect} /> : null);

  // a plain render helper, not a component declared in render: a new component type per render would remount every figure on each
  // update (a pressed stitch chip lost focus, NumberFlow restarted instead of rolling; web-correctness-6)
  const fig = ({ v, label, kind = "money" }: { v: VJson<any> | undefined | null; label: string; kind?: "money" | "text" | "pct" }) => {
    if (!v) return <li><span className="k">{label}</span><span className="v"><span>{UI.notStated}</span> <EvidenceBadge status="UNKNOWN" /></span></li>;
    const st = stitchForCite(v.cite ?? undefined, stitches, doc);
    return (
      <li>
        <span className="k">{label}</span>
        <span className="v">
          {v.unlimited ? <><span>{PLAN.unlimited}</span> <EvidenceBadge status={v.status} /></>
            : v.value == null ? <><span>{UI.notStated}</span> <EvidenceBadge status={v.status} /></>
            : kind === "money" ? <Money cents={v.value} evidence={v.status} badge={!st} />
            : <><strong className="num">{kind === "pct" ? `${v.value / 100}%` : String(v.value)}</strong> {!st && <EvidenceBadge status={v.status} />}</>}
          {chip(st)}
        </span>
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
      {upload && <p className="lm-ribbons"><span className="ribbon">{PLAN.uploadedRibbon(upload.version_label)}</span>{plan.is_fictional && <span className="ribbon">{UI.fictional}</span>}</p>}
      {depth === 1 && <p className="plain">{PLAIN[meta.topic] ?? PLAIN.plan}</p>}

      {landmark === "harbor" && (
        <ul className="facts">
          <li><span className="k">Plan</span><span className="v"><strong>{summary.plan_name ?? summary.title}</strong>{summary.option ? <span>, {summary.option}</span> : null}</span></li>
          <li><span className="k">Insurer</span><span className="v">{summary.insurer ?? <><span>{UI.notStated}</span> <EvidenceBadge status="UNKNOWN" /></>}</span></li>
          <li><span className="k">Where it applies</span><span className="v">{summary.region ?? summary.where_offered?.text ?? <><span>{UI.notStated}</span> <EvidenceBadge status="UNKNOWN" /></>}</span></li>
          <li><span className="k">Network</span><span className="v">{netText(summary.network)}</span></li>
          <li><span className="k">In effect</span><span className="v">{summary.effective_dates?.text ?? (summary.effective_dates?.start ? `${summary.effective_dates.start} to ${summary.effective_dates.end ?? UI.notStated}` : UI.notStated)}</span></li>
          <li><span className="k">Document</span><span className="v"><span className="scope">{doc}</span> {plan.source_document.title} {(plan.source_document.publisher || plan.source_document.document_date) && <span className="muted">({plan.source_document.publisher ?? ""}{plan.source_document.document_date ? `, ${plan.source_document.document_date}` : ""})</span>}
            {upload ? <span className="ribbon">{PLAN.uploadedRibbon(upload.version_label)}</span> : plan.is_fictional ? <span className="ribbon">{UI.fictional}</span> : <span className="ribbon real">{UI.realPlan}</span>}</span></li>
          {upload?.banner && <li><span className="k">Source of the rules</span><span className="v">{upload.banner}</span></li>}
          {summary.currency_note && <li><span className="k">{UI.outdated}</span><span className="v"><EvidenceBadge status="AMBIGUOUS" /> {summary.currency_note}</span></li>}
          <li><span className="k">Eligibility</span><span className="v">{summary.eligibility?.text ?? UI.notStated}</span></li>
          {fig({ v: plan.premium_monthly.employee_only ?? plan.premium_monthly.self_only ?? Object.values(plan.premium_monthly)[0], label: "Premium (employee only, monthly)" })}
          <li><span className="k">Evidence</span><span className="v"><button type="button" className="linklike" onClick={onOpenDocuments}>{UI.evidenceTitle}</button>
            {plan.source_document.url && <> · <a href={plan.source_document.url} target="_blank" rel="noreferrer">{UI.openSource}</a></>}</span></li>
          {(plan.conflicts?.length ?? 0) > 0 && depth >= 2 && (
            <li><span className="k">{UI.conflictTitle}</span><span className="v"><EvidenceBadge status="CONFLICT" /> {plan.conflicts!.map((c) => c.field).join("; ")}</span></li>
          )}
        </ul>
      )}

      {landmark === "bridge" && (
        <>
          <ul className="facts">
            {fig({ v: plan.deductible_individual, label: "Deductible (per person)" })}
            {fig({ v: plan.deductible_family, label: "Deductible (per family)" })}
            {plan.deductible_individual_out?.value != null && fig({ v: plan.deductible_individual_out, label: "Out-of-network deductible (per person)" })}
            <li><span className="k">Not applied to</span><span className="v">{plan.deductible_waived_classes.length ? plan.deductible_waived_classes.join(", ") : "no class is exempt in this document"}{plan.deductible_waiver_note && depth >= 2 ? <small className="note">{plan.deductible_waiver_note}</small> : null}</span></li>
          </ul>
          {depth >= 2 && (
            <div className="lm-usage">
              <Gauge headingLevel={3} label={COMPASS.deductible} meter={vm.deductible} stitch={stitchForCite(vm.deductible.limitCite, stitches, doc)} selectedStitch={selected} onSelectStitch={onSelect} usedWord={COMPASS.met} />
              <UsageSource benefits={benefits} />
              <BenefitStatementForm planRef={planRef} plan={plan} benefits={benefits} onSaved={onBenefitsSaved} compact />
            </div>
          )}
        </>
      )}

      {landmark === "cove" && (
        <>
          <ul className="facts">
            {plan.classes.map((c) => <Fragment key={c.name}>{fig({ v: c.plan_share_bp_in, label: `${c.name}, plan pays (in-network)`, kind: "pct" })}</Fragment>)}
            <li><span className="k">Network rule</span><span className="v"><EvidenceBadge status={plan.oon_rule.status} /> {typeof plan.oon_rule.value === "string" ? plan.oon_rule.value : plan.oon_rule.value?.out ?? UI.notStated}{chip(stitchForCite(plan.oon_rule.cite, stitches, doc))}</span></li>
            <li><span className="k">Alternate benefit</span><span className="v"><EvidenceBadge status={plan.alternate_benefit.status} /> {plan.alternate_benefit.note || (plan.alternate_benefit.status === "DOC" ? "Clause present." : UI.notStated)}{chip(stitchForCite(plan.alternate_benefit.cite, stitches, doc))}
              {depth === 3 && plan.alternate_benefit.cite && <Wording cite={plan.alternate_benefit.cite} doc={doc} />}</span></li>
            <li><span className="k">Waiting periods</span><span className="v"><EvidenceBadge status={plan.waiting_months.status} /> {plan.waiting_months.value && Object.keys(plan.waiting_months.value).length ? Object.entries(plan.waiting_months.value).map(([k, m]) => `${k}: ${m} months`).join("; ") : plan.waiting_months.note ?? (plan.waiting_months.status === "UNKNOWN" ? UI.notStated : "none stated")}{chip(stitchForCite(plan.waiting_months.cite, stitches, doc))}
              {depth === 3 && plan.waiting_months.cite && <Wording cite={plan.waiting_months.cite} doc={doc} />}</span></li>
            {depth === 3 && plan.frequency.map((f, i) => <li key={i}><span className="k">Frequency</span><span className="v">{f.procedure_key.replace(/_/g, " ")}: {f.n} per {f.clock.replace(/_/g, " ")}{f.period_as_printed ? ` (${f.period_as_printed})` : ""} {f.cite ? chip(stitchForCite(f.cite, stitches, doc)) : <EvidenceBadge status="DOC" />}{f.cite && <Wording cite={f.cite} doc={doc} />}</span></li>)}
            {depth === 3 && Object.entries(plan.excluded ?? {}).map(([k, v]) => <li key={k}><span className="k">Exclusion</span><span className="v">{k.replace(/_/g, " ")} <EvidenceBadge status={v.status} />{chip(stitchForCite(v.cite, stitches, doc))}{v.cite && <Wording cite={v.cite} doc={doc} />}</span></li>)}
            {depth === 3 && (plan.unsupported_rules ?? []).map((u, i) => <li key={`u${i}`}><span className="k">Quoted, not applied</span><span className="v"><EvidenceBadge status="DOC" /> {u.reason}<figure className="wording"><blockquote>“{u.quote}”</blockquote><figcaption>{u.doc ?? doc}, {u.page_note ?? `page ${u.page}`}</figcaption></figure></span></li>)}
          </ul>
          {depth >= 2 && (
            <div className="rules-scroll">
              <table className="rules">
                <caption>Coverage by procedure, as stated in the document</caption>
                <thead><tr><th scope="col">Procedure</th><th scope="col">Class</th><th scope="col">Plan pays</th><th scope="col">Deductible</th><th scope="col">Frequency</th><th scope="col">Code as printed</th></tr></thead>
                <tbody>
                  {rules.map((r) => {
                    const cls = r.category_cite ? stitchForCite(r.category_cite, stitches, doc) : undefined;
                    const cov = r.coverage_cite ? stitchForCite(r.coverage_cite, stitches, doc) : undefined;
                    return (
                      <tr key={r.procedure_key} className={r.covered === false ? "excluded" : ""}>
                        <th scope="row">{r.procedure_key.replace(/_/g, " ")}</th>
                        <td>{r.covered === false ? <><EvidenceBadge status="DOC" /> {r.exclusion?.text}</> : r.category ?? <EvidenceBadge status="UNKNOWN" />}{r.category_status === "AMBIGUOUS" && <EvidenceBadge status="AMBIGUOUS" />}
                          {chip(cls)}</td>
                        <td>{r.plan_pays_pct != null ? <><span className="num">{r.plan_pays_pct}%</span> {cov ? chip(cov) : <EvidenceBadge status={r.status ?? "DOC"} />}</> : <EvidenceBadge status="UNKNOWN" />}</td>
                        <td>{r.deductible_applies == null ? UI.notStated : r.deductible_applies ? "applies" : "waived"}</td>
                        <td>{r.frequency?.length ? r.frequency.map((f) => `${f.n} per ${f.clock.replace(/_/g, " ")}`).join("; ") : UI.notStated}</td>
                        <td>{r.code_as_printed ? <>{r.code_as_printed.code}{r.code_as_printed.review && <small> ({UI.reviewCode})</small>}</> : UI.notStated}</td>
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
        <>
          <ul className="facts">
            {fig({ v: plan.annual_max, label: "Annual maximum (per person)" })}
            {plan.annual_max_out && (plan.annual_max_out.value != null || plan.annual_max_out.unlimited) && fig({ v: plan.annual_max_out, label: "Out-of-network annual maximum" })}
            {(plan.annual_max_exempt_classes?.length ?? 0) > 0 && <li><span className="k">Does not count toward it</span><span className="v">{plan.annual_max_exempt_classes!.join(", ")}</span></li>}
            {fig({ v: plan.benefit_year_start_month, label: "Benefit year starts (month)", kind: "text" })}
            {depth >= 2 && estimate?.status === "estimate" && (
              <li><span className="k">After the planned work</span>
                <span className="v">{estimate.ledger.lines.map((l) => <span key={l.label} className="lm-after">{l.label}: {l.remaining_after?.annual_max_cents == null ? <><span>{COMPASS.noMaxApplies}</span> <EvidenceBadge status={plan.annual_max.status} /></> : <Money cents={l.remaining_after.annual_max_cents} evidence={plan.annual_max.status} badge={!stitchForCite(plan.annual_max.cite, stitches, doc)} />} {chip(stitchForCite(plan.annual_max.cite, stitches, doc))} left</span>)}</span></li>
            )}
            {depth >= 2 && estimate && estimate.status !== "estimate" && <li><span className="k">After the planned work</span><span className="v"><span>{PLAN.waitingForInfo}</span> <EvidenceBadge status="UNKNOWN" /></span></li>}
          </ul>
          {depth >= 2 && (
            <div className="lm-usage">
              <Gauge headingLevel={3} label={COMPASS.annualMax} meter={vm.annualMax} stitch={stitchForCite(vm.annualMax.limitCite, stitches, doc)} selectedStitch={selected} onSelectStitch={onSelect} usedWord={COMPASS.used} />
              <UsageSource benefits={benefits} />
              <BenefitStatementForm planRef={planRef} plan={plan} benefits={benefits} onSaved={onBenefitsSaved} compact />
            </div>
          )}
        </>
      )}

      {landmark === "lighthouse" && (
        <p className="plain">{estimate ? "The cost trail for your planned procedures is drawn below." : PLAN.noProcedures}</p>
      )}
    </article>
  );
}

function Wording({ cite, doc }: { cite: Cite; doc: string }) {
  return <figure className="wording"><blockquote>“{cite.quote}”</blockquote><figcaption>{cite.doc ?? doc}, {cite.page_note ?? `page ${cite.page}`}</figcaption></figure>;
}

/** Where the statement figures came from (label + date), with the USER badge; or the honest absence. */
function UsageSource({ benefits }: { benefits: Benefits | null }) {
  if (!benefits) return <p className="note"><EvidenceBadge status="UNKNOWN" /> {PLAN.bsNoneEntered}</p>;
  return <p className="note"><EvidenceBadge status="USER" /> {BADGE_LABEL.USER}: {benefits.source?.label ?? UI.notStated}{benefits.source?.date ? ` (${benefits.source.date})` : ""}</p>;
}
