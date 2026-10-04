import { ATTRIBUTION, STATUS_LABEL, UI } from "./copy";
import type { Checkpoint, Journey, Stage } from "./types";

/** Layout is derived from the journey's shape, never stored in it: stage count and order decide island positions along a route. */
export interface IslandLayout { stage: Stage; index: number; cx: number; cy: number; r: number; checkpoints: { cp: Checkpoint; x: number; y: number }[] }

export const MAP_W = 1000;
export const MAP_H = 600;

export function layoutIslands(journey: Journey): IslandLayout[] {
  const n = journey.stages.length;
  return journey.stages.map((stage, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const cx = 105 + t * (MAP_W - 210);
    const cy = MAP_H * 0.57 + Math.sin(t * Math.PI * 1.6 + 0.4) * 78;              // gentle S-curve across the water, below the horizon
    const r = n <= 3 ? 86 : n === 4 ? 76 : 66;
    const m = stage.checkpoints.length;
    const checkpoints = stage.checkpoints.map((cp, j) => {
      const a = -Math.PI * 0.9 + (m === 1 ? Math.PI * 0.9 : (j / (m - 1)) * Math.PI * 1.1);  // a short path arcing over the island
      return { cp, x: cx + Math.cos(a) * r * 0.55, y: cy + Math.sin(a) * r * 0.45 };
    });
    return { stage, index: i, cx, cy, r, checkpoints };
  });
}

/** SVG path for the dotted route between islands. */
export function routePath(islands: IslandLayout[]): string {
  if (!islands.length) return "";
  const pts = islands.map((i) => [i.cx, i.cy] as const);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

export function stageProgress(stage: Stage): { done: number; total: number; label: string } {
  const done = stage.checkpoints.filter((c) => c.status === "completed").length;
  return { done, total: stage.checkpoints.length, label: UI.checkpointsOf(done, stage.checkpoints.length) };
}

export function statusLabel(cp: Checkpoint): string { return STATUS_LABEL[cp.status] ?? cp.status; }

/** Who recorded the completion — explicit, never inferred. */
export function attributionLabel(cp: Checkpoint): string | null {
  if (cp.status !== "completed") return null;
  const who = ATTRIBUTION[cp.completed_by ?? "user"] ?? ATTRIBUTION.user;
  return cp.completed_at ? `${who} · ${cp.completed_at}` : who;
}

export function dateLabel(cp: Checkpoint): string {
  if (!cp.date || !cp.date.value) return UI.noDate;
  const src = ATTRIBUTION[cp.date.source] ?? `source: ${cp.date.source}`;
  return `${cp.date.value} (${src.toLowerCase()})`;
}

/** The next checkpoint in document order after the given one (navigation only — it says nothing about readiness). */
export function nextCheckpoint(journey: Journey, current?: { stageId: string; cpId: string }): { stage: Stage; cp: Checkpoint } | null {
  const flat = journey.stages.flatMap((s) => s.checkpoints.map((cp) => ({ stage: s, cp })));
  if (!current) return flat.find((x) => x.cp.status !== "completed") ?? null;
  const i = flat.findIndex((x) => x.stage.id === current.stageId && x.cp.id === current.cpId);
  return i >= 0 && i + 1 < flat.length ? flat[i + 1] : null;
}

export function currentStageId(journey: Journey): string | null {
  return journey.stages.find((s) => s.checkpoints.some((c) => c.status !== "completed"))?.id ?? journey.stages[journey.stages.length - 1]?.id ?? null;
}

/** The labeled sample journeys offered on the start screen and in "Add another journey": `/journeys/samples` also lists the empty
 *  template ("Your journey"), which is not a sample; it has its own "Start my journey (no documents yet)" / "Empty" entry. */
export function labeledSamples<T extends { id: string }>(samples: T[]): T[] {
  return samples.filter((s) => s.id !== "empty");
}

/** A journey's name for the closed Journey select, short enough for a 334 px phone control: "Sample journey — Alex Chen (fictional) on
 *  the NCFlex Dental Classic Option 2026 (real public plan document)" → "Alex Chen (fictional) · sample". The page heading and the
 *  select's title keep the full label. */
export function shortJourneyLabel(label: string): string {
  const m = /^Sample journey\s+[—-]\s+(.*)$/.exec(label.trim());
  const name = (m ? m[1] : label).split(/\s+on the\s+/)[0].trim();
  return m ? `${name} · sample` : name;
}
