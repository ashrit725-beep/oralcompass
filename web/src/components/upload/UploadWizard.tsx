import { Suspense, lazy, useCallback, useState } from "react";
import { StageLoader } from "@/components/StageLoader";
import { X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { UPLOAD } from "@/lib/copy/upload";
import type { PlanRef, UploadedPlanSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const UploadWizardBody = lazy(() => import("./UploadWizardBody").then((m) => ({ default: m.UploadWizardBody })));

/**
 * UploadWizard (owner: web upload-review + assistant agent; spec §7.3, component plan N6). Replaces the day-1 stub IN PLACE with the same props.
 * A bottom sheet (vaul Drawer over Radix Dialog: role="dialog", aria-modal, focus trap, Escape; mobile-only direction, part E) at 92 %
 * of the dynamic viewport, with a sticky title bar and a scrolling body, hosting the lazily loaded wizard body: upload → redaction
 * preview → extraction (real stages) → review → HoldButton publish. The foundation renders it through `DocumentsView`'s `uploadSlot` and `PlanSelector`'s `uploadSlot`.
 *
 * Props (frozen contract, unchanged):
 * - `planRef`: the plan currently selected (presets or an earlier upload); informational, the wizard never writes to it.
 * - `onPublished(summary, planRef)`: called once `POST /me/documents/{id}/publish` returns 201, with the `UploadedPlanSummary`
 *   (`plan_code` = `"upload:<document_id>"`, `version_label` "UP1"…) and that `plan_ref`. The caller refreshes its upload list; it does NOT
 *   switch the journey's plan (demo-17). `onUsePlan(planRef)` (optional) backs the published panel's "Show this journey on UPn" button,
 *   where the caller runs `selectPlan` and `reestimate()`. Default: no-op; the dialog shows the published label either way.
 * - `open` / `onOpenChange`: controlled sheet state; uncontrolled when omitted.
 * - `trigger`: an inline trigger rendered with `DrawerTrigger asChild`; when omitted and the sheet is uncontrolled, a 44 px
 *   "Add a plan document" button renders. Strings come from `UPLOAD` (lib/copy/upload.ts); styles from styles/upload.css.
 * Reduced motion: vaul's slide is zeroed in styles.css ([data-vaul-drawer]); the body's own guards are documented per component.
 */
export interface UploadWizardProps {
  /** The plan currently selected (presets or an earlier upload). */
  planRef: PlanRef;
  /** Called with the published version; the foundation then calls `selectPlan(summary.plan_code)` / `reestimate()`. */
  onPublished?: (summary: UploadedPlanSummary, planRef: PlanRef) => void;
  /** demo-17: publishing never switches the journey's plan; when given, the published panel offers "Show this journey on UPn". */
  onUsePlan?: (planRef: PlanRef) => void;
  /** Controls the dialog from the outside (PlanSelector Upload branch, Documents "Your documents" slot). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional trigger rendered inline (e.g. a 44 px "Add a plan document" button). */
  trigger?: React.ReactNode;
}

export function UploadWizard({ planRef, onPublished, onUsePlan, open, onOpenChange, trigger }: UploadWizardProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const [step, setStep] = useState(1);
  const isOpen = open ?? innerOpen;
  const setOpen = useCallback((v: boolean) => { setInnerOpen(v); onOpenChange?.(v); if (!v) setStep(1); }, [onOpenChange]);
  const showDefaultTrigger = trigger === undefined && open === undefined;

  return (
    <Drawer open={isOpen} onOpenChange={setOpen} direction="bottom" autoFocus>
      {trigger !== undefined && trigger !== null && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      {showDefaultTrigger && (
        <DrawerTrigger asChild>
          {/* a native button: the shadcn Button is a plain function component and cannot take the trigger's ref */}
          <button type="button" className={cn(buttonVariants({ variant: "outline", size: "touch" }), "up-trigger")}>{UPLOAD.trigger}</button>
        </DrawerTrigger>
      )}
      <DrawerContent
        handleLabel={UPLOAD.close}
        aria-modal="true"
        data-step={step}
        className="up-dialog up-sheet oc-col-sheet"
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(".up-title")?.focus({ preventScroll: true }); }}
      >
        <div className="up-sheet-bar">
          <DrawerTitle className="up-title" tabIndex={-1}>{UPLOAD.title}</DrawerTitle>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon-touch" aria-label={UPLOAD.close} className="-mr-2 shrink-0"><X aria-hidden="true" /></Button>
          </DrawerClose>
        </div>
        {/* the body scrolls (sticky review footer inside it); drags start only on the handle and the title bar, so a press-and-hold on
            the publish control or a scroll through the review rows never moves the sheet */}
        <div className="up-sheet-body" data-vaul-no-drag="">
          <DrawerDescription className="up-caption">{UPLOAD.description}</DrawerDescription>
          {isOpen && (
            <Suspense fallback={<StageLoader label={UPLOAD.loadingWizard} size="sm" />}>
              <UploadWizardBody planRef={planRef} onPublished={onPublished} onUsePlan={onUsePlan ? (ref) => { onUsePlan(ref); setOpen(false); } : undefined} onClose={() => setOpen(false)} onStepChange={setStep} />
            </Suspense>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default UploadWizard;
