import { Suspense, lazy, useCallback, useState } from "react";
import { StageLoader } from "@/components/StageLoader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UPLOAD } from "@/lib/copy/upload";
import type { PlanRef, UploadedPlanSummary } from "@/lib/types";

const UploadWizardBody = lazy(() => import("./UploadWizardBody").then((m) => ({ default: m.UploadWizardBody })));

/**
 * UploadWizard (owner: web upload-review + assistant agent; spec §7.3, component plan N6). Replaces the day-1 stub IN PLACE with the same props.
 * A shadcn Dialog (560 px; full-height on phones) hosting the lazily loaded wizard body: upload → redaction preview → extraction (real
 * stages) → review → HoldButton publish. The foundation renders it through `DocumentsView`'s `uploadSlot` and `PlanSelector`'s `uploadSlot`.
 *
 * Props (frozen contract, unchanged):
 * - `planRef`: the plan currently selected (presets or an earlier upload); informational, the wizard never writes to it.
 * - `onPublished(summary, planRef)`: called once `POST /me/documents/{id}/publish` returns 201, with the `UploadedPlanSummary`
 *   (`plan_code` = `"upload:<document_id>"`, `version_label` "UP1"…) and that `plan_ref`. The caller then runs
 *   `selectPlan(summary.plan_code)` and `reestimate()` (foundation notes §2.1). Default: no-op; the dialog shows the published label either way.
 * - `open` / `onOpenChange`: controlled dialog state; uncontrolled when omitted.
 * - `trigger`: an inline trigger rendered with `DialogTrigger asChild`; when omitted and the dialog is uncontrolled, a 44 px
 *   "Add a plan document" button renders. Strings come from `UPLOAD` (lib/copy/upload.ts); styles from styles/upload.css.
 * Reduced motion: the Dialog's animate-in/out classes are disabled in styles.css; the body's own guards are documented per component.
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

export function UploadWizard({ planRef, onPublished, open, onOpenChange, trigger }: UploadWizardProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = useCallback((v: boolean) => { setInnerOpen(v); onOpenChange?.(v); }, [onOpenChange]);
  const showDefaultTrigger = trigger === undefined && open === undefined;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger !== undefined && trigger !== null && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {showDefaultTrigger && (
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="touch" className="up-trigger">{UPLOAD.trigger}</Button>
        </DialogTrigger>
      )}
      <DialogContent
        closeLabel={UPLOAD.close}
        className="up-dialog sm:max-w-[560px] max-h-[92dvh] overflow-y-auto max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0"
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("h2")?.focus(); }}
      >
        <DialogHeader>
          <DialogTitle className="up-title" tabIndex={-1}>{UPLOAD.title}</DialogTitle>
          <DialogDescription className="up-caption">{UPLOAD.description}</DialogDescription>
        </DialogHeader>
        {isOpen && (
          <Suspense fallback={<StageLoader label={UPLOAD.loadingWizard} size="sm" />}>
            <UploadWizardBody planRef={planRef} onPublished={onPublished} onClose={() => setOpen(false)} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default UploadWizard;
