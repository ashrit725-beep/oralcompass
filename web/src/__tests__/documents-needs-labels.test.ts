import { describe, expect, it } from "vitest";
import { needsLabels } from "@/components/DocumentsView";

describe("Documents card: fields needing confirmation", () => {
  it("shows an upload's extraction keys in words, once each, and keeps seeded notes as written", () => {
    expect(needsLabels([
      "benefit_year_start_month", "classes[0].plan_share_bp_in", "classes[2].plan_share_bp_in", "class_of", "waiting_months", "waiting_months",
      "waiting period (not stated)",
    ])).toEqual([
      "Benefit year start", "Plan share in network, class 1", "Plan share in network, class 3", "Coverage class of each procedure", "Waiting period",
      "waiting period (not stated)",
    ]);
  });
});
