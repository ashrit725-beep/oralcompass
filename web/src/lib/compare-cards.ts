import type { GridRow } from "./types";

/**
 * Pure helpers for the phone Compare view (mobile-only direction, part E): one plan per swipeable card under a sticky segmented switcher.
 * Nothing here computes money; it only shortens names and compares the printed cell texts.
 */

/** Segment names for the plan switcher: when every plan shares the carrier part of its "Carrier · Option year" label, only the tails are
 *  shown ("Classic 2026", "High 2026"); otherwise the whole labels (they wrap inside their segment). Names never collapse into duplicates. */
export function shortPlanNames(labels: string[]): string[] {
  const parts = labels.map((l) => { const i = l.indexOf(" · "); return i < 0 ? [l, ""] : [l.slice(0, i), l.slice(i + 3)]; });
  const sameCarrier = parts.length > 1 && parts.every((p) => p[1] && p[0] === parts[0][0]);
  const out = sameCarrier ? parts.map((p) => p[1]) : labels;
  return new Set(out).size === out.length ? out : labels;
}

/** True when the plans print different values for a topic (whitespace-insensitive). One column never "differs". */
export function rowDiffers(row: Pick<GridRow, "cells">): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const first = row.cells[0] ? norm(row.cells[0].text) : "";
  return row.cells.some((c) => norm(c.text) !== first);
}

/** The card whose left edge is closest to the track's scroll position (the snap target the user swiped to). */
export function nearestCard(scrollLeft: number, offsets: number[]): number {
  let best = 0;
  offsets.forEach((o, i) => { if (Math.abs(o - scrollLeft) < Math.abs(offsets[best] - scrollLeft)) best = i; });
  return best;
}
