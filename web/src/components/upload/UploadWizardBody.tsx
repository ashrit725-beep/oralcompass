import { useCallback, useEffect, useRef, useState } from "react";
import Stepper, { Step } from "@/components/ui/Stepper";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { UPLOAD } from "@/lib/copy/upload";
import type { RedactionResult } from "@/lib/redact";
import type { PlanRef, UploadedPlanSummary } from "@/lib/types";
import {
  buildClientRedaction, isTerminal, MAX_PREVIEW_CHARS, pollExtraction, serverRedactionSummary, startErrorCopy, uploadErrorCopy,
  type ExtractionStatusFull, type UploadResponseX,
} from "@/lib/upload";
import { ExtractionProgress } from "./ExtractionProgress";
import { PaneHeading } from "./PaneHeading";
import { PlanUpload, type PreparedUpload } from "./PlanUpload";
import { RedactionSummary } from "./RedactionSummary";
import { ReviewTable, type PublishResult } from "./ReviewTable";

/**
 * UploadWizardBody (spec §7.3, component plan N6; client redaction design point 2): the React Bits Stepper with a CONTROLLED step gated by
 * the real pipeline. Personal details are reviewed BEFORE anything is uploaded:
 * 1 Choose a file (or the fictional sample): checksum, page count, pdf.js text layer and the identifier detector, all on this device →
 * 2 Personal details (RedactionSummary: the count, the list, Keep in text, the person's own terms, the redacted text) → Continue uploads
 *   the PDF with `client_redaction` (POST /me/documents/upload) and starts extraction (POST /extract) →
 * 3 Extraction (demo mode returns the terminal status at once, live mode is polled every 1.5 s; the redaction row carries the server's
 *   count) → 4 Review and publish (the review table opens with the server's "N personal identifiers removed before AI analysis").
 * Indicators are disabled status buttons (`aria-current="step"`); each pane carries its own Continue so the gate is explicit. Lazy-loaded
 * by UploadWizard so pdf.js, the detector, the table and the Stepper stay out of the main chunk. Reduced motion: the Stepper's slide is
 * dropped by MotionConfig; panes render in place.
 */
export interface UploadWizardBodyProps {
  planRef: PlanRef;
  onPublished?: (summary: UploadedPlanSummary, planRef: PlanRef) => void;
  /** demo-17: the published panel's explicit "Show this journey on UPn" choice. */
  onUsePlan?: (planRef: PlanRef) => void;
  onClose: () => void;
  /** The dialog shell widens for the review steps. */
  onStepChange?: (step: number) => void;
}

type Health = { llm_mode: "demo" | "live"; llm_model?: string | null };
let healthCache: Promise<Health> | null = null;
const health = () => (healthCache ??= api.health().then((h) => ({ llm_mode: h.llm_mode, llm_model: h.llm_model ?? null })).catch(() => { healthCache = null; return { llm_mode: "demo" as const, llm_model: null }; }));

