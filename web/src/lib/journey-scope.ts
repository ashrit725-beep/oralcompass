import type { Journey, TreatmentItem } from "@/lib/types";

/**
 * Records seeded from a sample belong only to that sample's journeys; the user's own records belong to every journey of theirs.
 * Mirrors `item_in_journey` in api/app/records.py, so opening a second sample never mixes its procedures into the first.
 */
export function itemsForJourney(items: TreatmentItem[], journey: Pick<Journey, "user_ref"> | null | undefined): TreatmentItem[] {
  const ref = journey?.user_ref ?? null;
  return items.filter((i) => !i.seeded_from_sample || (ref !== null && i.seeded_from_sample === ref));
}
