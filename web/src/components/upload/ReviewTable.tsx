import { useCallback, useState } from "react";
import HoldButton from "@/components/ui/HoldButton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { UPLOAD } from "@/lib/copy/upload";
import type { ExtractedField, PlanRef, ReviewDecision, UploadedPlanSummary } from "@/lib/types";
import { groupByLandmark, labelFor, publishErrorCopy, reviewErrorCopy, undecidedRequired, verifiedUndecided, type ExtractionStatusFull } from "@/lib/upload";
import { ReviewRow } from "./ReviewRow";

export interface PublishResult { plan_ref: PlanRef; version_label: string; published_at: string; sha256: string; summary: UploadedPlanSummary }
type ReviewResult = { fields: ExtractedField[]; counts?: ExtractionStatusFull["counts"]; undecided_required?: string[] };

/**
 * ReviewTable (spec §7.3 step 4, addendum B2 "no pre-checked Accept"): the extracted fields grouped by landmark, one ReviewRow each.
 * Every decision is sent at once (`PUT /me/documents/{id}/review`, one row or the explicit "Confirm all verified quotes" batch) and the
 * server's `fields` / `undecided_required` replace local state, so the footer count is the server's truth. The HoldButton publishes
 * (`POST /me/documents/{id}/publish`); a tap shows "Hold to publish"; keyboard hold (Space/Enter) is supported by the vendored button.
 * The footer `<p role="status">` is this pane's one live region. The server's notes_for_review texts are shown as returned.
 */
export interface ReviewTableProps {
  docId: string;
  status: ExtractionStatusFull;
  onFields: (r: ReviewResult) => void;
  onPublished: (r: PublishResult) => void;
}

export function ReviewTable({ docId, status, onFields, onPublished }: ReviewTableProps) {
  const fields = status.fields;
  const undecided = status.undecided_required ?? undecidedRequired(fields);
  const classNames = (status.structure?.classes ?? []).map((c) => c.name);
  const verified = verifiedUndecided(fields);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const decide = useCallback(async (decisions: ReviewDecision[], path: string) => {
    setBusyPath(path); setRowErrors((e) => ({ ...e, [path]: "" })); setPublishError(null);
    try {
      const r = (await api.review(docId, decisions)) as ReviewResult;
      onFields(r);
      const left = r.undecided_required ?? undecidedRequired(r.fields);
      setMessage(left.length ? UPLOAD.waitingCount(left.length) : UPLOAD.allDecided);
    } catch (e) {
      setRowErrors((errs) => ({ ...errs, [path]: reviewErrorCopy(e) }));
    } finally { setBusyPath(null); }
  }, [docId, onFields]);

  const confirmAll = () => decide(verified.map((f) => ({ field_path: f.field_path, decision: "confirmed" as const })), "*");

  const publish = async () => {
    if (undecided.length || publishing) return;
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
      <h3 className="up-h3">{UPLOAD.reviewTitle}</h3>
      {status.ribbon && <p className={status.mode === "demo" ? "ribbon up-ribbon" : "up-mode-line"}>{status.ribbon}</p>}
      <p className="up-caption">{UPLOAD.reviewIntro}</p>
      {status.notes_for_review?.paraphrase && <p className="up-note">{status.notes_for_review.paraphrase}</p>}

      {verified.length > 0 && (
        <div className="up-confirm-all">
          <Button type="button" variant="outline" size="touch" onClick={confirmAll} disabled={busyPath !== null}>{UPLOAD.confirmAllVerified}</Button>
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
                <ReviewRow key={f.field_path} docId={docId} field={f} classNames={classNames} busy={busyPath === f.field_path || busyPath === "*"} error={rowErrors[f.field_path] || null} onDecide={(d) => decide([d], f.field_path)} />
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

      <footer className="up-footer">
        <p className="up-count" data-undecided={undecided.length}>
          {undecided.length ? UPLOAD.waitingCount(undecided.length) : UPLOAD.allDecided}
          {undecided.length > 0 && <span className="up-caption"> {UPLOAD.undecidedList(undecided.map((p) => labelFor(fields, p)).join(", "))}</span>}
        </p>
        <div className="up-publish">
          <HoldButton onHold={publish} onTap={() => setMessage(UPLOAD.publishHold)} disabled={undecided.length > 0 || publishing} size="lg" doneLabel={UPLOAD.publishing} resetAfter={0}>
            {UPLOAD.publish}
          </HoldButton>
          <p role="status" aria-live="polite" className="up-status">{message}</p>
          {publishError && <p role="alert" className="up-error">{publishError}</p>}
        </div>
        <p className="up-note">{status.notes_for_review?.publish ?? UPLOAD.publishNote}</p>
      </footer>
    </div>
  );
}

export default ReviewTable;
