/**
 * Kokonut UI "File Upload" (https://kokonutui.com/docs/components/file-upload), MIT, @dorianbaffier, installed 2026-10-03.
 * Patched for OralCompass (component plan §2 N6): `simulateUpload` is gone — the wrapper owns the real XHR/`uploadDocument` call and
 * passes `progress` (0–100) and `status`; the 14-ring rainbow `UploadingAnimation` and the blue `UploadIllustration` are replaced by one
 * sea arc on a sand track; `role="complementary"` → `<section aria-labelledby>`; `acceptedFileTypes` defaults to PDF only; the error
 * message is persistent (no 3 s auto-dismiss); drag ring `border-sage border-dashed`; grays/blues → tokens. Strings are props with
 * neutral defaults — `UploadWizard` passes the UPLOAD copy namespace. Reduced motion: MotionConfig drops the y/scale transitions; the
 * arc's dashoffset derives from `progress` (`motion-reduce:transition-none`), so every end state is exact.
 * Patched 2026-10-04 (layout-6): the panes flow in the document (min-height, no `absolute inset-0`), so the zone grows with its content
 * and never slices the Choose button; AnimatePresence `mode="wait"` keeps one pane mounted at a time.
 */

import { FileText, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type DragEvent, useCallback, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type FileStatus = "idle" | "dragging" | "uploading" | "error";

export interface FileError {
  message: string;
  code: string;
}

export interface FileUploadLabels {
  /** Section heading (visually hidden unless `showTitle`). */
  title: string;
  /** Primary instruction above the button. */
  hint: string;
  /** The 44 px choose-file button. */
  choose: string;
  /** Cancel while uploading. */
  cancel: string;
  /** Formatter for the size line, e.g. (max) => `PDF up to ${max}`. */
  limits?: (max: string) => string;
  /** Error message formatters. */
  tooLarge?: (max: string) => string;
  wrongType?: string;
}

interface FileUploadProps {
  /** Called once a file passes validation; the wrapper performs the real upload and drives `progress`/`status`. */
  onFileSelected: (file: File) => void;
  onUploadError?: (error: FileError) => void;
  onCancel?: () => void;
  acceptedFileTypes?: string[];
  maxFileSize?: number;
  /** Controlled upload state from the wrapper. */
  status?: "idle" | "uploading";
  progress?: number;
  currentFile?: File | null;
  validateFile?: (file: File) => FileError | null;
  labels: FileUploadLabels;
  showTitle?: boolean;
  /** Title heading level so the outline stays in order wherever the dropzone sits (default h3). */
  headingLevel?: 2 | 3 | 4 | 5;
  className?: string;
}

const DEFAULT_MAX_FILE_SIZE = 32 * 1024 * 1024; // 32 MB (spec §7.3)
const FILE_SIZES = ["Bytes", "KB", "MB", "GB", "TB"] as const;

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const unit = FILE_SIZES[i] || FILE_SIZES[FILE_SIZES.length - 1];
  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${unit}`;
};

/** One sea arc on a sand track while a file is prepared; determinate when `progress` is given, otherwise a static three-quarter arc. */
const UploadArc = ({ progress, label }: { progress: number | null; label: string }) => {
  const r = 42, c = 2 * Math.PI * r;
  const p = progress == null ? 0.75 : Math.max(0, Math.min(1, progress / 100));
  return (
    <svg viewBox="0 0 100 100" className="h-16 w-16" {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: false })}>
      <circle cx="50" cy="50" r={r} fill="none" className="stroke-sand" strokeWidth="6" />
      <circle
        cx="50" cy="50" r={r} fill="none" className="stroke-sea transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
        strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 50 50)"
      />
    </svg>
  );
};

export default function FileUpload({
  onFileSelected,
  onUploadError = () => {},
  onCancel,
  acceptedFileTypes = ["application/pdf"],
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  status: controlledStatus = "idle",
  progress,
  currentFile = null,
  validateFile = () => null,
  labels,
  showTitle = false,
  headingLevel = 3,
  className,
}: FileUploadProps) {
  const Heading = (`h${headingLevel}` as "h2" | "h3" | "h4" | "h5");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<FileError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const status: FileStatus = error ? "error" : controlledStatus === "uploading" ? "uploading" : dragging ? "dragging" : "idle";

  const validateFileSize = useCallback(
    (file: File): FileError | null =>
      file.size > maxFileSize ? { message: labels.tooLarge?.(formatBytes(maxFileSize)) ?? `${formatBytes(maxFileSize)} maximum`, code: "FILE_TOO_LARGE" } : null,
    [maxFileSize, labels]
  );

  const validateFileType = useCallback(
    (file: File): FileError | null => {
      if (!acceptedFileTypes?.length) return null;
      const fileType = file.type.toLowerCase();
      if (!acceptedFileTypes.some((type) => fileType === type.toLowerCase())) {
        return { message: labels.wrongType ?? acceptedFileTypes.join(", "), code: "INVALID_FILE_TYPE" };
      }
      return null;
    },
    [acceptedFileTypes, labels]
  );

  const handleError = useCallback(
    (err: FileError) => { setError(err); onUploadError?.(err); },   // persistent until the next attempt
    [onUploadError]
  );

  const handleFileSelect = useCallback(
    (selectedFile: File | null) => {
      if (!selectedFile) return;
      setError(null);
      const problem = validateFileSize(selectedFile) ?? validateFileType(selectedFile) ?? validateFile?.(selectedFile);
      if (problem) { handleError(problem); return; }
      onFileSelected(selectedFile);
    },
    [validateFileSize, validateFileType, validateFile, handleError, onFileSelected]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (controlledStatus !== "uploading") setDragging(true);
  }, [controlledStatus]);
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setDragging(false); }, []);
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault(); e.stopPropagation(); setDragging(false);
      if (controlledStatus === "uploading") return;
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [controlledStatus, handleFileSelect]
  );
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => { handleFileSelect(e.target.files?.[0] || null); if (e.target) e.target.value = ""; },
    [handleFileSelect]
  );
  const triggerFileInput = useCallback(() => { if (controlledStatus !== "uploading") fileInputRef.current?.click(); }, [controlledStatus]);

  return (
    <section aria-labelledby={headingId} className={cn("relative mx-auto w-full max-w-sm", className)}>
      <Heading id={headingId} className={showTitle ? "mb-2 font-serif text-[17px] leading-6 text-ink" : "sr-only"}>{labels.title}</Heading>
      <div className="relative w-full rounded-xl bg-paper-deep p-1.5 ring-1 ring-rule">
        <div
          className={cn(
            "relative mx-auto w-full overflow-hidden rounded-lg border bg-paper transition-colors motion-reduce:transition-none",
            status === "dragging" ? "border-dashed border-sage" : "border-rule",
            error ? "border-terracotta/60" : ""
          )}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="relative min-h-[248px]">
            <AnimatePresence mode="wait">
              {status !== "uploading" ? (
                <motion.div
                  animate={{ opacity: status === "dragging" ? 0.85 : 1, y: 0 }}
                  className="flex min-h-[220px] flex-col items-center justify-center p-6"
                  exit={{ opacity: 0, y: -8 }}
                  initial={{ opacity: 0, y: 8 }}
                  key="dropzone"
                  transition={{ duration: 0.2 }}
                >
                  {/* layout-27: a static document glyph while idle; the arc appears only once a file is being prepared */}
                  <FileText className="mb-4 h-12 w-12 text-ink-soft" strokeWidth={1.25} aria-hidden="true" />
                  <div className="mb-4 space-y-1.5 text-center">
                    <p className="font-serif text-lg text-ink">{labels.hint}</p>
                    {labels.limits && <p className="text-xs text-ink-soft">{labels.limits(formatBytes(maxFileSize))}</p>}
                  </div>
                  <button
                    className="unstyled flex min-h-11 w-4/5 items-center justify-center gap-2 rounded-full border border-ink bg-ink px-4 font-medium text-paper transition-colors hover:bg-ink/85 motion-reduce:transition-none"
                    onClick={triggerFileInput}
                    type="button"
                  >
                    <span>{labels.choose}</span>
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {/* a11y-15: the visible button is the one control; the native input is not a second, invisible tab stop */}
                  <input
                    accept={acceptedFileTypes?.join(",")}
                    aria-hidden="true"
                    tabIndex={-1}
                    className="sr-only"
                    onChange={handleFileInputChange}
                    ref={fileInputRef}
                    type="file"
                  />
                </motion.div>
              ) : (
                <motion.div
                  animate={{ opacity: 1 }}
                  className="flex min-h-[220px] flex-col items-center justify-center p-6"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  key="uploading"
                >
                  <div className="mb-4"><UploadArc progress={progress ?? null} label={`${Math.round(progress ?? 0)}%`} /></div>
                  <div className="mb-4 space-y-1.5 text-center">
                    <p className="truncate text-sm font-semibold text-ink">{currentFile?.name}</p>
                    <div className="flex items-center justify-center gap-2 text-xs">
                      <span className="text-ink-soft">{formatBytes(currentFile?.size || 0)}</span>
                      {progress != null && <span className="font-medium tabular-nums text-forest-text">{Math.round(progress)}%</span>}
                    </div>
                  </div>
                  {onCancel && (
                    <button
                      className="unstyled flex min-h-11 w-4/5 items-center justify-center gap-2 rounded-full border border-ink bg-transparent px-4 font-medium text-ink transition-colors hover:bg-parchment motion-reduce:transition-none"
                      onClick={onCancel}
                      type="button"
                    >
                      {labels.cancel}
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {error && (
            <p role="alert" className="mx-3 mb-3 rounded-lg border border-terracotta/40 bg-terracotta/10 px-4 py-2 text-sm text-ink">
              {error.message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

FileUpload.displayName = "FileUpload";
