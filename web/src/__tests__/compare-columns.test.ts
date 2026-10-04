import { describe, expect, it } from "vitest";
import { defaultCompareColumns } from "@/lib/appData";

describe("Compare default columns (demo-20)", () => {
  const plans = [
    { plan_code: "DD24", insurer: "Delta Dental Insurance Company", plan_name: "Delta Dental PPO", plan_year: 2024 },
    { plan_code: "DD24L", insurer: "Delta Dental Insurance Company", plan_name: "Delta Dental PPO", plan_year: 2024 },
    { plan_code: "ML26", insurer: "MetLife", plan_name: "NCFlex Dental Plan", plan_year: 2026 },
    { plan_code: "ML26H", insurer: "MetLife", plan_name: "NCFlex Dental Plan", plan_year: 2026 },
    { plan_code: "ML26L", insurer: "MetLife", plan_name: "NCFlex Dental Plan", plan_year: 2026 },
    { plan_code: "HB26", insurer: "Harborview (fictional)", plan_name: "Harborview Dental PPO", plan_year: 2026 },
  ];
  it("opens the plan's own options next to it, in catalog order", () => {
    expect(defaultCompareColumns("ML26", plans)).toEqual(["ML26", "ML26H", "ML26L"]);
    expect(defaultCompareColumns("ML26H", plans)).toEqual(["ML26H", "ML26", "ML26L"]);
  });
  it("falls back to the catalog order when the plan has no sibling options", () => {
    expect(defaultCompareColumns("HB26", plans)).toEqual(["HB26", "DD24", "DD24L"]);
    expect(defaultCompareColumns("", plans)).toEqual(["DD24", "DD24L", "ML26"]);
  });
});
