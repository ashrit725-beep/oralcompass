import type { PlanRef, UploadedPlanSummary } from "@/lib/types";

/**
 * UploadWizard — day-1 STUB (owner: web upload-review + assistant agent; spec §7.3, component plan N6).
 * Contract: a Dialog (560 px; phone full-height sheet) hosting the React Bits Stepper with the four panes (upload → redaction preview →
 * extraction → review) and the HoldButton publish step. The foundation renders it through `DocumentsView`'s `uploadSlot` and
 * `PlanSelector`'s `uploadSlot`. Strings come from `UPLOAD` in lib/copy/upload.ts.
 */
export interface UploadWizardProps {
  /** The plan currently selected (presets or an earlier upload). */
  planRef: PlanRef;
  /** Called with the published version; the foundation then calls `selectPlan(summary.plan_code)` / `reestimate()`. */
  onPublished?: (summary: UploadedPlanSummary, planRef: PlanRef) => void;
  /** Controls the dialog from the outside (PlanSelector Upload branch, Documents "Your documents" slot). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional trigger rendered inline (e.g. a 44 px "Add a plan document" button). */
  trigger?: React.ReactNode;
}

export function UploadWizard(_props: UploadWizardProps) {
  return null;
}

export default UploadWizard;
