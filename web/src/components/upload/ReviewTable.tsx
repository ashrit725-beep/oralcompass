import { useCallback, useEffect, useRef, useState } from "react";
import HoldButton from "@/components/ui/HoldButton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { UPLOAD } from "@/lib/copy/upload";
import type { ExtractedField, PlanRef, ReviewDecision, UploadedPlanSummary } from "@/lib/types";
import { createSerialGate, groupByLandmark, labelFor, publishErrorCopy, reviewErrorCopy, undecidedRequired, verifiedUndecided, type ExtractionStatusFull, type ServerRedactionSummary } from "@/lib/upload";
import { PaneHeading } from "./PaneHeading";
import { ReviewRow } from "./ReviewRow";
import { ServerRedactionLine } from "./ServerRedactionLine";

export interface PublishResult { plan_ref: PlanRef; version_label: string; published_at: string; sha256: string; summary: UploadedPlanSummary }
type ReviewResult = { fields: ExtractedField[]; counts?: ExtractionStatusFull["counts"]; undecided_required?: string[] };

/**
 * ReviewTable (spec §7.3 step 4, addendum B2 "no pre-checked Accept"): the extracted fields grouped by landmark, one ReviewRow each.
 * Every decision is sent at once (`PUT /me/documents/{id}/review`, one row or the explicit "Confirm all verified quotes" batch) and the
 * server's `fields` / `undecided_required` replace local state, so the footer count is the server's truth. The HoldButton publishes
 * (`POST /me/documents/{id}/publish`); a tap, a short key press or an AT click (no hold) opens a
 * "Confirm publish" step instead (WCAG 2.1.1, a11y-1); keyboard hold (Space/Enter) is still supported by the vendored button.
 * The footer `<p role="status">` is this pane's one live region. The server's notes_for_review texts are shown as returned.
 */
export interface ReviewTableProps {
  docId: string;
  status: ExtractionStatusFull;
  onFields: (r: ReviewResult) => void;
  onPublished: (r: PublishResult) => void;
  /** The server's redaction summary: the header line "N personal identifiers removed before AI analysis". */
  redaction?: ServerRedactionSummary | null;
}

