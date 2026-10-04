import { useId, useMemo, type ReactNode } from "react";
import { PLAN } from "@/lib/copy/plan";
import { fastPathLabel, fullPlanLabel, groupPlans, locatePlan, modeOf, uploadLabel, type UploadSummary } from "@/lib/plan-catalog";
import type { PlanRef, PlanSummary } from "@/lib/types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

/**
 * PlanSelector (spec §7.1–7.2; addendum B1/B2/B3 graft: keep ONE `label.plan-pick select` of plan codes as the fast path).
 * - Preset mode: the grouped select below (an optgroup per carrier; fictional carriers under one "Fictional demonstration plans" group).
 *   The desktop carrier → plan → year cascade was removed with the desktop layout (owner direction 06:00: the app is phone-only).
 * - Upload mode: the published documents (`GET /me/plans`, labelled UP1 · filename) and the `uploadSlot` (the UploadWizard entry).
 * - The grouped fast-path `<select>` (optgroup per carrier, plus "Your uploaded documents") is always rendered inside `label.plan-pick`
 *   so keyboard users and tools/screenshots.py (`select_option('FM26H')`) keep one control; the full document title shows under it.
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

/**
 * A native <select> whose closed state is drawn by a wrapping face (WebKit cannot wrap or ellipsize a closed select, so a long plan
 * name was cut mid-word at 320 px). The select is the real control on top (transparent, full size): its name, keyboard, the native
 * picker and `select_option` are unchanged; the face only mirrors the chosen option's text. 16 px text, so iOS never zooms.
 */
function PickSelect({ face, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { face: string }) {
  return (
    <span className="ps-select">
      <span className="ps-face" aria-hidden="true">{face}</span>
      <select {...rest}>{children}</select>
    </span>
  );
}

export function PlanSelector({ plans, uploads, value, onChange, mode, onMode, uploadSlot, uploadsLoading, className }: PlanSelectorProps) {
  const id = useId();
  const carriers = useMemo(() => groupPlans(plans), [plans]);
  const hit = locatePlan(carriers, value);
  const real = carriers.filter((c) => !c.fictional);
  const selectedTitle = hit ? fullPlanLabel(hit.year.summary) : uploads.find((u) => u.plan_code === value)?.title ?? "";
  const fictional = carriers.filter((c) => c.fictional);
  const chosenUpload = uploads.find((u) => u.plan_code === value);
  const pickFace = hit ? fastPathLabel(hit.year.summary) : chosenUpload ? uploadLabel(chosenUpload) : PLAN.cmpNone;
  const uploadFace = chosenUpload ? PLAN.uploadVersion(uploadLabel(chosenUpload), (chosenUpload.published_at ?? "").slice(0, 10)) : PLAN.cmpNone;

  return (
    <div className={cn("plan-selector", className)}>
      <div className="ps-mode">
        <span id={`${id}-mode`} className="ps-mode-label">{PLAN.sourceLabel}</span>
        <ToggleGroup type="single" variant="outline" spacing={0} value={mode} onValueChange={(v) => v && onMode(v as "preset" | "upload")} aria-labelledby={`${id}-mode`} className="ps-toggle w-full">
          <ToggleGroupItem value="preset" className="min-h-11 h-auto whitespace-normal px-3 py-1 text-[15px]">{PLAN.modePreset}</ToggleGroupItem>
          <ToggleGroupItem value="upload" className="min-h-11 h-auto whitespace-normal px-3 py-1 text-[15px]">{PLAN.modeUpload}{uploads.length ? ` (${uploads.length})` : ""}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="ps-row">
        <label className="plan-pick">{PLAN.planCode}
          <PickSelect face={pickFace} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-fast`} title={selectedTitle || undefined}>
            {!hit && !uploads.some((u) => u.plan_code === value) && <option value="">{PLAN.cmpNone}</option>}
            {real.length > 0 && real.map((c) => (
              <optgroup key={c.key} label={c.label}>
                {c.plans.flatMap((p) => p.years.map((y) => <option key={y.code} value={y.code} title={fullPlanLabel(y.summary)}>{fastPathLabel(y.summary)}</option>))}
              </optgroup>
            ))}
            {fictional.length > 0 && (
              <optgroup label={PLAN.fictionalGroup}>
                {fictional.flatMap((c) => c.plans.flatMap((p) => p.years.map((y) => <option key={y.code} value={y.code} title={fullPlanLabel(y.summary)}>{fastPathLabel(y.summary)}</option>)))}
              </optgroup>
            )}
            {uploads.length > 0 && (
              <optgroup label={PLAN.uploadsGroup}>
                {uploads.map((u) => <option key={u.plan_code} value={u.plan_code}>{uploadLabel(u)}</option>)}
              </optgroup>
            )}
          </PickSelect>
        </label>
        <span id={`${id}-fast`} className="sr-only">{mode === "upload" ? PLAN.modeUpload : PLAN.modePreset}</span>
        {/* the closed select shows a compact label; the full document title stays readable under it */}
        {selectedTitle && <p className="ps-current muted small">{selectedTitle}</p>}

        {mode === "upload" && (
          <div className="ps-upload" role="group" aria-label={PLAN.modeUpload}>
            {uploadsLoading ? <p className="muted small">{PLAN.uploadsLoading}</p> : uploads.length === 0 ? <p className="muted small ps-noup">{PLAN.noUploads}</p> : (
              <label>{PLAN.uploadedPlan}
                <PickSelect face={uploadFace} aria-label={PLAN.uploadedPlan} value={modeOf(value) === "upload" ? value : ""} onChange={(e) => e.target.value && onChange(e.target.value)}>
                  {modeOf(value) !== "upload" && <option value="">{PLAN.cmpNone}</option>}
                  {uploads.map((u) => <option key={u.plan_code} value={u.plan_code}>{PLAN.uploadVersion(uploadLabel(u), (u.published_at ?? "").slice(0, 10))}</option>)}
                </PickSelect>
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
