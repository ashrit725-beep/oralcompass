import { useCallback, useEffect, useRef, useState } from "react";
import Stepper, { Step } from "@/components/ui/Stepper";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { UPLOAD } from "@/lib/copy/upload";
import type { PlanRef, UploadedPlanSummary } from "@/lib/types";
import { isTerminal, pollExtraction, startErrorCopy, type ExtractionStatusFull, type UploadResponseX } from "@/lib/upload";
import { ExtractionProgress } from "./ExtractionProgress";
import { PaneHeading } from "./PaneHeading";
import { PlanUpload } from "./PlanUpload";
import { RedactionPreview } from "./RedactionPreview";
import { ReviewTable, type PublishResult } from "./ReviewTable";

/**
 * UploadWizardBody (spec §7.3, component plan N6): the React Bits Stepper with a CONTROLLED step gated by the real pipeline:
 * 1 Choose a file (201 from POST /me/documents/upload) → 2 Redaction preview → 3 Extraction (POST /extract; demo mode returns the terminal
 * status at once, live mode is polled every 1.5 s) → 4 Review and publish. Indicators are disabled status buttons (`aria-current="step"`);
 * each pane carries its own Continue button so the gate is explicit. Lazy-loaded by UploadWizard so pdf.js, the table and the Stepper stay
 * out of the main chunk. Reduced motion: the Stepper's slide/height spring is dropped by MotionConfig; panes render in place.
 */
export interface UploadWizardBodyProps {
  planRef: PlanRef;
  onPublished?: (summary: UploadedPlanSummary, planRef: PlanRef) => void;
  /** demo-17: the published panel's explicit "Show this journey on UPn" choice. */
  onUsePlan?: (planRef: PlanRef) => void;
  onClose: () => void;
  /** The dialog shell widens for the review step. */
  onStepChange?: (step: number) => void;
}

type Health = { llm_mode: "demo" | "live"; llm_model?: string | null };
let healthCache: Promise<Health> | null = null;
const health = () => (healthCache ??= api.health().then((h) => ({ llm_mode: h.llm_mode, llm_model: h.llm_model ?? null })).catch(() => { healthCache = null; return { llm_mode: "demo" as const, llm_model: null }; }));

export function UploadWizardBody({ onPublished, onUsePlan, onClose, onStepChange }: UploadWizardBodyProps) {
  const [step, setStep] = useState(1);
  useEffect(() => { onStepChange?.(step); }, [step, onStepChange]);
  const [mode, setMode] = useState<Health | null>(null);
  const [upload, setUpload] = useState<UploadResponseX | null>(null);
  const [preview, setPreview] = useState<UploadResponseX["redaction_preview"] | null>(null);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<ExtractionStatusFull | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);   // shown on step 2, where the person still is (web-correctness-19)
  const [published, setPublished] = useState<PublishResult | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { health().then(setMode); }, []);
  useEffect(() => () => abort.current?.abort(), []);

  const onUploaded = useCallback((resp: UploadResponseX) => { setUpload(resp); setPreview(resp.redaction_preview); setStep(2); }, []);

  const startExtraction = useCallback(async () => {
    if (!upload || starting) return;
    setStarting(true); setPollError(null); setStartError(null);
    try {
      await api.extract(upload.id);
    } catch (e) {
      // 409 extraction_in_progress: a run already exists; fall through to polling it
      if (!(e instanceof ApiError && e.status === 409)) { setStartError(startErrorCopy(e)); setStarting(false); return; }
    }
    setStep(3);
    setStarting(false);
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      await pollExtraction(upload.id, (st) => { if (!ctl.signal.aborted) setStatus(st); }, { signal: ctl.signal });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError") && !ctl.signal.aborted) setPollError(UPLOAD.pollingFailed);
    }
  }, [upload, starting]);

  const onFields = useCallback((r: { fields: ExtractionStatusFull["fields"]; counts?: ExtractionStatusFull["counts"]; undecided_required?: string[] }) => {
    setStatus((s) => (s ? { ...s, fields: r.fields, counts: r.counts ?? s.counts, undecided_required: r.undecided_required ?? s.undecided_required } : s));
  }, []);

  const onPublishedLocal = useCallback((r: PublishResult) => { setPublished(r); onPublished?.(r.summary, r.plan_ref); }, [onPublished]);

  const terminal = isTerminal(status?.status);
  const stepLabel = (n: number) => UPLOAD.stepLabel(n, UPLOAD.stepName(n));

  return (
    <div className="up-wizard">
      {upload && <p className="up-caption up-file-line">{UPLOAD.fileSummary(upload.filename, upload.pages, upload.sha256)}{upload.demo_fixture_match && <> · {UPLOAD.demoFixtureMatch}</>}</p>}
      <Stepper step={step} onStepChange={setStep} stepLabel={stepLabel} stepName={UPLOAD.stepName} allComplete={!!published} disableStepIndicators stepCircleContainerClassName="up-stepper max-w-none" contentClassName="up-stepper-content">
        <Step>
          <PlanUpload onUploaded={onUploaded} mode={mode?.llm_mode ?? null} model={mode?.llm_model} />
        </Step>
        <Step>
          {upload && preview && <RedactionPreview docId={upload.id} preview={preview} onPreview={setPreview} onContinue={startExtraction} busy={starting} startError={startError} />}
        </Step>
        <Step>
          <ExtractionProgress status={status} starting={starting} pollError={pollError} onReview={() => setStep(4)} />
        </Step>
        <Step>
          {published ? (
            <div className="up-published">
              <PaneHeading>{UPLOAD.published(published.version_label)}</PaneHeading>
              <p>{UPLOAD.publishedBody(published.version_label)}</p>
              {published.summary.is_fictional && <p className="ribbon up-ribbon">{UPLOAD.fictional}</p>}
              {onUsePlan && <p className="up-caption">{UPLOAD.publishedKept}</p>}
              <div className="up-actions">
                {onUsePlan && <Button type="button" variant="outline" size="touch" onClick={() => onUsePlan(published.plan_ref)}>{UPLOAD.showJourneyOn(published.version_label)}</Button>}
                <Button type="button" size="touch" onClick={onClose}>{UPLOAD.close}</Button>
              </div>
            </div>
          ) : upload && status && terminal ? (
            <ReviewTable docId={upload.id} status={status} onFields={onFields} onPublished={onPublishedLocal} />
          ) : (
            <p className="up-caption">{UPLOAD.extractionNotStarted}</p>
          )}
        </Step>
      </Stepper>
    </div>
  );
}

export default UploadWizardBody;
