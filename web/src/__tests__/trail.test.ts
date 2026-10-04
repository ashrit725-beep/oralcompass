import { describe, expect, it } from "vitest";
import { buildTrail } from "@/lib/trail";
import type { LedgerLine } from "@/lib/types";

/** A hand-built engine line in the engine's own step vocabulary: in-network, $1,000.00 fee, $980.00 allowed, deductible already met,
 *  plan pays 60 % of the allowed amount ($588.00), you pay 40 % ($392.00). The trail must arrange these steps and reconcile. */
const line: LedgerLine = {
  label: "Root canal (tooth 19)",
  status: "estimate",
  steps: [
    { label: "Allowed amount (in-network write-off)", cents: 2000, owner: "nobody", rule: "N", stitch: "ML26#p25" },
    { label: "Deductible applied", cents: 0, owner: "patient", rule: "D", stitch: "ML26#p25" },
    { label: "Plan share 60%", cents: 58800, owner: "plan_pre", rule: "CO", stitch: "ML26#p25" },
    { label: "Your share 40%", cents: 39200, owner: "patient", rule: "CO", stitch: "ML26#p25" },
  ],
  patient_cents: 39200,
  plan_cents: 58800,
  plan_is_upper_bound: false,
  flags: [],
  remaining_after: { deductible_cents: 0, annual_max_cents: 91200 },
  benefit_year: 2026,
  treatment_item_id: "ti-a-rct-19",
  procedure_key: "root_canal_molar",
};

describe("buildTrail", () => {
  it("arranges the engine steps in trail order and reconciles fee → allowed → deductible → share → maximum → you pay", () => {
    const t = buildTrail(line);
    expect(t.status).toBe("estimate");
    expect(t.steps.map((s) => s.key)).toEqual(["fee", "allowed", "deductible", "share", "max", "you"]);
    expect(t.fee).toBe(100000);
    expect(t.steps[1].amountOut).toBe(98000);          // allowed
    expect(t.steps[1].owner).toBe("nobody");           // in-network write-off is never the patient's
    expect(t.steps[3].split).toEqual({ plan: 58800, patient: 39200, planPct: 60 });
    expect(t.youPay).toBe(39200);
    expect(t.planPays).toBe(58800);
    expect(t.reconciles).toBe(true);
  });

  it("flags a line whose totals disagree with its steps instead of papering over it", () => {
    const t = buildTrail({ ...line, patient_cents: 40000 });
    expect(t.reconciles).toBe(false);
  });

  it("keeps the unresolved state honest: no fee, no totals, one waiting step", () => {
    const t = buildTrail({ ...line, status: "unresolved", steps: [], patient_cents: null, plan_cents: null, flags: ["allowed amount: not provided"] });
    expect(t.youPay).toBeNull();
    expect(t.reconciles).toBeNull();
    expect(t.steps).toHaveLength(1);
    expect(t.steps[0].explanation).toContain("not provided");
  });
});

describe("web-correctness-11: the share percentage comes from the rule, not from rounded dollars", () => {
  it("keeps the plan's 60% when the deductible absorbs the whole line", () => {
    const t = buildTrail({
      label: "Filling", status: "estimate", plan_cents: 0, patient_cents: 8000, plan_is_upper_bound: false, flags: [], remaining_after: {}, benefit_year: 2026,
      steps: [
        { label: "Deductible", cents: 8000, owner: "patient", rule: "D", stitch: "ML26#p25" },
        { label: "Your share (40% of the amount after deductible)", cents: 0, owner: "patient", rule: "CO", stitch: "ML26#p25" },
        { label: "Plan pays 60% before the annual maximum", cents: 0, owner: "plan_pre", rule: "CO", stitch: "ML26#p25" },
      ],
    });
    const share = t.steps.find((s) => s.key === "share")!;
    expect(share.split?.planPct).toBe(60);
    expect(share.explanation).not.toMatch(/0% of the amount/);
    expect(t.reconciles).toBe(true);
  });
  it("keeps a fractional rule percentage as printed", () => {
    const t = buildTrail({
      label: "x", status: "estimate", plan_cents: 6250, patient_cents: 3750, plan_is_upper_bound: false, flags: [], remaining_after: {}, benefit_year: 2026,
      steps: [
        { label: "Your share (37.5% of the amount after deductible)", cents: 3750, owner: "patient", rule: "CO", stitch: null },
        { label: "Plan pays 62.5% before the annual maximum", cents: 6250, owner: "plan_pre", rule: "CO", stitch: null },
      ],
    });
    expect(t.steps.find((s) => s.key === "share")?.split?.planPct).toBe(62.5);
  });
});
