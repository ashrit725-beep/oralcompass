/**
 * Pure helpers behind `useAppData` (kept out of the hook so the state rules are unit-tested without a DOM).
 */
import type { JourneyView, TreatmentItem } from "./types";

/**
 * A content key for the treatment items: the estimate re-runs when the records CHANGE, not every time `loadRecords()` hands back a new
 * array with the same rows (web-correctness-24, mobile-16).
 */
export const itemsKey = (items: TreatmentItem[]) => JSON.stringify(items);

/** Only planned or scheduled work is estimated. */
export const hasPlanned = (items: TreatmentItem[]) => items.some((i) => i.status === "planned" || i.status === "scheduled");

/**
 * The journey to show after the journeys list is (re)loaded. A retry keeps the journey the person had open when it still exists
 * (web-correctness-32); the first load opens the first journey.
 */
export function pickView(currentId: string | null | undefined, journeys: JourneyView[], keepCurrent: boolean): JourneyView | null {
  if (keepCurrent && currentId) { const same = journeys.find((j) => j.id === currentId); if (same) return same; }
  return journeys[0] ?? null;
}

/** Each loading flow owns its error; a later success of that flow clears only its own message (web-correctness-32). */
export type Flow = "base" | "records" | "plan" | "estimate" | "mutation";
export type FlowErrors = Partial<Record<Flow, string | null>>;
const ORDER: Flow[] = ["base", "plan", "records", "estimate", "mutation"];
export const firstError = (errors: FlowErrors): string | null => ORDER.map((f) => errors[f]).find((m): m is string => !!m) ?? null;

/** One banner label from the independent loading flows: connecting wins over recalculating; neither clears the other's flag. */
export function loadingLabel(flags: { base: boolean; plan: boolean; estimate: boolean }, labels: { base: string; processing: string }): string | null {
  if (flags.base) return labels.base;
  if (flags.plan || flags.estimate) return labels.processing;
  return null;
}

/**
 * Whether the plan model, rules and evidence are needed now (mobile-16): not on the new-user start screen, where nothing reads them;
 * yes as soon as a journey is open or another view (My plan, Compare, Documents) is showing.
 */
export const planWanted = (planRef: string, planNeeded: boolean, hasView: boolean) => !!planRef && (planNeeded || hasView);
