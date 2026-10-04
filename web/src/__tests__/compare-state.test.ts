import { describe, expect, it } from "vitest";
import { compareStates, monthsSince } from "@/lib/compare-state";
import type { Benefits, TreatmentItem } from "@/lib/types";

const item = (p: Partial<TreatmentItem>): TreatmentItem => ({ id: "t", procedure_key: "root_canal_molar", quantity: 1, dentist_fee_cents: 120000, allowed_cents: null, status: "planned", source: "typed", ...p });
const planned = [
  item({ id: "t1", allowed_cents: 98000, allowed_source: "MetLife pre-treatment estimate response 2026-09-30", network: "in" }),
  item({ id: "t2", procedure_key: "crown_porcelain", allowed_cents: 102000, network: "in" }),
];
const ml26: Benefits = { plan_code: "ML26", coverage_start: "2024-01-01", deductible_met_cents: 2500, benefits_used_cents: 24000, remaining_deductible_cents: 0, remaining_max_cents: 126000, derivation: {},
  claims: [{ date: "2026-03-02", procedure_key: "cleaning" }, { date: "2026-09-01", procedure_key: "cleaning" }], source: { label: "MetLife benefit statement dated 2026-09-20" } };
const dd26: Benefits = { plan_code: "DD26", coverage_start: "2026-04-15", deductible_met_cents: null, benefits_used_cents: null, remaining_deductible_cents: null, remaining_max_cents: null, derivation: {}, claims: [], network_default: "out" };

describe("compareStates (info-only-1: nothing transfers between plans)", () => {
  const today = new Date(2026, 9, 14, 12);

  it("sends allowed amounts and item network to the records plan only", () => {
    const s = compareStates(["ML26", "DD26", "HB26"], planned, [ml26, dd26], "ML26", today);
    expect(s.ML26.allowed_overrides.root_canal_molar).toMatchObject({ value: 98000, status: "USER" });
    expect(s.ML26.network).toMatchObject({ value: "in", status: "USER" });
    expect(s.DD26.allowed_overrides).toEqual({});
    expect(JSON.stringify(s.DD26)).not.toContain("98000");
    expect(s.DD26.network).toMatchObject({ value: "out", status: "USER" });   // DD26's own record default, never ML26's item network
    expect(s.HB26).toBeUndefined();                                           // no record, not the records plan: unresolved
  });

  it("keeps a column empty of item figures when the records plan is another one", () => {
    const s = compareStates(["ML26", "DD26"], planned, [ml26, dd26], "DD26", today);
    expect(s.ML26.allowed_overrides).toEqual({});
    expect(s.ML26.network.status).toBe("UNKNOWN");
    expect(s.DD26.allowed_overrides.crown_porcelain).toMatchObject({ value: 102000 });
  });
});

describe("compareStates (web-correctness-12: same inputs as the server's member_state)", () => {
  it("counts enrolled months on calendar dates, like records.months_between (no UTC shift)", () => {
    expect(monthsSince("2026-04-15", new Date(2026, 9, 14, 12))).toBe(5);
    expect(monthsSince("2026-04-15", new Date(2026, 9, 15, 0, 5))).toBe(6);
    expect(monthsSince("2026-04-15", new Date(2026, 9, 14, 23, 59))).toBe(5);
    expect(monthsSince("not a date", new Date())).toBeNull();
  });

  it("sends the plan's own claim history so used frequency limits apply in Compare", () => {
    const s = compareStates(["ML26", "DD26"], planned, [ml26, dd26], "ML26", new Date(2026, 9, 14));
    expect(s.ML26.history).toEqual({ cleaning: ["2026-03-02", "2026-09-01"] });
    expect(s.DD26.history).toEqual({});
    expect(s.DD26.enrolled_months).toMatchObject({ value: 5, status: "USER" });
  });

  it("falls back to the record's default network when item networks disagree", () => {
    const mixed = [item({ network: "in" }), item({ id: "t3", network: "out" })];
    const s = compareStates(["ML26", "DD26"], mixed, [{ ...ml26, network_default: { value: "in" } }, dd26], "ML26");
    expect(s.ML26.network).toMatchObject({ value: "in", status: "USER" });
  });
});
