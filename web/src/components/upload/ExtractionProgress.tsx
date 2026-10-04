import { motion } from "motion/react";
import { StageLoader } from "@/components/StageLoader";
import StatusMark, { type StatusMarkStatus } from "@/components/ui/StatusMark";
import { Button } from "@/components/ui/button";
import { UPLOAD } from "@/lib/copy/upload";
import { transitions, useReducedMotion } from "@/lib/motion";
import { isTerminal, stageCopy, stageProgress, type ExtractionStatusFull } from "@/lib/upload";
import { PaneHeading } from "./PaneHeading";

/**
 * ExtractionProgress (spec §7.3 step 3, component plan N6/N7): the server's real `stages[]` as StatusMark rows (done / running / pending;
 * `failed` or `cancelled` on the stage where a run stopped), the StageLoader compass turning once per stage (determinate), and a slow
 * cartographic line beside the list drawn one segment per completed stage (`pathLength`, --ease-in-out). The StageLoader is the one
 * aria-live region of this pane. Reduced motion: the line renders at its final length (`initial={false}`), StatusMark jumps to its arc,
 * the compass is static. Running rows without a measurable count use a 2.4 s arc sweep (nothing loops under 2 s).
 */
export interface ExtractionProgressProps {
  status: ExtractionStatusFull | null;
  starting?: boolean;
  pollError?: string | null;
  onReview: () => void;
}

function rowStatus(st: ExtractionStatusFull, i: number): StatusMarkStatus {
  const terminal = isTerminal(st.status);
  if (st.stages[i]?.done) return "done";
  if (i === st.stage_index) {
    if (st.status === "failed") return "failed";
    if (st.status === "demo_no_model") return "cancelled";
    return terminal ? "done" : "running";
  }
  return "pending";
}

export function ExtractionProgress({ status, starting, pollError, onReview }: ExtractionProgressProps) {
  const reduce = useReducedMotion();
  if (!status) {
    return (
      <div className="up-extraction">
        <PaneHeading>{UPLOAD.extractionTitle}</PaneHeading>
        <StageLoader label={starting ? UPLOAD.startingExtraction : UPLOAD.extractionNotStarted} size="sm" />
      </div>
    );
  }
  const n = status.stages.length || 1;
  const terminal = isTerminal(status.status);
  const doneCount = status.stages.filter((s) => s.done).length;
  const fraction = terminal ? 1 : Math.min(1, doneCount / n);
  const progress = stageProgress(status);
  const rowHeight = 40;
  const lineHeight = rowHeight * n;

  return (
    <div className="up-extraction">
      <PaneHeading>{UPLOAD.extractionTitle}</PaneHeading>
      {status.ribbon && <p className={status.mode === "demo" ? "ribbon up-ribbon" : "up-mode-line"}>{status.ribbon}</p>}
      {status.mode === "live" && status.model && <p className="up-caption">{UPLOAD.modelLine(status.model)}</p>}
      <StageLoader
        label={stageCopy(status)}
        stageIndex={terminal ? n : status.stage_index}
        stages={n}
        valueLabel={(i, total) => UPLOAD.stageOf(Math.min(i + 1, total), total, status.stages[Math.min(i, total - 1)]?.label ?? "")}
        className="up-stage-loader"
      />
      <div className="up-stage-grid">
        <svg className="up-stage-line" width="12" height={lineHeight} viewBox={`0 0 12 ${lineHeight}`} aria-hidden="true">
          <line x1="6" y1="0" x2="6" y2={lineHeight} className="up-stage-track" />
          <motion.line
            x1="6" y1="0" x2="6" y2={lineHeight}
            className="up-stage-ink"
            initial={false}
            animate={{ pathLength: fraction }}
            transition={reduce ? { duration: 0 } : transitions.chartDraw}
            style={{ pathLength: fraction }}
          />
        </svg>
        <ol className="up-stages" aria-label={UPLOAD.extractionTitle}>
          {status.stages.map((s, i) => {
            const rs = rowStatus(status, i);
            return (
              <li key={s.key} className="up-stage-row" data-status={rs} aria-current={i === status.stage_index && !terminal ? "step" : undefined}>
                <StatusMark status={rs} progress={rs === "running" && progress !== null ? progress : undefined} spinDuration={2400} label={s.label} size={20} fontSize={15} />
              </li>
            );
          })}
        </ol>
      </div>
      {status.status === "failed" && <p role="alert" className="up-error">{stageCopy(status)}</p>}
      {pollError && <p role="alert" className="up-error">{pollError}</p>}
      {terminal && (
        <div className="up-actions">
          <Button type="button" size="touch" onClick={onReview}>{UPLOAD.reviewFields}</Button>
        </div>
      )}
    </div>
  );
}

export default ExtractionProgress;