export function ReviewTable({ docId, status, onFields, onPublished, redaction = null }: ReviewTableProps) {
  const fields = status.fields;
  const undecided = status.undecided_required ?? undecidedRequired(fields);
  const classNames = (status.structure?.classes ?? []).map((c) => c.name);
  const verified = verifiedUndecided(fields);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  // a11y-1 (WCAG 2.1.1): a tap, a keyboard press or an AT click on the HoldButton opens a confirm step, so publishing never needs a hold
  const [confirming, setConfirming] = useState(false);
  const publishBox = useRef<HTMLDivElement>(null);
  const openConfirm = () => { setConfirming(true); setMessage(UPLOAD.publishHold); };
  const closeConfirm = () => { setConfirming(false); publishBox.current?.querySelector<HTMLElement>(".hb-root")?.focus(); };
  useEffect(() => { if (confirming) publishBox.current?.querySelector<HTMLElement>(".up-confirm-publish")?.focus(); }, [confirming]);

  // web-correctness-21: decisions are serialized (every row is aria-disabled while one is in flight), so responses cannot overtake each other.
  // a11y-6: busy controls use aria-disabled + a click guard, never the disabled attribute, so the focused button keeps focus.
  const gate = useRef(createSerialGate());
  const decide = useCallback(async (decisions: ReviewDecision[], path: string) => {
    if (!gate.current.enter()) return;
    setBusyPath(path); setRowErrors((e) => ({ ...e, [path]: "" })); setPublishError(null);
    try {
      const r = (await api.review(docId, decisions)) as ReviewResult;
      onFields(r);
      const left = r.undecided_required ?? undecidedRequired(r.fields);
      setMessage(left.length ? UPLOAD.waitingCount(left.length) : UPLOAD.allDecided);
    } catch (e) {
      setRowErrors((errs) => ({ ...errs, [path]: reviewErrorCopy(e) }));
    } finally { gate.current.leave(); setBusyPath(null); }
  }, [docId, onFields]);

  const confirmAll = () => decide(verified.map((f) => ({ field_path: f.field_path, decision: "confirmed" as const })), "*");

  const publish = async () => {
    if (undecided.length || publishing) return;
    setConfirming(false);
    setPublishing(true); setPublishError(null); setMessage(UPLOAD.publishing);
    try {
      const r = (await api.publish(docId)) as PublishResult;
      setMessage(UPLOAD.published(r.version_label));
      onPublished(r);
    } catch (e) {
      setPublishError(publishErrorCopy(e, fields)); setMessage(null);
    } finally { setPublishing(false); }
  };

  const ignored = status.structure?.ignored_wording ?? [];
  const unmatched = status.structure?.unmatched_wording ?? [];

  return (
    <div className="up-review">
      <PaneHeading>{UPLOAD.reviewTitle}</PaneHeading>
      {redaction && <ServerRedactionLine summary={redaction} />}
      {status.ribbon && <p className={status.mode === "demo" ? "ribbon up-ribbon" : "up-mode-line"}>{status.ribbon}</p>}
      <p className="up-caption">{UPLOAD.reviewIntro}</p>
      {status.notes_for_review?.paraphrase && <p className="up-note">{status.notes_for_review.paraphrase}</p>}

      {verified.length > 0 && (
        <div className="up-confirm-all">
          <Button type="button" variant="outline" size="touch" onClick={() => { if (busyPath === null) void confirmAll(); }} aria-disabled={busyPath !== null || undefined}>{UPLOAD.confirmAllVerified}</Button>
          <span className="up-caption">{UPLOAD.confirmAllNote(verified.length)}</span>
          {rowErrors["*"] && <p role="alert" className="up-error">{rowErrors["*"]}</p>}
        </div>
      )}

      {groupByLandmark(fields).map((g) => (
        <section key={g.landmark} className="up-group" aria-labelledby={`up-g-${g.landmark}`}>
          <h4 id={`up-g-${g.landmark}`} className="up-h4">{g.title}</h4>
          <Table className="up-table" containerClassName="up-table-wrap">
            <TableHeader>
              <TableRow>
                <TableHead>{UPLOAD.colField}</TableHead>
                <TableHead>{UPLOAD.colProposed}</TableHead>
                <TableHead>{UPLOAD.colConfidence}</TableHead>
                <TableHead>{UPLOAD.colQuote}</TableHead>
                <TableHead>{UPLOAD.colDecision}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.fields.map((f) => (
                <ReviewRow key={f.field_path} docId={docId} field={f} classNames={classNames} busy={busyPath !== null} error={rowErrors[f.field_path] || null} onDecide={(d) => decide([d], f.field_path)} />
              ))}
            </TableBody>
          </Table>
        </section>
      ))}

      {(ignored.length > 0 || unmatched.length > 0) && (
        <section className="up-wording" aria-label={UPLOAD.ignoredWordingTitle}>
          {ignored.length > 0 && (
            <details>
              <summary className="min-h-11">{UPLOAD.ignoredWordingTitle} ({ignored.length})</summary>
              <p className="up-caption">{status.notes_for_review?.ignored_wording}</p>
              <ul>{ignored.map((w, i) => <li key={i}><q>{w.quote}</q> <span className="up-caption">{UPLOAD.wordingPage(w.page)}</span></li>)}</ul>
            </details>
          )}
          {unmatched.length > 0 && (
            <details>
              <summary className="min-h-11">{UPLOAD.unmatchedWordingTitle} ({unmatched.length})</summary>
              <p className="up-caption">{status.notes_for_review?.unmatched_wording}</p>
              <ul>{unmatched.map((w, i) => <li key={i}><q>{w.wording}</q>{w.context && <span className="up-caption"> · {w.context}</span>}</li>)}</ul>
            </details>
          )}
        </section>
      )}
      {(status.notes?.length ?? 0) > 0 && (
        <section className="up-notes" aria-label={UPLOAD.notesTitle}>
          <h4 className="up-h4">{UPLOAD.notesTitle}</h4>
          <ul>{status.notes!.map((n, i) => <li key={i}>{n}</li>)}</ul>
          {(status.notes_dropped ?? 0) > 0 && <p className="up-caption">{UPLOAD.notesDropped(status.notes_dropped!)}</p>}
        </section>
      )}

      <p className="up-note">{status.notes_for_review?.publish ?? UPLOAD.publishNote}</p>
      {/* mobile-17: on phones this footer (the live count + publish) is sticky at the foot of the dialog's scroll box */}
      <footer className="up-footer">
        <p className="up-count" data-undecided={undecided.length}>
          {undecided.length ? UPLOAD.waitingCount(undecided.length) : UPLOAD.allDecided}
          {undecided.length > 0 && <span className="up-caption"> {UPLOAD.undecidedList(undecided.map((p) => labelFor(fields, p)).join(", "))}</span>}
        </p>
        <div className="up-publish" ref={publishBox}>
          <HoldButton onHold={publish} onTap={openConfirm} onActivate={openConfirm} disabled={undecided.length > 0 || publishing} size="lg" doneLabel={UPLOAD.publishing} resetAfter={0}>
            {UPLOAD.publish}
          </HoldButton>
          {confirming && undecided.length === 0 && !publishing && (
            <div className="up-confirm-step" role="group" aria-label={UPLOAD.publishConfirm}>
              <p className="up-caption">{UPLOAD.publishConfirmPrompt}</p>
              <div className="up-actions">
                <Button type="button" size="touch" className="up-confirm-publish" onClick={() => { void publish(); }}>{UPLOAD.publishConfirm}</Button>
                <Button type="button" variant="ghost" size="touch" onClick={closeConfirm}>{UPLOAD.publishConfirmCancel}</Button>
              </div>
            </div>
          )}
          <p role="status" aria-live="polite" className="up-status">{message}</p>
          {publishError && <p role="alert" className="up-error">{publishError}</p>}
        </div>
      </footer>
    </div>
  );
}

export default ReviewTable;
