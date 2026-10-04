import { useId, useState } from "react";
import { api } from "@/lib/api";
import { UI } from "@/lib/copy";
import { PLAN } from "@/lib/copy/plan";
import { dollarsToCents } from "@/lib/plan-catalog";
import type { Procedure, TreatmentItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EvidenceBadge } from "@/components/Primitives";
import { TreatmentPlanReader } from "./TreatmentPlanReader";

/**
 * TreatmentPlanImporter (spec §4.5 "Add a procedure"): one treatment item typed from the dentist's estimate. The `<select>` lists only the
 * 16 fixed procedure identifiers (`procedures.name`, with the category hint in small text); free text goes into `procedure_name`; the
 * tooth field appears only when `tooth_or_area_relevant`. Dentist's fee and allowed amount are separate fields; an allowed amount needs
 * its source. Submits `POST /me/treatment-items` and hands the created item to the caller, which re-estimates. Codes appear only as
 * written on the user's own estimate (`code_as_written`, UI.codesNote). Nothing is computed here beyond dollars → cents.
 * Above the form, `TreatmentPlanReader` reads a whole estimate (pasted text, photo or PDF; addendum D.5a); the lines the user ticks are
 * created in one request and `onAdded` is called once with the last of them, so the caller re-estimates once.
 */
export interface TreatmentPlanImporterProps {
  procedures: Procedure[];
  onAdded: (item: TreatmentItem) => void;
  compact?: boolean;
}

export function TreatmentPlanImporter({ procedures, onAdded, compact }: TreatmentPlanImporterProps) {
  const id = useId();
  const [key, setKey] = useState(procedures[0]?.key ?? "");
  const [name, setName] = useState("");
  const [tooth, setTooth] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [fee, setFee] = useState("");
  const [allowed, setAllowed] = useState("");
  const [allowedSource, setAllowedSource] = useState("");
  const [network, setNetwork] = useState("");
  const [prep, setPrep] = useState("");
  const [completion, setCompletion] = useState("");
  const [appointment, setAppointment] = useState("");
  const [status, setStatus] = useState("planned");
  const [source, setSource] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const proc = procedures.find((p) => p.key === key) ?? procedures[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const feeC = dollarsToCents(fee), allowedC = dollarsToCents(allowed);
    if (feeC == null) errs.fee = PLAN.addFeeRequired;
    if (allowedC === undefined) errs.allowed = PLAN.amountOrEmpty;
    if (allowedC != null && !allowedSource.trim()) errs.allowedSource = PLAN.addAllowedSourceRequired;
    if (!source.trim()) errs.source = PLAN.addSourceRequired;
    if (!proc) errs.key = PLAN.procedureRequired;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); setMessage(null);
    try {
      const item = await api.addItem({
        procedure_key: proc!.key, procedure_name: name.trim() || null, tooth: proc!.tooth_or_area_relevant && tooth.trim() ? tooth.trim() : null,
        quantity: Math.max(1, Number(quantity) || 1), dentist_fee_cents: feeC!, allowed_cents: allowedC ?? null, allowed_source: allowedC != null ? allowedSource.trim() : null,
        code_as_written: code.trim() || null, network: network || null, appointment_date: appointment || null, planned_prep: prep || null, planned_completion: completion || null,
        status, source: source.trim(),
      });
      setMessage(PLAN.addAdded(name.trim() || proc!.name));
      setName(""); setTooth(""); setFee(""); setAllowed(""); setAllowedSource(""); setCode("");
      onAdded(item);
    } catch { setMessage(PLAN.addError); }
    finally { setBusy(false); }
  }
  const err = (k: string) => (errors[k] ? <small id={`${id}-${k}-e`} className="bs-error" role="alert">{errors[k]}</small> : null);
  const describe = (k: string) => (errors[k] ? `${id}-${k}-e` : undefined);

  return (
    <div className={`tpi ${compact ? "is-compact" : ""}`}>
    <TreatmentPlanReader onConfirmed={(items) => { if (items.length) onAdded(items[items.length - 1]); }} />
    <form className={`tpi-form ${compact ? "is-compact" : ""}`} onSubmit={submit} aria-labelledby={`${id}-h`} noValidate>
      <h4 id={`${id}-h`} className="bs-h">{PLAN.readManualTitle}</h4>
      <p className="bs-note">{PLAN.addIntro}</p>
      <div className="bs-grid">
        <label className="bs-span">{PLAN.addProcedure}
          <select value={key} onChange={(e) => setKey(e.target.value)} aria-describedby={`${id}-hint`}>
            {procedures.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <small id={`${id}-hint`} className="muted small">{proc ? PLAN.addCategoryHint(proc.category_hint) : ""}</small>
        </label>
        <label>{PLAN.addProcedureName}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        {proc?.tooth_or_area_relevant && <label>{PLAN.addTooth}<input value={tooth} onChange={(e) => setTooth(e.target.value)} placeholder="19" /></label>}
        <label>{PLAN.addQuantity}<input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
        <label>{PLAN.addFee}<input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} required aria-invalid={!!errors.fee} aria-describedby={describe("fee")} placeholder="125.00" />{err("fee")}</label>
        <label>{PLAN.addAllowed}<input inputMode="decimal" value={allowed} onChange={(e) => setAllowed(e.target.value)} aria-invalid={!!errors.allowed} aria-describedby={describe("allowed")} placeholder="82.00" />{err("allowed")}</label>
        <label>{PLAN.addAllowedSource}<input value={allowedSource} onChange={(e) => setAllowedSource(e.target.value)} aria-invalid={!!errors.allowedSource} aria-describedby={describe("allowedSource") ?? `${id}-as`} /><small id={`${id}-as`} className="muted small">{PLAN.addAllowedSourceNote}</small>{err("allowedSource")}</label>
        <label>{PLAN.addNetwork}
          <select value={network} onChange={(e) => setNetwork(e.target.value)}>
            <option value="">{PLAN.bsNetworkUnknown}</option><option value="in">{PLAN.bsNetworkIn}</option><option value="out">{PLAN.bsNetworkOut}</option>
          </select>
        </label>
        <label>{PLAN.addPlannedPrep}<input type="date" value={prep} onChange={(e) => setPrep(e.target.value)} /></label>
        <label>{PLAN.addPlannedCompletion}<input type="date" value={completion} onChange={(e) => setCompletion(e.target.value)} /></label>
        <label>{PLAN.addAppointment}<input type="date" value={appointment} onChange={(e) => setAppointment(e.target.value)} /></label>
        <label>{PLAN.addStatus}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="planned">{PLAN.statusPlanned}</option><option value="scheduled">{PLAN.statusScheduled}</option><option value="consultation_mentioned">{PLAN.statusMentioned}</option>
          </select>
        </label>
        <label>{PLAN.addSource}<input value={source} onChange={(e) => setSource(e.target.value)} required aria-invalid={!!errors.source} aria-describedby={describe("source")} placeholder={PLAN.addSourcePlaceholder} />{err("source")}</label>
        <label>{PLAN.addCode}<input value={code} onChange={(e) => setCode(e.target.value)} aria-describedby={`${id}-code`} /><small id={`${id}-code`} className="muted small">{UI.codesNote}</small></label>
      </div>
      <div className="bs-actions">
        <Button type="submit" size="touch" disabled={busy || !proc}>{PLAN.addSubmit}</Button>
        <span className="bs-user"><EvidenceBadge status="USER" /></span>
      </div>
      {message && <p className="bs-status" role="status">{message}</p>}
    </form>
    </div>
  );
}

export default TreatmentPlanImporter;
