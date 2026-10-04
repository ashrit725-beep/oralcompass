import { describe, expect, it } from "vitest";
import { itemsForJourney } from "@/lib/journey-scope";
import type { TreatmentItem } from "@/lib/types";

const item = (id: string, seeded?: string): TreatmentItem =>
  ({ id, procedure_key: "crown", quantity: 1, dentist_fee_cents: 100, allowed_cents: null, status: "planned", source: "typed", seeded_from_sample: seeded ?? null });

describe("itemsForJourney (demo-1)", () => {
  const all = [item("a1", "alex"), item("s1", "sam"), item("own")];
  it("keeps one sample's records and the user's own", () => {
    expect(itemsForJourney(all, { user_ref: "alex" }).map((i) => i.id)).toEqual(["a1", "own"]);
    expect(itemsForJourney(all, { user_ref: "sam" }).map((i) => i.id)).toEqual(["s1", "own"]);
  });
  it("an empty journey (no sample) shows only the user's own records", () => {
    expect(itemsForJourney(all, { user_ref: null }).map((i) => i.id)).toEqual(["own"]);
    expect(itemsForJourney(all, null).map((i) => i.id)).toEqual(["own"]);
  });
});
