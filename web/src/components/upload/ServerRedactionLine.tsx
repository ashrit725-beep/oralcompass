import { UPLOAD } from "@/lib/copy/upload";
import type { ServerRedactionSummary } from "@/lib/redaction-summary";
import { cn } from "@/lib/utils";

/**
 * RedactionCountLine (client redaction design points 4 and 6): "12 personal identifiers removed before AI analysis" as one quiet line,
 * after the fact: the review table header and the Documents card (from the SERVER's summary), and the treatment-plan reader (from the
 * on-device count). The small ink bar is the same mark as the redacted-text tokens on the review step, so the line reads as the same act.
 * `detail` says who counted. No motion.
 */
export function RedactionCountLine({ total, detail, className }: { total: number; detail?: string | null; className?: string }) {
  return (
    <p className={cn("rs-server", className)} data-rs-server-count={total}>
      <span className="rs-server-mark" aria-hidden="true" />
      <span className="rs-server-body">
        <strong className="rs-server-text">{UPLOAD.identifiersRemoved(total)}</strong>
        {detail ? <span className="rs-server-detail">{detail}</span> : null}
      </span>
    </p>
  );
}

/** The server's summary as that line; `detail` adds "Counted by the server…" and what the server's own check added. */
export function ServerRedactionLine({ summary, detail = true, className }: { summary: ServerRedactionSummary; detail?: boolean; className?: string }) {
  const text = detail ? `${UPLOAD.serverCounted}${summary.from_server_check > 0 ? ` ${UPLOAD.serverCheckExtra(summary.from_server_check)}` : ""}` : null;
  return <RedactionCountLine total={summary.total} detail={text} className={className} />;
}

export default ServerRedactionLine;
