import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { UPLOAD } from "@/lib/copy/upload";
import { errorBody, PREVIEW_SHOWN_CHARS } from "@/lib/upload";
import { PaneHeading } from "./PaneHeading";

/**
 * RedactionPreview (spec §7.3 step 2): what was removed before any model call, the first 1,200 characters of the redacted text in a
 * scrollable <pre>, and a field that adds a term (`PUT /me/documents/{id}/redaction` re-runs the preview on the server). The document
 * text is data: it is displayed in a <pre> and never interpreted. No animation.
 */
export interface RedactionPreviewProps {
  docId: string;
  preview: { text: string; removed: string[]; note?: string };
  onPreview: (p: { text: string; removed: string[]; note?: string }) => void;
  onContinue: () => void;
  busy?: boolean;
  /** POST /extract failed; the person is still on this step (web-correctness-19). */
  startError?: string | null;
}

export function RedactionPreview({ docId, preview, onPreview, onContinue, busy, startError }: RedactionPreviewProps) {
  const [term, setTerm] = useState("");
  const [terms, setTerms] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();

  const inputRef = useRef<HTMLInputElement>(null);
  // a11y-6: "Remove this term" stays enabled (aria-disabled while working) and validates on submit, so it never drops keyboard focus
  const addTerm = async () => {
    const t = term.trim();
    if (working) return;
    if (!t) { inputRef.current?.focus(); return; }
    if (t.length > 64) { setError(UPLOAD.termTooLong); return; }
    const next = [...terms, t].slice(-20);
    setWorking(true); setError(null);
    try {
      const r = await api.redaction(docId, next);
      setTerms(next); setTerm("");
      onPreview(r.redaction_preview);
      inputRef.current?.focus();
    } catch (e) {
      setError(errorBody(e)?.error === "term_too_long" ? UPLOAD.termTooLong : UPLOAD.reviewFailed);
    } finally { setWorking(false); }
  };

  return (
    <div className="up-redaction">
      <PaneHeading>{UPLOAD.redactionTitle}</PaneHeading>
      <p className="up-removed">{UPLOAD.removed(preview.removed.join(", "))}</p>
      {terms.length > 0 && <p className="up-removed">{UPLOAD.extraTerms(terms.join(", "))}</p>}
      <p className="up-caption">{UPLOAD.previewIntro}</p>
      <pre className="up-pre" tabIndex={0} role="region" aria-label={UPLOAD.redactionTitle}>{preview.text.slice(0, PREVIEW_SHOWN_CHARS)}</pre>
      <form className="up-term" onSubmit={(e) => { e.preventDefault(); void addTerm(); }}>
        <label htmlFor={inputId}>{UPLOAD.addTerm}</label>
        <div className="up-term-row">
          <input ref={inputRef} id={inputId} value={term} maxLength={64} onChange={(e) => setTerm(e.target.value)} aria-describedby={hintId} className="min-h-11" autoComplete="off" />
          <Button type="submit" variant="outline" size="touch" aria-disabled={working || undefined}>{UPLOAD.addTermButton}</Button>
        </div>
        <p id={hintId} className="up-caption">{UPLOAD.addTermHint}</p>
        {error && <p role="alert" className="up-error">{error}</p>}
      </form>
      <p className="up-note">{preview.note ?? UPLOAD.dataNote}</p>
      {startError && <p role="alert" className="up-error">{startError}</p>}
      <div className="up-actions">
        <Button type="button" size="touch" onClick={() => { if (!busy && !working) onContinue(); }} aria-disabled={busy || working || undefined}>{busy ? UPLOAD.startingExtraction : UPLOAD.continueRedaction}</Button>
      </div>
    </div>
  );
}

export default RedactionPreview;
