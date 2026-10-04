import { useCallback, useRef, useState } from "react";
import FileUpload from "@/components/kokonutui/file-upload";
import { StageLoader } from "@/components/StageLoader";
import { api } from "@/lib/api";
import { UPLOAD } from "@/lib/copy/upload";
import { MAX_BYTES, prepareFile, problemCopy, uploadErrorCopy, type PreparePhase, type UploadResponseX } from "@/lib/upload";

/**
 * PlanUpload (spec §7.3 step 1): the Kokonut drop zone with the real validation chain. A chosen file is checked for `%PDF-` magic bytes,
 * ≤ 32 MB and ≤ 100 pages (pdf.js, lazy chunk), hashed with WebCrypto, its text layer read for the redaction preview, then sent with
 * `api.uploadDocument`. Phases are real (checksum → pages → sending) and drive the arc; nothing is simulated. Errors are persistent
 * sentences from UPLOAD; `role="alert"` only for failures. Reduced motion: FileUpload and StageLoader handle their own guards.
 */
export interface PlanUploadProps {
  onUploaded: (resp: UploadResponseX, file: File) => void;
  /** /health llm_mode, for the pre-label under the drop zone. */
  mode: "demo" | "live" | null;
  model?: string | null;
}

function phaseLabel(p: PreparePhase | null): string {
  if (!p) return "";
  if (p.phase === "checksum") return UPLOAD.phaseChecksum;
  if (p.phase === "reading") return UPLOAD.phaseReading(p.done, p.total);
  return UPLOAD.phaseUploading;
}
function phaseIndex(p: PreparePhase | null): number {
  return !p ? 0 : p.phase === "checksum" ? 0 : p.phase === "reading" ? 1 : 2;
}
function phasePercent(p: PreparePhase | null): number {
  if (!p) return 0;
  if (p.phase === "checksum") return 10;
  if (p.phase === "reading") return 10 + Math.round((p.done / Math.max(1, p.total)) * 70);
  return 90;
}

export function PlanUpload({ onUploaded, mode, model }: PlanUploadProps) {
  const [phase, setPhase] = useState<PreparePhase | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  const cancel = useCallback(() => { run.current++; setPhase(null); setFile(null); }, []);

  const onFileSelected = useCallback(async (f: File) => {
    const id = ++run.current;
    setError(null); setFile(f); setPhase({ phase: "checksum" });
    const result = await prepareFile(f, (p) => { if (run.current === id) setPhase(p); });
    if (run.current !== id) return;
    if (!result.ok) { setError(problemCopy[result.problem]); setPhase(null); setFile(null); return; }
    setPhase({ phase: "uploading" });
    try {
      const resp = (await api.uploadDocument(f, result.prepared.sha256, result.prepared.pages, result.prepared.text)) as UploadResponseX;
      if (run.current !== id) return;
      setPhase(null);
      onUploaded(resp, f);
    } catch (e) {
      if (run.current !== id) return;
      setError(uploadErrorCopy(e)); setPhase(null); setFile(null);
    }
  }, [onUploaded]);

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
      {error && <p role="alert" className="up-error">{error}</p>}
      <p className="up-mode-line">
        {mode === "live" && model ? UPLOAD.liveLabel(model) : mode === "demo" ? UPLOAD.demoEnvironment : null}
      </p>
    </div>
  );
}

export default PlanUpload;
