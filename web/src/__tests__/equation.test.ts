import { describe, expect, it } from "vitest";
import { buildTrail, equationRows, type EquationRow } from "@/lib/trail";
import type { LedgerLine } from "@/lib/types";

const labels = { fee: "dentist's fee", allowed: "allowed amount", basis: "alternate basis", afterDeductible: "after the deductible", planShare: "plan share", yourShare: "your share", planPays: "plan pays", youPay: "you pay", fullFee: "the full fee is your share" };
const cents = (r: EquationRow) => r.parts.filter((p) => p.kind === "cents").map((p) => (p as { cents: number }).cents);
const ops = (r: EquationRow) => r.parts.filter((p) => p.kind === "op").map((p) => (p as { op: string }).op).join("");

/** Alex's root canal (ML26): $1,150.00 fee, $980.00 allowed, deductible met, 60 % / 40 %, within the maximum. */
const alex: LedgerLine = {
  label: "Root canal therapy, molar (tooth 19)", status: "estimate",
  steps: [
    { label: "Network adjustment (not owed by you)", cents: 17000, owner: "nobody", rule: "N", stitch: "ML26#p25" },
    { label: "Your share (40% of the amount after deductible)", cents: 39200, owner: "patient", rule: "CO", stitch: "ML26#p25" },
    { label: "Plan pays 60% before the annual maximum", cents: 58800, owner: "plan_pre", rule: "CO", stitch: "ML26#p25" },
  ],
  patient_cents: 39200, plan_cents: 58800, plan_is_upper_bound: false, flags: [], remaining_after: { deductible_cents: 0, annual_max_cents: 67200 }, benefit_year: 2026,
};
/** Sam's crown (HB26): the alternate-benefit pair (basis −$200.00, difference +$200.00) around a 50 % split. */
const sam: LedgerLine = {
  label: "Crown, porcelain or ceramic (tooth 30)", status: "estimate",
  steps: [
    { label: "Network adjustment (not owed by you)", cents: 20000, owner: "nobody", rule: "N", stitch: "HB26#p10" },
    { label: "Alternate benefit: plan pays on the lower allowance", cents: -20000, owner: "basis", rule: "AB", stitch: "HB26#p9" },
    { label: "Your share (50% of the amount after deductible)", cents: 40000, owner: "patient", rule: "CO", stitch: "HB26#p5" },
    { label: "Plan pays 50% before the annual maximum", cents: 40000, owner: "plan_pre", rule: "CO", stitch: "HB26#p5" },
    { label: "Difference between the allowed amount and the alternate basis (your share)", cents: 20000, owner: "patient", rule: "AB", stitch: "HB26#p9" },
  ],
  patient_cents: 60000, plan_cents: 40000, plan_is_upper_bound: false, flags: [], remaining_after: { deductible_cents: 0, annual_max_cents: 35500 }, benefit_year: 2026,
};

describe("equationRows", () => {
  it("formats Alex's root canal from the trail's reconciled sums: $980.00 × 60% = $588.00 plan share", () => {
    const t = buildTrail(alex);
    expect(t.reconciles).toBe(true);
    const rows = equationRows(t, labels);
    expect(rows.map((r) => r.key)).toEqual(["fee", "allowed", "deductible", "share-plan", "share-you", "max", "you"]);
    expect(cents(rows[1])).toEqual([115000, 17000, 98000]); expect(ops(rows[1])).toBe("−=");
    const share = rows.find((r) => r.key === "share-plan")!;
    expect(cents(share)).toEqual([98000, 58800]); expect(ops(share)).toBe("×=");
    expect(share.parts.find((p) => p.kind === "pct")).toEqual({ kind: "pct", pct: 60 });
    expect(share.label).toBe("plan share"); expect(share.stitch).toBe("ML26#p25");
    const you = rows[rows.length - 1];
    expect(you.result).toBe(39200);
    expect(cents(you)).toEqual([0, 39200, 39200]);            // deductible + your share = you pay (no beyond-maximum, no AB, nothing listed)
  });
  it("includes the alternate basis and difference for Sam's crown and sums to the engine's patient total", () => {
    const t = buildTrail(sam);
    expect(t.reconciles).toBe(true);
    const rows = equationRows(t, labels);
    const alt = rows.find((r) => r.key === "alternate")!;
    expect(cents(alt)).toEqual([100000, 20000, 80000]); expect(alt.owner).toBe("basis"); expect(alt.stitch).toBe("HB26#p9");
    const you = rows[rows.length - 1];
    expect(you.result).toBe(60000);
    expect(cents(you)).toEqual([0, 40000, 20000, 60000]);     // deductible + your share + alternate difference
  });
  it("gives a not-covered line the fee, the closed step and you pay, and an unresolved line nothing", () => {
    const nc: LedgerLine = { ...alex, status: "not_covered", steps: [{ label: "Not covered: excluded by the plan", cents: 55000, owner: "patient", rule: "X", stitch: "ML26#p26" }], patient_cents: 55000, plan_cents: 0 };
    const rows = equationRows(buildTrail(nc), labels);
    expect(rows.map((r) => r.key)).toEqual(["fee", "x", "you"]);
    expect(rows[1].stitch).toBe("ML26#p26"); expect(rows[2].result).toBe(55000);
    const un: LedgerLine = { ...alex, status: "unresolved", steps: [], patient_cents: null, plan_cents: null, flags: ["allowed amount: not stated"] };
    expect(equationRows(buildTrail(un), labels)).toEqual([]);
  });
});
