import { UI } from "../../lib/copy";
import { layoutIslands, MAP_H, MAP_W, routePath, stageProgress, statusLabel } from "../../lib/journey";
import type { Checkpoint, Journey, Stage } from "../../lib/types";
import { AtlasDefs, Compass, Grain, Island, Scenery, Vignette } from "./Paper";

export interface Selection { stageId: string; cpId?: string }
interface Props { journey: Journey; selected: Selection | null; onSelect: (s: Selection) => void; currentStageId: string | null }

const MARK: Record<Checkpoint["status"], { fill: string; stroke: string; dash?: string; glyph: string }> = {
  completed: { fill: "var(--gold)", stroke: "var(--ink)", glyph: "✓" },
  current: { fill: "var(--terracotta)", stroke: "var(--ink)", glyph: "●" },
  upcoming: { fill: "var(--paper)", stroke: "var(--ink-soft)", glyph: "○" },
  awaiting_info: { fill: "var(--paper)", stroke: "var(--ink-soft)", dash: "3 3", glyph: "?" },
};

/**
 * The painted map: islands are stages, checkpoints sit on a short path over each island, a dotted route joins the islands.
 * The painting is decorative (aria-hidden); the real controls are the HTML buttons overlaid at the same positions.
 */
export function JourneyMap({ journey, selected, onSelect, currentStageId }: Props) {
  const islands = layoutIslands(journey);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  return (
    <div className="map" role="group" aria-label="Journey map">
      <svg className="map-paint" viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
        <AtlasDefs />
        <rect width={MAP_W} height={MAP_H} fill="url(#oc-water)" />
        <Scenery w={MAP_W} h={MAP_H} horizon={0.3} />
        <rect width={MAP_W} height={MAP_H} fill="url(#oc-ripples)" opacity="0.5" className="ripples" />
        <path className="route" d={routePath(islands)} fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeDasharray="7 9" strokeLinecap="round" opacity="0.65" />
        {islands.map((isl) => (
          <g key={isl.stage.id}>
            <Island cx={isl.cx} cy={isl.cy} r={isl.r} muted={isl.stage.id !== currentStageId && stageProgress(isl.stage).done === 0} />
            <path d={isl.checkpoints.map((c, i) => `${i ? "L" : "M"} ${c.x} ${c.y}`).join(" ")} fill="none" stroke="var(--paper)" strokeWidth="2" strokeDasharray="2 4" opacity="0.9" />
            {isl.checkpoints.map(({ cp, x, y }) => {
              const m = MARK[cp.status];
              return <circle key={cp.id} cx={x} cy={y} r={7} fill={m.fill} stroke={m.stroke} strokeWidth="1.6" strokeDasharray={m.dash} />;
            })}
          </g>
        ))}
        {currentStageId && (() => { const isl = islands.find((i) => i.stage.id === currentStageId); return isl ? <Marker x={isl.cx} y={isl.cy - isl.r * 0.95} /> : null; })()}
        <Compass x={MAP_W - 60} y={58} />
        <Grain />
        <Vignette />
      </svg>
      <div className="map-controls">
        {islands.map((isl) => {
          const prog = stageProgress(isl.stage);
          const isSel = selected?.stageId === isl.stage.id && !selected.cpId;
          return (
            <div key={isl.stage.id}>
              <button type="button" className={`island-btn ${isSel ? "is-selected" : ""} ${isl.stage.id === currentStageId ? "is-current" : ""}`}
                      style={{ left: pct(isl.cx, MAP_W), top: pct(isl.cy + isl.r * 0.72 + 34, MAP_H) }}
                      aria-pressed={isSel} aria-label={`${isl.stage.title} (${isl.stage.island}): ${prog.label}${isl.stage.id === currentStageId ? ", current stage" : ""}`}
                      onClick={() => onSelect({ stageId: isl.stage.id })}>
                <span className="island-btn-title">{isl.stage.title}</span>
                <span className="island-btn-progress">{prog.label}</span>
              </button>
              {isl.checkpoints.map(({ cp, x, y }) => {
                const sel = selected?.stageId === isl.stage.id && selected.cpId === cp.id;
                return (
                  <button key={cp.id} type="button" className={`cp-btn cp-${cp.status} ${sel ? "is-selected" : ""}`} style={{ left: pct(x, MAP_W), top: pct(y, MAP_H) }}
                          aria-pressed={sel} aria-label={`${cp.label} — ${statusLabel(cp)}${cp.status === "completed" && cp.completed_by === "dental_team" ? ", confirmed by your dental team" : cp.status === "completed" ? ", marked by you" : ""}`}
                          onClick={() => onSelect({ stageId: isl.stage.id, cpId: cp.id })}>
                    <span aria-hidden="true">{MARK[cp.status].glyph}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="map-legend" aria-hidden="true">
        <span className="lg lg-completed">✓ Completed</span>
        <span className="lg lg-current">● Current</span>
        <span className="lg lg-upcoming">○ Upcoming</span>
        <span className="lg lg-awaiting">? Awaiting information</span>
      </p>
    </div>
  );
}

function Marker({ x, y }: { x: number; y: number }) {
  // outer group positions the pin (SVG attribute); inner group carries the CSS animation (a CSS transform would override the attribute)
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="you-are-here">
        <path d="M0 0 C -13 -16 -13 -30 0 -34 C 13 -30 13 -16 0 0 Z" fill="var(--terracotta)" stroke="var(--ink)" strokeWidth="1.4" />
        <circle cy={-23} r={5} fill="var(--paper)" />
      </g>
    </g>
  );
}

/** Vertical journey for phones: stages stacked, checkpoints as a vertical path. Same data, different layout. */
export function JourneyVertical({ journey, selected, onSelect, currentStageId }: Props) {
  return (
    <ol className="journey-vertical" aria-label="Journey stages">
      {journey.stages.map((stage: Stage) => {
        const prog = stageProgress(stage);
        return (
          <li key={stage.id} className={`jv-stage ${stage.id === currentStageId ? "is-current" : ""}`}>
            <button type="button" className={`jv-stage-btn ${selected?.stageId === stage.id && !selected.cpId ? "is-selected" : ""}`} aria-pressed={selected?.stageId === stage.id && !selected.cpId}
                    aria-label={`${stage.title} (${stage.island}): ${prog.label}${stage.id === currentStageId ? ", current stage" : ""}`} onClick={() => onSelect({ stageId: stage.id })}>
              <span className="jv-title">{stage.title}</span><span className="jv-island">{stage.island}</span><span className="jv-progress">{prog.label}</span>
            </button>
            <ol className="jv-cps">
              {stage.checkpoints.map((cp) => (
                <li key={cp.id}>
                  <button type="button" className={`jv-cp cp-${cp.status} ${selected?.cpId === cp.id ? "is-selected" : ""}`} aria-pressed={selected?.cpId === cp.id}
                          aria-label={`${cp.label} — ${statusLabel(cp)}`} onClick={() => onSelect({ stageId: stage.id, cpId: cp.id })}>
                    <span className="jv-mark" aria-hidden="true">{MARK[cp.status].glyph}</span>
                    <span className="jv-label">{cp.label}</span>
                    <span className="jv-status">{statusLabel(cp)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
