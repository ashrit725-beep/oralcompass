import { Timeline } from "@/components/ui/timeline";
import { PASSAGE } from "@/lib/copy/passage";
import { stageProgress, statusLabel } from "@/lib/journey";
import type { Checkpoint, Journey, Progress, Stage, StageSelection } from "@/lib/types";

/**
 * CareTimeline (spec §2.3, component plan N5): the five care stages keep every semantic they have today.
 * A native list section below the journey map (mobile-only app; the desktop rail was removed with the desktop layout), built on the
 * Aceternity Timeline (restyled: paper, forest→sea fill, <ol>/<li aria-current="step">; reduced motion fills 100 %), each entry holding
 * the stage button (the current stage carries the static "you are here" pin, addendum A5: no bob) and its 44 px checkpoint rows.
 * Accessible names start with the stage title (`Before your visit (Lantern Cove): 1 of 3 checkpoints completed`) and the checkpoint
 * label (`Appointment information recorded: Completed, confirmed by your dental team`) so tools/screenshots.py keeps working.
 * Clicking opens the existing DetailPanel with its forms.
 */
export interface CareTimelineProps { journey: Journey; progress: Progress; selected: StageSelection | null; onSelect: (s: StageSelection, el?: HTMLElement | null) => void; currentStageId: string | null; /** Ignored: the phone timeline is the only layout (mobile-only app). */ mobile?: boolean; linkedIsland?: (stage: Stage) => string | null; onShowOnChart?: (islandId: string) => void }

const GLYPH: Record<Checkpoint["status"], string> = { completed: "M5 12.5l4.5 4.5L19 7", current: "", upcoming: "", awaiting_info: "M9.5 9a2.5 2.5 0 1 1 3.8 2.1c-.8.5-1.3 1-1.3 1.9M12 17v.5" };

function CpGlyph({ status }: { status: Checkpoint["status"] }) {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true" focusable="false" className={`care-cp-glyph cp-${status}`}>
      <circle cx={12} cy={12} r={10} fill={status === "completed" ? "var(--gold)" : status === "current" ? "var(--terracotta)" : "var(--paper)"} stroke={status === "awaiting_info" ? "var(--ink-soft)" : "var(--ink)"} strokeWidth={1.6} strokeDasharray={status === "awaiting_info" ? "3 3" : undefined} />
      {GLYPH[status] && <path d={GLYPH[status]} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {status === "current" && <circle cx={12} cy={12} r={3.5} fill="var(--paper)" />}
    </svg>
  );
}
const cpName = (cp: Checkpoint) => `${cp.label}: ${statusLabel(cp)}${cp.status === "completed" && cp.completed_by === "dental_team" ? ", confirmed by your dental team" : cp.status === "completed" ? ", marked by you" : ""}`;

function StageButton({ stage, current, selected, onSelect }: { stage: Stage; current: boolean; selected: boolean; onSelect: CareTimelineProps["onSelect"] }) {
  const prog = stageProgress(stage);
  return (
    <button type="button" className={`unstyled care-stage-btn ${selected ? "is-selected" : ""} ${current ? "is-current" : ""}`} aria-pressed={selected} data-stage-btn={stage.id}
            aria-label={`${stage.title} (${stage.island}): ${prog.label}${current ? ", current stage" : ""}`} onClick={(e) => onSelect({ stageId: stage.id }, e.currentTarget)}>
      {current && <span className="care-pin" aria-hidden="true"><svg viewBox="0 0 16 16" width={16} height={16}><path d="M8 15 C3 9 3 4 8 2 C13 4 13 9 8 15 Z" fill="var(--terracotta)" stroke="var(--ink)" strokeWidth={1} /><circle cx={8} cy={6.5} r={2} fill="var(--paper)" /></svg></span>}
      <span className="care-title">{stage.title}</span>
      <span className="care-island">{stage.island}</span>
      <span className="care-progress num">{prog.label}</span>
    </button>
  );
}

export function CareTimeline({ journey, selected, onSelect, currentStageId, linkedIsland, onShowOnChart }: CareTimelineProps) {
  const cpRow = (stage: Stage) => (
    <ol className="care-cps care-cps-rows" aria-label={`${stage.title}: checkpoints`}>
      {stage.checkpoints.map((cp) => {
        const sel = selected?.stageId === stage.id && selected.cpId === cp.id;
        return (
          <li key={cp.id}>
            <button type="button" className={`unstyled care-cp care-cp-row cp-${cp.status} ${sel ? "is-selected" : ""}`} aria-pressed={sel} aria-label={cpName(cp)} onClick={(e) => onSelect({ stageId: stage.id, cpId: cp.id }, e.currentTarget)}>
              <CpGlyph status={cp.status} />
              <span className="care-cp-label">{cp.label}</span><span className="care-cp-status">{statusLabel(cp)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
  // one "Show on the chart" link, on the current stage only (four cards repeating the same link to the same island read as filler);
  // every other stage still opens from its title button
  const chartLink = (stage: Stage) => {
    if (stage.id !== currentStageId) return null;
    const id = linkedIsland?.(stage);
    return id && onShowOnChart ? <button type="button" className="linklike care-show-chart" onClick={() => onShowOnChart(id)}>{PASSAGE.showOnChart}</button> : null;
  };
  const current = journey.stages.findIndex((s) => s.id === currentStageId);
  return (
    <div className="care-timeline-phone">
      <Timeline ariaLabel={PASSAGE.careTimeline} current={current >= 0 ? current : undefined} data={journey.stages.map((stage) => ({
        title: stage.title,
        content: (
          <div className="care-entry">
            <StageButton stage={stage} current={stage.id === currentStageId} selected={selected?.stageId === stage.id && !selected.cpId} onSelect={onSelect} />
            {cpRow(stage)}
            {chartLink(stage)}
          </div>
        ),
      }))} />
    </div>
  );
}

export default CareTimeline;
