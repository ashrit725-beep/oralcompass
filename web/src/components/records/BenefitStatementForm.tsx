import { useEffect, useId, useState, type ReactNode } from "react";
import { api, type BenefitsIn } from "@/lib/api";
import { PLAN } from "@/lib/copy/plan";
import { dollarsToCents } from "@/lib/plan-catalog";
import type { Benefits, PlanFixture, PlanRef } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EvidenceBadge } from "@/components/Primitives";

/**
 * BenefitStatementForm (spec §4.5): the user's dated benefit statement figures for ONE plan ref. Fields: deductible met, paid by the plan,
 * coverage start, the dentist's network status, the statement label and date (both required), and the out-of-network variants only when
 * the document states separate out-of-network limits. Submits `PUT /me/benefits/{plan_ref}` (URL-encoded; upload refs included) and shows
 * the server's derivation sentences back immediately: remaining = plan limit (document) − statement figure (entered by you). Every figure
 * entered here is USER. Existing itemized claims for the plan are sent back unchanged so a re-entry never erases them. Nothing here is
 * computed on the client; nothing transfers to another plan ref (the record is keyed by `planRef`).
 */
export interface BenefitStatementFormProps {
  planRef: PlanRef;
  plan: PlanFixture;
  benefits: Benefits | null;
  onSaved: (b: Benefits) => void;
  compact?: boolean;
}

/** Record fields the server stores and returns that the frozen `Benefits` type does not list (records.py BenefitsIn). */
interface BenefitsRecordExtras { network_default?: string | { value?: string | null } | null; deductible_met_out_cents?: number | null; benefits_used_out_cents?: number | null; coverage_end?: string | null }
type BenefitsBody = BenefitsIn & { network_default?: string | null; deductible_met_out_cents?: number | null; benefits_used_out_cents?: number | null; coverage_end?: string | null; last_updated?: string | null };

/** Validation order = visual order: the first invalid field in this list receives focus after a failed submit. */
const FIELD_ORDER = ["deductibleMet", "benefitsUsed", "deductibleMetOut", "benefitsUsedOut", "label", "date"];

/** A label tied to its control by id, with notes or the error rendered after it (outside the label, so not part of the name). */
export function Field({ id, label, after, className, children }: { id: string; label: ReactNode; after?: ReactNode; className?: string; children: ReactNode }) {
  return <div className={`bs-field ${className ?? ""}`}><label htmlFor={id}>{label}</label>{children}{after}</div>;
}

/** The stored figures that the form shows, as one string: equal for the server's echo of what was just saved. */
export function benefitsRecordKey(b: Benefits | null): string {
  if (!b) return "";
  const ex = b as Benefits & BenefitsRecordExtras;
  return JSON.stringify([b.plan_code, b.deductible_met_cents, b.benefits_used_cents, ex.deductible_met_out_cents ?? null, ex.benefits_used_out_cents ?? null,
    b.coverage_start ?? null, netOf(ex.network_default), b.source?.label ?? null, b.source?.date ?? null]);
}

const dollars = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));
const netOf = (n: BenefitsRecordExtras["network_default"]) => (typeof n === "string" ? n : n?.value ?? "");