export function UploadWizardBody({ onPublished, onUsePlan, onClose, onStepChange }: UploadWizardBodyProps) {
  const [step, setStep] = useState(1);
  useEffect(() => { onStepChange?.(step); }, [step, onStepChange]);
  const [mode, setMode] = useState<Health | null>(null);
  const [prepared, setPrepared] = useState<PreparedUpload | null>(null);
  const [upload, setUpload] = useState<UploadResponseX | null>(null);
  const [busy, setBusy] = useState<"uploading" | "starting" | null>(null);
  const [status, setStatus] = useState<ExtractionStatusFull | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);   // upload or start failures, shown on step 2 where the person still is
  const [published, setPublished] = useState<PublishResult | null>(null);
  const abort = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  useEffect(() => { health().then(setMode); }, []);
  useEffect(() => () => abort.current?.abort(), []);

  const onPreparedFile = useCallback((p: PreparedUpload) => { setPrepared(p); setUpload(null); setReviewError(null); setStep(2); }, []);
  const chooseAnother = useCallback(() => { if (busyRef.current) return; setPrepared(null); setReviewError(null); setStep(1); }, []);

  const startExtraction = useCallback(async (up: UploadResponseX) => {
    setBusy("starting");
    try {
      await api.extract(up.id);
    } catch (e) {
      // 409 extraction_in_progress: a run already exists; fall through to polling it
      if (!(e instanceof ApiError && e.status === 409)) { setReviewError(startErrorCopy(e)); return false; }
    }
    setStep(3);
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    void pollExtraction(up.id, (st) => { if (!ctl.signal.aborted) setStatus(st); }, { signal: ctl.signal }).catch((e) => {
      if (!(e instanceof DOMException && e.name === "AbortError") && !ctl.signal.aborted) setPollError(UPLOAD.pollingFailed);
    });
    return true;
  }, []);

  /** Step 2 Continue: upload once (with the confirmed identifiers), then start extraction. A failed start retries the start only. */
  const onContinue = useCallback(async ({ result, terms }: { result: RedactionResult; terms: string[] }) => {
    if (!prepared || busyRef.current) return;
    busyRef.current = true;
    setReviewError(null);
    try {
      let up = upload;
      if (!up) {
        setBusy("uploading");
        const payload = JSON.stringify(buildClientRedaction(result, terms));
        // the text preview the server falls back to is the REDACTED text: the raw text layer never leaves this device
        const redactedText = result.pages.join("\n").slice(0, MAX_PREVIEW_CHARS);
        try {
          up = (await api.uploadDocument(prepared.file, prepared.prepared.sha256, prepared.prepared.pages, redactedText, payload)) as UploadResponseX;
        } catch (e) {
          setReviewError(uploadErrorCopy(e));
          return;
        }
        setUpload(up);
      }
      await startExtraction(up);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, [prepared, upload, startExtraction]);

  const onFields = useCallback((r: { fields: ExtractionStatusFull["fields"]; counts?: ExtractionStatusFull["counts"]; undecided_required?: string[] }) => {
    setStatus((s) => (s ? { ...s, fields: r.fields, counts: r.counts ?? s.counts, undecided_required: r.undecided_required ?? s.undecided_required } : s));
  }, []);

  const onPublishedLocal = useCallback((r: PublishResult) => { setPublished(r); onPublished?.(r.summary, r.plan_ref); }, [onPublished]);

  const terminal = isTerminal(status?.status);
  const stepLabel = (n: number) => UPLOAD.stepLabel(n, UPLOAD.stepName(n));
  // the server's count is authoritative after upload: GET extraction first, the upload response until extraction reports one
  const serverSummary = serverRedactionSummary(status) ?? serverRedactionSummary(upload);
  const fileLine = upload
    ? UPLOAD.fileSummary(upload.filename, upload.pages, upload.sha256)
    : prepared ? UPLOAD.fileSummary(prepared.file.name, prepared.prepared.pages, prepared.prepared.sha256) : null;

  return (
    <div className="up-wizard">
      {fileLine && step > 1 && <p className="up-caption up-file-line">{fileLine}{upload?.demo_fixture_match && <> · {UPLOAD.demoFixtureMatch}</>}</p>}
      <Stepper step={step} onStepChange={setStep} stepLabel={stepLabel} stepName={UPLOAD.stepName} allComplete={!!published} disableStepIndicators stepCircleContainerClassName="up-stepper max-w-none" contentClassName="up-stepper-content">
        <Step>
          <PlanUpload onPrepared={onPreparedFile} mode={mode?.llm_mode ?? null} model={mode?.llm_model} />
        </Step>
        <Step>
          {prepared && (
            <RedactionSummary
              key={`${prepared.prepared.sha256}:${prepared.file.name}`}
              pageTexts={prepared.prepared.pageTexts}
              found={prepared.found}
              onContinue={(r) => { void onContinue(r); }}
              onChooseAnother={chooseAnother}
              busy={busy}
              stored={!!upload}
              error={reviewError}
            />
          )}
        </Step>
        <Step>
          <ExtractionProgress status={status} starting={busy === "starting" || (!!upload && !status)} pollError={pollError} onReview={() => setStep(4)} redaction={serverSummary} />
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
            <ReviewTable docId={upload.id} status={status} onFields={onFields} onPublished={onPublishedLocal} redaction={serverSummary} />
          ) : (
            <p className="up-caption">{UPLOAD.extractionNotStarted}</p>
          )}
        </Step>
      </Stepper>
    </div>
  );
}

export default UploadWizardBody;
