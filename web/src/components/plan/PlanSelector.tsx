import { useId, useMemo, type ReactNode } from "react";
import { PLAN } from "@/lib/copy/plan";
import { fastPathLabel, firstCode, groupPlans, locatePlan, modeOf, uploadLabel, type UploadSummary } from "@/lib/plan-catalog";
import type { PlanRef, PlanSummary } from "@/lib/types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

/**
 * PlanSelector (spec §7.1–7.2; addendum B1/B2/B3 graft: keep ONE `label.plan-pick select` of plan codes as the fast path).
 * - Preset mode: carrier → plan (name + option) → plan year cascading selects built from the GET /plans summaries; fictional carriers sit
 *   under one "Fictional demonstration plans" group; a plan with one year shows that year disabled. Every select writes the same `value`.
 * - Upload mode: the published documents (`GET /me/plans`, labelled UP1 · filename) and the `uploadSlot` (the UploadWizard entry).
 * - The grouped fast-path `<select>` (optgroup per carrier, plus "Your uploaded documents") is always rendered inside `label.plan-pick`
 *   so keyboard users and tools/screenshots.py (`select_option('FM26H')`) keep one control; the cascade is hidden on phones (plan.css).
 * Real controls only; the mode switch is a shadcn ToggleGroup (role=radio, 44 px). No sorting by anything but the carrier's name.
 */
export interface PlanSelectorProps {
  plans: PlanSummary[];
  uploads: UploadSummary[];
  value: PlanRef;
  onChange: (ref: PlanRef) => void;
  mode: "preset" | "upload";
  onMode: (m: "preset" | "upload") => void;
  /** Rendered when mode is Upload (the UploadWizard trigger / dialog). */
  uploadSlot?: ReactNode;
  uploadsLoading?: boolean;
  className?: string;
}

export function PlanSelector({ plans, uploads, value, onChange, mode, onMode, uploadSlot, uploadsLoading, className }: PlanSelectorProps) {
  const id = useId();
  const carriers = useMemo(() => groupPlans(plans), [plans]);
  const hit = locatePlan(carriers, value);
  const carrier = hit?.carrier;
  const plan = hit?.plan;
  const real = carriers.filter((c) => !c.fictional);
  const fictional = carriers.filter((c) => c.fictional);

  return (
    <div className={cn("plan-selector", className)}>
      <div className="ps-mode">
        <span id={`${id}-mode`} className="ps-mode-label">{PLAN.sourceLabel}</span>
        <ToggleGroup type="single" variant="outline" spacing={0} value={mode} onValueChange={(v) => v && onMode(v as "preset" | "upload")} aria-labelledby={`${id}-mode`} className="ps-toggle">
          <ToggleGroupItem value="preset" className="min-h-11 px-4 text-base">{PLAN.modePreset}</ToggleGroupItem>
          <ToggleGroupItem value="upload" className="min-h-11 px-4 text-base">{PLAN.modeUpload}{uploads.length ? ` (${uploads.length})` : ""}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="ps-row">
        <label className="plan-pick">{PLAN.planCode}
          <select value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-fast`}>
            {!hit && !uploads.some((u) => u.plan_code === value) && <option value="">{PLAN.cmpNone}</option>}
            {real.length > 0 && real.map((c) => (
              <optgroup key={c.key} label={c.label}>
                {c.plans.flatMap((p) => p.years.map((y) => <option key={y.code} value={y.code}>{fastPathLabel(y.summary)}</option>))}
              </optgroup>
            ))}
            {fictional.length > 0 && (
              <optgroup label={PLAN.fictionalGroup}>
                {fictional.flatMap((c) => c.plans.flatMap((p) => p.years.map((y) => <option key={y.code} value={y.code}>{fastPathLabel(y.summary)}</option>)))}
              </optgroup>
            )}
            {uploads.length > 0 && (
              <optgroup label={PLAN.uploadsGroup}>
                {uploads.map((u) => <option key={u.plan_code} value={u.plan_code}>{uploadLabel(u)}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <span id={`${id}-fast`} className="sr-only">{mode === "upload" ? PLAN.modeUpload : PLAN.modePreset}</span>

        {mode === "preset" && (
          <div className="ps-cascade" role="group" aria-label={PLAN.modePreset}>
            <label>{PLAN.carrier}
              <select aria-label={PLAN.carrier} value={carrier?.key ?? ""} onChange={(e) => { const c = carriers.find((x) => x.key === e.target.value); const code = firstCode(c); if (code) onChange(code); }}>
                {!carrier && <option value="">{PLAN.cmpNone}</option>}
                {real.length > 0 && <optgroup label={PLAN.publicGroup}>{real.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</optgroup>}
                {fictional.length > 0 && <optgroup label={PLAN.fictionalGroup}>{fictional.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</optgroup>}
              </select>
            </label>
            <label>{PLAN.planName}
              <select aria-label={PLAN.planName} value={plan?.key ?? ""} disabled={!carrier} onChange={(e) => { const p = carrier?.plans.find((x) => x.key === e.target.value); const code = firstCode(carrier, p); if (code) onChange(code); }}>
                {!plan && <option value="">{PLAN.cmpNone}</option>}
                {carrier?.plans.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <label>{PLAN.planYear}
              <select aria-label={PLAN.planYear} value={hit?.year.code ?? ""} disabled={!plan || plan.years.length <= 1} onChange={(e) => e.target.value && onChange(e.target.value)}>
                {!plan && <option value="">{PLAN.cmpNone}</option>}
                {plan?.years.map((y) => <option key={y.code} value={y.code}>{y.year ?? PLAN.notProvided}</option>)}
              </select>
            </label>
          </div>
        )}

        {mode === "upload" && (
          <div className="ps-upload" role="group" aria-label={PLAN.modeUpload}>
            {uploadsLoading ? <p className="muted small">{PLAN.uploadsLoading}</p> : uploads.length === 0 ? <p className="muted small ps-noup">{PLAN.noUploads}</p> : (
              <label>{PLAN.uploadedPlan}
                <select aria-label={PLAN.uploadedPlan} value={modeOf(value) === "upload" ? value : ""} onChange={(e) => e.target.value && onChange(e.target.value)}>
                  {modeOf(value) !== "upload" && <option value="">{PLAN.cmpNone}</option>}
                  {uploads.map((u) => <option key={u.plan_code} value={u.plan_code}>{PLAN.uploadVersion(uploadLabel(u), (u.published_at ?? "").slice(0, 10))}</option>)}
                </select>
              </label>
            )}
            {uploadSlot}
          </div>
        )}
      </div>
    </div>
  );
}

export default PlanSelector;
