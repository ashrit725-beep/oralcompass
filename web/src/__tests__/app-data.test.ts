import { describe, expect, it } from "vitest";
import { firstError, hasPlanned, itemsKey, loadingLabel, pickView, planWanted } from "@/lib/appData";
import type { JourneyView, TreatmentItem } from "@/lib/types";

const item = (id: string, status = "planned", allowed: number | null = null): TreatmentItem =>
  ({ id, procedure_key: "crown_porcelain", quantity: 1, dentist_fee_cents: 102000, allowed_cents: allowed, status, source: "treatment plan" });
const journey = (id: string): JourneyView => ({ id } as unknown as JourneyView);

describe("useAppData state rules", () => {
  it("keys the records by content, so a reload with the same rows does not re-run the estimate (web-correctness-24, mobile-16)", () => {
    const a = [item("t1"), item("t2")];
    expect(itemsKey(a)).toBe(itemsKey(a.map((i) => ({ ...i }))));        // new array, same rows → same key
    expect(itemsKey(a)).not.toBe(itemsKey([item("t1"), item("t2", "planned", 51000)]));   // an allowed amount entered → new key
  });

  it("estimates only planned or scheduled work", () => {
    expect(hasPlanned([item("t1", "completed")])).toBe(false);
    expect(hasPlanned([item("t1", "completed"), item("t2", "scheduled")])).toBe(true);
  });

  it("keeps the open journey on Retry, opens the first on a fresh load (web-correctness-32)", () => {
    const js = [journey("j1"), journey("j2")];
    expect(pickView("j2", js, true)?.id).toBe("j2");
    expect(pickView("j2", js, false)?.id).toBe("j1");
    expect(pickView("gone", js, true)?.id).toBe("j1");
    expect(pickView(null, [], true)).toBeNull();
  });

  it("each flow owns its error: a later success of one flow clears only its own message (web-correctness-32)", () => {
    expect(firstError({ estimate: "estimate failed", records: null })).toBe("estimate failed");
    expect(firstError({ estimate: null, records: null })).toBeNull();
    expect(firstError({ mutation: "m", base: "b" })).toBe("b");
  });

  it("one banner label from independent loading flags: neither flow clears the other's indicator", () => {
    const labels = { base: "Connecting…", processing: "Reading…" };
    expect(loadingLabel({ base: true, plan: false, estimate: true }, labels)).toBe("Connecting…");
    expect(loadingLabel({ base: false, plan: false, estimate: true }, labels)).toBe("Reading…");
    expect(loadingLabel({ base: false, plan: true, estimate: false }, labels)).toBe("Reading…");
    expect(loadingLabel({ base: false, plan: false, estimate: false }, labels)).toBeNull();
  });

  it("does not download the default plan for the new-user start screen (mobile-16)", () => {
    expect(planWanted("DD24", false, false)).toBe(false);   // start screen: no journey, journey tab
    expect(planWanted("ML26", false, true)).toBe(true);     // a journey is open
    expect(planWanted("DD24", true, false)).toBe(true);     // My plan / Compare / Documents
    expect(planWanted("", true, true)).toBe(false);
  });
});
