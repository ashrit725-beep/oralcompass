import { useCallback, useId, useRef, useState } from "react";
import FileUpload from "@/components/kokonutui/file-upload";
import { StageLoader } from "@/components/StageLoader";
import { Button } from "@/components/ui/button";
import { UPLOAD } from "@/lib/copy/upload";
import { detectIdentifiers, type FoundIdentifier } from "@/lib/redact";
import { MAX_BYTES, loadSampleStatement, prepareFile, problemCopy, type PreparePhase, type PreparedFile } from "@/lib/upload";

/**
 * PlanUpload (spec §7.3 step 1; client redaction design point 2). The Kokonut drop zone with the real validation chain, all ON THIS DEVICE:
 * `%PDF-` magic bytes, ≤ 32 MB and ≤ 100 pages (pdf.js, lazy chunk), SHA-256 (WebCrypto), the per-page text layer, then the deterministic
 * identifier detector (lib/redact.ts). Nothing is sent here: the wizard uploads only after the person has reviewed what is removed.
 * "Try a fictional sample statement" fetches the public fictional PDF and runs the SAME path as a picked file. Phases are real
 * (checksum → pages → detection) and drive the arc; nothing is simulated. Errors are persistent sentences from UPLOAD; `role="alert"`
 * only for failures. Reduced motion: FileUpload and StageLoader handle their own guards.
 */
export interface PreparedUpload { file: File; prepared: PreparedFile; found: FoundIdentifier[]; sample: boolean }

export interface PlanUploadProps {
  onPrepared: (p: PreparedUpload) => void;
  /** /health llm_mode, for the pre-label under the drop zone. */
  mode: "demo" | "live" | null;
  model?: string | null;
}

function phaseLabel(p: PreparePhase | null): string {
  if (!p) return "";
  if (p.phase === "checksum") return UPLOAD.phaseChecksum;
  if (p.phase === "reading") return UPLOAD.phaseReading(p.done, p.total);
  if (p.phase === "detecting") return UPLOAD.phaseDetecting;
  return UPLOAD.phaseUploading;
}
function phaseIndex(p: PreparePhase | null): number {
  return !p ? 0 : p.phase === "checksum" ? 0 : p.phase === "reading" ? 1 : 2;
}
function phasePercent(p: PreparePhase | null): number {
  if (!p) return 0;
  if (p.phase === "checksum") return 10;
  if (p.phase === "reading") return 10 + Math.round((p.done / Math.max(1, p.total)) * 75);
  return 92;
}
/** One animation frame, so the "Removing personal details on this device" label paints before the synchronous detector runs. */
const nextFrame = () => new Promise<void>((resolve) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 0)));

export function PlanUpload({ onPrepared, mode, model }: PlanUploadProps) {
  const [phase, setPhase] = useState<PreparePhase | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const run = useRef(0);
  const noteId = useId();

  const cancel = useCallback(() => { run.current++; setPhase(null); setFile(null); setSampleBusy(false); }, []);

  const prepare = useCallback(async (f: File, sample: boolean) => {
    const id = ++run.current;
    setError(null); setSampleBusy(false); setFile(f); setPhase({ phase: "checksum" });
    const result = await prepareFile(f, (p) => { if (run.current === id) setPhase(p); });
    if (run.current !== id) return;
    if (!result.ok) { setError(problemCopy[result.problem]); setPhase(null); setFile(null); return; }
    setPhase({ phase: "detecting" });
    await nextFrame();
    if (run.current !== id) return;
    const found = detectIdentifiers(result.prepared.pageTexts);
    if (run.current !== id) return;
    setPhase(null);
    onPrepared({ file: f, prepared: result.prepared, found, sample });
  }, [onPrepared]);

  const onFileSelected = useCallback((f: File) => { void prepare(f, false); }, [prepare]);

  const trySample = useCallback(async () => {
    if (sampleBusy || phase) return;
    const id = run.current;
    setSampleBusy(true); setError(null);
    let f: File;
    try {
      f = await loadSampleStatement();
    } catch {
      if (run.current === id) { setError(UPLOAD.sampleFailed); setSampleBusy(false); }
      return;
    }
    if (run.current !== id) return;      // a file was picked (or the pick cancelled) while the sample loaded
    setSampleBusy(false);
    await prepare(f, true);
  }, [sampleBusy, phase, prepare]);

  const busy = !!phase || sampleBusy;

  return (
    <div className="up-file">
      <FileUpload
        onFileSelected={onFileSelected}
        onCancel={cancel}
        status={phase ? "uploading" : "idle"}
        progress={phase ? phasePercent(phase) : undefined}
        currentFile={file}
        acceptedFileTypes={["application/pdf"]}
        maxFileSize={MAX_BYTES}
        labels={{ title: UPLOAD.fileTitle, hint: UPLOAD.fileHint, choose: UPLOAD.choose, cancel: UPLOAD.cancel, limits: UPLOAD.limits, tooLarge: () => UPLOAD.tooLarge, wrongType: UPLOAD.notPdf }}
        showTitle
      />
      {phase && <StageLoader label={phaseLabel(phase)} stageIndex={phaseIndex(phase)} stages={3} size="sm" className="up-phase" />}
      {sampleBusy && !phase && <StageLoader label={UPLOAD.sampleLoading} size="sm" className="up-phase" />}
      {error && <p role="alert" className="up-error">{error}</p>}
      <div className="up-sample">
        <Button type="button" variant="outline" size="touch" onClick={() => { void trySample(); }} aria-disabled={busy || undefined} aria-describedby={noteId}>
          {UPLOAD.sampleButton}
        </Button>
        <p id={noteId} className="up-caption">{UPLOAD.sampleNote}</p>
      </div>
      <p className="up-mode-line">
        {mode === "live" && model ? UPLOAD.liveLabel(model) : mode === "demo" ? UPLOAD.demoEnvironment : null}
      </p>
    </div>
  );
}

export default PlanUpload;
