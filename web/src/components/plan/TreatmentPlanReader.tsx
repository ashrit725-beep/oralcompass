import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useInView } from "motion/react";
import FileUpload from "@/components/kokonutui/file-upload";
import { Money } from "@/components/Money";
import { EvidenceBadge } from "@/components/Primitives";
import { StageLoader } from "@/components/StageLoader";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api";
import type { ConfirmItem, ReadItem, ReadResponse, ReadSample } from "@/lib/ai-types";
import { PLAN, PLAN_READ } from "@/lib/copy/plan";
import { dollarsToCents } from "@/lib/plan-catalog";
import type { TreatmentItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * TreatmentPlanReader (addendum D.5a): the "Read a treatment plan" flow inside TreatmentPlanImporter. Paste the estimate's text or drop a
 * photo/PDF (vendored Kokonut file-upload) → POST /me/treatment-plans/read (redaction first; live model or the stored fictional estimates in
 * demo mode) → a review table with one row per line: procedure as written → mapped procedure (a select of the server's candidates, or
 * "Not matched"), tooth, fee (<Money> with the USER badge: it comes from the user's own estimate), code as written. Nothing is ticked in
 * advance; "Add the ticked lines" posts /me/treatment-plans/confirm and hands the created items to the caller, which re-estimates so the
 * new islands draw on the map. The browser computes nothing beyond dollars → cents for a fee the user types.
 */
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024;

interface Row { include: boolean; key: string; feeText: string }

export interface TreatmentPlanReaderProps { onConfirmed: (items: TreatmentItem[]) => void }

export function TreatmentPlanReader({ onConfirmed }: TreatmentPlanReaderProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [samples, setSamples] = useState<ReadSample[]>([]);
  const [health, setHealth] = useState<{ mode: "demo" | "live"; model?: string } | null>(null);
  const [busy, setBusy] = useState<null | "text" | "file">(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // security-3: a photo or scanned PDF waits here until the person confirms the server's notice (409 image_confirmation_required)
  const [held, setHeld] = useState<{ file: File; notice: string } | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);   // the shadcn Button takes no ref (React 18 function component)
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (held) confirmRef.current?.querySelector<HTMLButtonElement>(".tpr-image-send")?.focus(); }, [held]);
  // The section usually sits in a closed <details>: nothing is fetched and no file input exists until it has been visible once.
  const rootRef = useRef<HTMLElement>(null);
  const seen = useInView(rootRef, { once: true });

  useEffect(() => {
    if (!seen) return;
    let alive = true;
    api.treatmentPlanSamples().then((r) => { if (alive) setSamples(r.items); }).catch(() => undefined);
    api.health().then((h) => { if (alive) setHealth({ mode: h.llm_mode, model: h.llm_model ?? undefined }); }).catch(() => undefined);
    return () => { alive = false; };
  }, [seen]);

  function show(res: ReadResponse) {
    setResult(res);
    setRows(res.items.map((it) => ({ include: false, key: it.procedure_key ?? "", feeText: it.fee_cents != null ? (it.fee_cents / 100).toFixed(2) : "" })));
  }
  function fail(e: unknown) {
    setError(e instanceof ApiError && e.status === 429 ? PLAN.readRateLimited : e instanceof ApiError && e.status === 413 ? PLAN.readFileTooLarge
      : e instanceof ApiError && e.status === 415 ? PLAN.readFileWrongType : PLAN.readError);
  }
  async function readText() {
    if (!text.trim()) { setError(PLAN.readTextRequired); return; }
    setBusy("text"); setError(null); setMessage(null); setResult(null);
    try { show(await api.readTreatmentPlanText(text)); } catch (e) { fail(e); } finally { setBusy(null); }
  }
  async function readFile(f: File, confirmImage = false) {
    setFile(f); setBusy("file"); setError(null); setMessage(null); setResult(null); setHeld(null);
    try { show(await api.readTreatmentPlanFile(f, confirmImage)); } catch (e) {
      const detail = e instanceof ApiError ? (e.body as { detail?: { error?: string; notice?: string } } | undefined)?.detail : undefined;
      if (e instanceof ApiError && e.status === 409 && detail?.error === "image_confirmation_required") setHeld({ file: f, notice: detail.notice || PLAN.readImageNotice });
      else fail(e);
    } finally { setBusy(null); setFile(null); }
  }

  const items = result?.items ?? [];
  const ready = rows.map((r) => r.key !== "" && dollarsToCents(r.feeText) != null);
  const ticked = rows.filter((r, i) => r.include && ready[i]).length;

  async function confirm() {
    const body: ConfirmItem[] = [];
    rows.forEach((r, i) => {
      const it = items[i];
      const cents = dollarsToCents(r.feeText);
      if (!r.include || !r.key || cents == null) return;
      body.push({ procedure_key: r.key, procedure_as_written: it.procedure_as_written, tooth: it.tooth, quantity: it.quantity, fee_cents: cents, code_as_written: it.code_as_written, date_as_written: it.date_as_written });
    });
    if (!body.length) return;
    setConfirming(true); setError(null);
    try {
      const out = await api.confirmTreatmentPlan(body);
      setMessage(PLAN.readConfirmed(out.created.length));
      setResult(null); setRows([]); setText("");
      onConfirmed(out.created);
    } catch { setError(PLAN.readConfirmError); }
    finally { setConfirming(false); }
  }
  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const removed = result?.redaction.removed.map((k) => PLAN_READ.removed[k] ?? k) ?? [];

  return (
    <section ref={rootRef} className="tpr" aria-labelledby={`${id}-h`}>
      <header className="tpr-head">
        <h4 id={`${id}-h`} className="bs-h">{PLAN.readTitle}</h4>
        {health && <span className={cn("tpr-mode", health.mode === "live" && "is-live")}>{health.mode === "live" && health.model ? PLAN.readModeLive(health.model) : PLAN.readModeDemo}</span>}
      </header>
      <p className="bs-note">{PLAN.readIntro}</p>

      <div className="tpr-inputs">
        <div className="tpr-paste">
          <label htmlFor={`${id}-text`} className="tpr-label">{PLAN.readPasteLabel}</label>
          <textarea ref={pasteRef} id={`${id}-text`} className="tpr-textarea" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={PLAN.readPastePlaceholder} spellCheck={false} maxLength={20000} />
          {samples.length > 0 && (
            <div className="tpr-samples" role="group" aria-label={PLAN.readSamplesLabel}>
              <span className="tpr-samples-label">{PLAN.readSamplesLabel}</span>
              {samples.map((s) => (
                <button key={s.id} type="button" className="tpr-sample" onClick={() => { setText(s.text); setError(null); }}>{PLAN.readSampleButton(s.label)}</button>
              ))}
            </div>
          )}
          <div className="bs-actions"><Button type="button" size="touch" onClick={readText} disabled={!!busy}>{PLAN.readRun}</Button></div>
        </div>
        <span className="tpr-or" aria-hidden="true">{PLAN.readOr}</span>
        <div className="tpr-file">
          {seen && <FileUpload onFileSelected={readFile} status={busy === "file" ? "uploading" : "idle"} currentFile={file} acceptedFileTypes={ACCEPTED} maxFileSize={MAX_BYTES} showTitle
                      labels={{ title: PLAN.readFileTitle, hint: PLAN.readFileHint, choose: PLAN.readFileChoose, cancel: PLAN.readFileCancel, limits: PLAN.readFileLimits, tooLarge: () => PLAN.readFileTooLarge, wrongType: PLAN.readFileWrongType }} />}
          <p className="muted small tpr-image-note">{PLAN.readImageNote}</p>
          {held && (
            <div ref={confirmRef} className="tpr-image-confirm" role="group" aria-labelledby={`${id}-notice`}>
              <p id={`${id}-notice`} className="bs-note">{held.notice}</p>
              <div className="bs-actions">
                <Button type="button" variant="outline" size="touch" onClick={() => { setHeld(null); pasteRef.current?.focus(); }}>{PLAN.readImagePaste}</Button>
                <Button type="button" size="touch" className="tpr-image-send" onClick={() => { void readFile(held.file, true); }} disabled={!!busy}>{PLAN.readImageSend}</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {busy && <StageLoader label={PLAN.readWorking} size="sm" className="tpr-loader" />}
      {error && <p role="alert" className="bs-error tpr-error">{error}</p>}
      {message && <p className="bs-status" role="status">{message}</p>}

      {result && (
        <div className="tpr-result">
          {(result.ribbon || result.note) && (
            <p className={cn("tpr-ribbon", result.mode === "live" && "is-live")}>
              {result.ribbon && <span>{result.ribbon}</span>}{result.ribbon && result.note ? " " : null}{result.note && <span>{result.note}</span>}
            </p>
          )}
          <ol className="tpr-stages" aria-label={PLAN.readStagesTitle}>
            {result.stages.map((s) => <li key={s.key} className={s.done ? "is-done" : "is-not"}><span aria-hidden="true">{s.done ? "✓" : "·"}</span> {s.label}</li>)}
          </ol>
          <p className="muted small">
            {result.redaction.image_not_redacted ? PLAN.readImageNotRedacted : removed.length ? PLAN.readRemoved(removed.join(", ")) : PLAN.readNothingRemoved}
            {result.dropped_unverified > 0 ? ` ${PLAN.readDropped(result.dropped_unverified)}` : ""}
          </p>

          {items.length > 0 && (
            <>
              <h5 className="tpr-h5">{PLAN.readReviewTitle}</h5>
              <p className="bs-note">{PLAN.readReviewIntro}</p>
              <table className="tpr-table">
                <thead>
                  <tr><th scope="col">{PLAN.readColAsWritten}</th><th scope="col">{PLAN.readColMapped}</th><th scope="col">{PLAN.readColTooth}</th><th scope="col">{PLAN.readColFee}</th><th scope="col">{PLAN.readColCode}</th><th scope="col">{PLAN.readColAdd}</th></tr>
                </thead>
                <tbody>
                  {items.map((it, i) => <ReviewRow key={i} id={`${id}-r${i}`} item={it} row={rows[i]} ready={ready[i]} onPatch={(p) => patch(i, p)} />)}
                </tbody>
              </table>
              <div className="bs-actions tpr-confirm">
                <Button type="button" size="touch" onClick={confirm} disabled={!ticked || confirming}>{PLAN.readConfirm}</Button>
                <span className="muted small" aria-live="polite">{PLAN.readTicked(ticked, items.length)}</span>
                <span className="bs-user"><EvidenceBadge status="USER" /></span>
              </div>
            </>
          )}
          {result.ignored_text.length > 0 && (
            <details className="tpr-ignored">
              <summary>{PLAN.readIgnoredTitle(result.ignored_text.length)}</summary>
              <p className="muted small">{PLAN.readIgnoredNote}</p>
              <ul>{result.ignored_text.map((t, i) => <li key={i}><q>{t}</q></li>)}</ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function ReviewRow({ id, item, row, ready, onPatch }: { id: string; item: ReadItem; row: Row; ready: boolean; onPatch: (p: Partial<Row>) => void }) {
  const candidates = useMemo(() => item.candidates, [item.candidates]);
  const feeCents = dollarsToCents(row.feeText);
  const typedFee = item.fee_cents == null;
  return (
    <tr data-confidence={item.confidence}>
      <td data-label={PLAN.readColAsWritten}>
        <span className="tpr-written">{item.procedure_as_written}</span>
        <small className="tpr-quote"><span className="muted">{PLAN.readAsRead}</span> <q>{item.quote}</q>{item.quote_verified === null ? <span className="muted"> {PLAN.readUnverified}</span> : null}</small>
      </td>
      <td data-label={PLAN.readColMapped}>
        <select id={`${id}-k`} value={row.key} onChange={(e) => onPatch({ key: e.target.value, include: e.target.value ? row.include : false })} aria-label={`${PLAN.readColMapped}: ${item.procedure_as_written}`} aria-describedby={`${id}-c`}>
          <option value="">{candidates.length ? PLAN.readNoChoice : PLAN.readNotMatched}</option>
          {candidates.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
        <small id={`${id}-c`} className="tpr-confidence">{PLAN_READ.confidence[item.confidence] ?? item.confidence}{item.notes.length ? `. ${item.notes.join(" ")}` : ""}</small>
      </td>
      <td data-label={PLAN.readColTooth}>{item.tooth ?? <span className="muted">{PLAN.readNone}</span>}</td>
      <td data-label={PLAN.readColFee}>
        {typedFee ? (
          <label className="tpr-fee-input">
            <span className="sr-only">{PLAN.readFeeInput(item.procedure_as_written)}</span>
            <input inputMode="decimal" value={row.feeText} onChange={(e) => onPatch({ feeText: e.target.value })} placeholder={item.fee_as_written ?? "0.00"} aria-describedby={`${id}-f`} />
            <small id={`${id}-f`} className="muted">{PLAN.readFeeNotWritten}</small>
          </label>
        ) : <Money cents={feeCents} evidence="USER" />}
      </td>
      <td data-label={PLAN.readColCode}>{item.code_as_written ?? <span className="muted">{PLAN.readNone}</span>}</td>
      <td data-label={PLAN.readColAdd}>
        <label className="tpr-include">
          <input type="checkbox" checked={row.include && ready} disabled={!ready} onChange={(e) => onPatch({ include: e.target.checked })} aria-label={PLAN.readInclude(item.procedure_as_written)} aria-describedby={ready ? undefined : `${id}-why`} />
        </label>
        {!ready && <small id={`${id}-why`} className="muted">{row.key ? PLAN.readNeedsFee : PLAN.readNeedsKey}</small>}
      </td>
    </tr>
  );
}

export default TreatmentPlanReader;
