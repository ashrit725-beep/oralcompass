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