export function BenefitStatementForm({ planRef, plan, benefits, onSaved, compact }: BenefitStatementFormProps) {
  const id = useId();
  const extras = (benefits ?? {}) as BenefitsRecordExtras;
  const hasOut = plan.deductible_individual_out?.value != null || plan.annual_max_out?.value != null || !!plan.annual_max_out?.unlimited;
  const [deductibleMet, setDeductibleMet] = useState(dollars(benefits?.deductible_met_cents));
  const [benefitsUsed, setBenefitsUsed] = useState(dollars(benefits?.benefits_used_cents));
  const [deductibleMetOut, setDeductibleMetOut] = useState(dollars(extras.deductible_met_out_cents));
  const [benefitsUsedOut, setBenefitsUsedOut] = useState(dollars(extras.benefits_used_out_cents));
  const [coverageStart, setCoverageStart] = useState(benefits?.coverage_start ?? "");
  const [network, setNetwork] = useState(netOf(extras.network_default));
  const [label, setLabel] = useState(benefits?.source?.label ?? "");
  const [date, setDate] = useState(benefits?.source?.date ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [derived, setDerived] = useState<Benefits | null>(benefits);

  // a different plan ref is a different record: nothing transfers between plans. The fields reset when the plan ref or the record's
  // CONTENT changes, not its object identity: the parent hands back a new object after every save and records reload, which used to wipe
  // the "Figures recorded" confirmation and any half-typed field (web-correctness-27).
  const recordKey = benefitsRecordKey(benefits);
  useEffect(() => {
    const ex = (benefits ?? {}) as BenefitsRecordExtras;
    setDeductibleMet(dollars(benefits?.deductible_met_cents)); setBenefitsUsed(dollars(benefits?.benefits_used_cents));
    setDeductibleMetOut(dollars(ex.deductible_met_out_cents)); setBenefitsUsedOut(dollars(ex.benefits_used_out_cents));
    setCoverageStart(benefits?.coverage_start ?? ""); setNetwork(netOf(ex.network_default));
    setLabel(benefits?.source?.label ?? ""); setDate(benefits?.source?.date ?? "");
    setDerived(benefits); setErrors({}); setStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planRef, recordKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const dm = dollarsToCents(deductibleMet), bu = dollarsToCents(benefitsUsed), dmo = dollarsToCents(deductibleMetOut), buo = dollarsToCents(benefitsUsedOut);
    if (dm === undefined) errs.deductibleMet = PLAN.amountOrEmpty;
    if (bu === undefined) errs.benefitsUsed = PLAN.amountOrEmpty;
    if (dmo === undefined) errs.deductibleMetOut = PLAN.amountOrEmpty;
    if (buo === undefined) errs.benefitsUsedOut = PLAN.amountOrEmpty;
    if (!label.trim()) errs.label = PLAN.bsLabelRequired;
    if (!date) errs.date = PLAN.bsDateRequired;
    setErrors(errs);
    const firstBad = FIELD_ORDER.find((k) => errs[k]);
    if (firstBad) { document.getElementById(`${id}-${firstBad}`)?.focus(); return; }   // a11y-26: focus the first invalid field
    setBusy(true); setStatus(null);
    const body: BenefitsBody = {
      coverage_start: coverageStart || null,
      coverage_end: extras.coverage_end ?? null,
      network_default: network || null,
      deductible_met_cents: dm ?? null,
      benefits_used_cents: bu ?? null,
      ...(hasOut ? { deductible_met_out_cents: dmo ?? null, benefits_used_out_cents: buo ?? null } : {}),
      source: { type: "benefit_statement", label: label.trim(), date, entered_by: "user" },
      last_updated: date,
      claims: benefits?.claims ?? [],
    };
    try {
      const saved = await api.putBenefits(planRef, body);
      setDerived(saved); setStatus(PLAN.bsSaved); onSaved(saved);
    } catch { setStatus(PLAN.bsError); }
    finally { setBusy(false); }
  }

  // a11y-26: each error sits OUTSIDE its <label> (so it is not part of the field's name) and is referenced by aria-describedby; one summary
  // region announces the errors once instead of one alert per field
  const err = (k: string) => (errors[k] ? <small id={`${id}-${k}-e`} className="bs-error">{errors[k]}</small> : null);
  const describe = (k: string) => (errors[k] ? `${id}-${k}-e` : undefined);
  const fid = (k: string) => `${id}-${k}`;
  const errorList = FIELD_ORDER.filter((k) => errors[k]).map((k) => errors[k]);

  return (
    <form className={`bs-form ${compact ? "is-compact" : ""}`} onSubmit={submit} aria-labelledby={`${id}-h`} noValidate>
      <h4 id={`${id}-h`} className="bs-h">{PLAN.bsTitle}</h4>
      <p className="bs-note">{PLAN.bsNote}</p>
      <div className="bs-grid">
        <Field id={fid("deductibleMet")} label={PLAN.bsDeductibleMet} after={err("deductibleMet")}><input id={fid("deductibleMet")} inputMode="decimal" value={deductibleMet} onChange={(e) => setDeductibleMet(e.target.value)} aria-invalid={!!errors.deductibleMet} aria-describedby={describe("deductibleMet")} placeholder="25.00" /></Field>
        <Field id={fid("benefitsUsed")} label={PLAN.bsBenefitsUsed} after={err("benefitsUsed")}><input id={fid("benefitsUsed")} inputMode="decimal" value={benefitsUsed} onChange={(e) => setBenefitsUsed(e.target.value)} aria-invalid={!!errors.benefitsUsed} aria-describedby={describe("benefitsUsed")} placeholder="240.00" /></Field>
        {hasOut && (
          <>
            <p className="bs-span muted small">{PLAN.bsSeparateOut}</p>
            <Field id={fid("deductibleMetOut")} label={PLAN.bsDeductibleMetOut} after={err("deductibleMetOut")}><input id={fid("deductibleMetOut")} inputMode="decimal" value={deductibleMetOut} onChange={(e) => setDeductibleMetOut(e.target.value)} aria-invalid={!!errors.deductibleMetOut} aria-describedby={describe("deductibleMetOut")} /></Field>
            <Field id={fid("benefitsUsedOut")} label={PLAN.bsBenefitsUsedOut} after={err("benefitsUsedOut")}><input id={fid("benefitsUsedOut")} inputMode="decimal" value={benefitsUsedOut} onChange={(e) => setBenefitsUsedOut(e.target.value)} aria-invalid={!!errors.benefitsUsedOut} aria-describedby={describe("benefitsUsedOut")} /></Field>
          </>
        )}
        <label>{PLAN.bsCoverageStart}<input type="date" value={coverageStart} onChange={(e) => setCoverageStart(e.target.value)} /></label>
        <label>{PLAN.bsNetwork}
          <select value={network} onChange={(e) => setNetwork(e.target.value)}>
            <option value="">{PLAN.bsNetworkUnknown}</option>
            <option value="in">{PLAN.bsNetworkIn}</option>
            <option value="out">{PLAN.bsNetworkOut}</option>
          </select>
        </label>
        <Field id={fid("label")} label={PLAN.bsSourceLabel} after={err("label")}><input id={fid("label")} value={label} onChange={(e) => setLabel(e.target.value)} required aria-invalid={!!errors.label} aria-describedby={describe("label")} placeholder={PLAN.bsSourcePlaceholder} /></Field>
        <Field id={fid("date")} label={PLAN.bsSourceDate} after={err("date")}><input id={fid("date")} type="date" value={date} onChange={(e) => setDate(e.target.value)} required aria-invalid={!!errors.date} aria-describedby={describe("date")} /></Field>
      </div>
      <div className="bs-actions">
        <Button type="submit" size="touch" disabled={busy}>{PLAN.bsSubmit}</Button>
        <span className="bs-user"><EvidenceBadge status="USER" /> <span className="muted small">{PLAN.bsEveryFigureUser}</span></span>
      </div>
      <p className="bs-error bs-error-summary" role="alert">{errorList.join(" ")}</p>
      {status && <p className="bs-status" role="status">{status}</p>}
      {derived && (
        <dl className="bs-derivation">
          <dt>{PLAN.bsDerivationTitle}</dt>
          {Object.entries(derived.derivation ?? {}).map(([k, v]) => <dd key={k}><EvidenceBadge status="USER" /> {v}</dd>)}
          {derived.conflict && <dd><EvidenceBadge status="CONFLICT" /> {derived.conflict.note}</dd>}
        </dl>
      )}
    </form>
  );
}

export default BenefitStatementForm;
