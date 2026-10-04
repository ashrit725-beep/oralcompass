import { ATTRIBUTION, STATUS_LABEL, UI } from "./copy";
import type { Checkpoint, Journey, Stage } from "./types";

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
