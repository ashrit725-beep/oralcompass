import { describe, expect, it } from "vitest";
import { nearestCard, rowDiffers, shortPlanNames } from "@/lib/compare-cards";

describe("shortPlanNames (phone plan switcher)", () => {
  it("drops the shared carrier so three segments fit a 360 px phone", () => {
    expect(shortPlanNames(["MetLife NCFlex Dental · Classic 2026", "MetLife NCFlex Dental · High 2026", "MetLife NCFlex Dental · Low 2026"])).toEqual(["Classic 2026", "High 2026", "Low 2026"]);
  });
  it("keeps whole labels across carriers and when tails would collide", () => {
    expect(shortPlanNames(["MetLife NCFlex Dental · Classic 2026", "Harborview Dental PPO · 2026 (fictional)"])).toEqual(["MetLife NCFlex Dental · Classic 2026", "Harborview Dental PPO · 2026 (fictional)"]);
    expect(shortPlanNames(["A · 2026", "A · 2026"])).toEqual(["A · 2026", "A · 2026"]);
    expect(shortPlanNames(["Your uploaded document (UP1)", "MetLife NCFlex Dental · High 2026"])).toEqual(["Your uploaded document (UP1)", "MetLife NCFlex Dental · High 2026"]);
  });
});

describe("rowDiffers", () => {
  const cell = (text: string) => ({ text, badge: "DOC" as const, cite: null });
  it("flags a topic only when the printed values differ", () => {
    expect(rowDiffers({ cells: [cell("$1,500.00"), cell("$1,000.00")] })).toBe(true);
    expect(rowDiffers({ cells: [cell("Type I"), cell(" Type  I ")] })).toBe(false);
    expect(rowDiffers({ cells: [cell("Type I")] })).toBe(false);
  });
});

describe("nearestCard", () => {
  it("picks the card whose left edge is closest to the scroll position", () => {
    expect(nearestCard(0, [0, 330, 660])).toBe(0);
    expect(nearestCard(300, [0, 330, 660])).toBe(1);
    expect(nearestCard(700, [0, 330, 660])).toBe(2);
  });
});
