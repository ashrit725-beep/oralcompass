import { describe, expect, it } from "vitest";
import { checkpointAmountWords, checkpointAriaName, checkpointsForLine, citeForRule, clockWords, conditionWords, missingForLine, rememberStitchAnchor, sectionForRule, stitchForCheckpoint, stitchScopeLabel, takeStitchAnchor } from "@/lib/drawer";
import { stitchesForLine, stitchesFromClauses, uniqueStitches } from "@/lib/stitches";
import type { Clause, CoverageRule, LedgerLine, PlanFixture } from "@/lib/types";

/** Alex's root canal line as the API returns it (api/app/records.py → engine): no D step (deductible met), no M step (within the maximum). */
const alexLine: LedgerLine = {
  label: "Root canal therapy, molar (tooth 19)", status: "estimate",
  steps: [
    { label: "Network adjustment (not owed by you)", cents: 17000, owner: "nobody", rule: "N", stitch: "ML26#p25" },
    { label: "Your share (40% of the amount after deductible)", cents: 39200, owner: "patient", rule: "CO", stitch: "ML26#p25" },
    { label: "Plan pays 60% before the annual maximum", cents: 58800, owner: "plan_pre", rule: "CO", stitch: "ML26#p25" },
  ],
  patient_cents: 39200, plan_cents: 58800, plan_is_upper_bound: false,
  flags: ["waiting period: not found in the pages read — computed as none; could be higher if one applies"],
  remaining_after: { deductible_cents: 0, annual_max_cents: 67200 }, benefit_year: 2026, treatment_item_id: "ti-a-rct-19", procedure_key: "root_canal_molar",
};
const clauses: Clause[] = [
  { n: 1, field: "class_of.amalgam.cite", doc: "ML26", page: 25, quote: "Fillings (amalgam, synthetic, or composite)" },
  { n: 2, field: "classes[1].plan_share_bp_in.cite", doc: "ML26", page: 25, quote: "80% after deductible 60% after deductible 50% after deductible" },
  { n: 3, field: "deductible_individual.cite", doc: "ML26", page: 25, quote: "Calendar-Year Deductible (per person/per family) $50/$150 $25/$75 $25/$75" },
  { n: 4, field: "oon_rule.cite", doc: "ML26", page: 25, quote: "Reimbursement for out-of-network services is based on reasonable and customary (R&C) charge for the area." },
  { n: 5, field: "annual_max.cite", doc: "ML26", page: 25, quote: "Calendar-Year Maximum $5,000 $1,500 $1,000" },
];
const stitches = stitchesFromClauses(clauses);
const plan = {
  source_document: { version_label: "ML26", title: "t", sha256: "", pages: 3 },
  deductible_individual: { value: 2500, status: "DOC", cite: { doc: "ML26", page: 25, quote: clauses[2].quote } },
  annual_max: { value: 150000, status: "DOC", cite: { doc: "ML26", page: 25, quote: clauses[4].quote } },
  oon_rule: { value: "x", status: "DOC", cite: { doc: "ML26", page: 25, quote: clauses[3].quote } },
  alternate_benefit: { status: "UNKNOWN", conditions: [] }, waiting_months: { value: null, status: "UNKNOWN" },
} as unknown as PlanFixture;
const rule = {
  procedure_key: "root_canal_molar", plan_code: "ML26", covered: true, category: "Type II", plan_pays_pct: 60, you_pay_pct: 40,
  coverage_cite: { doc: "ML26", page: 25, quote: clauses[1].quote }, deductible_cite: { doc: "ML26", page: 25, quote: clauses[2].quote },
} as CoverageRule;

describe("words", () => {
  it("maps frequency clocks and alternate-benefit conditions to the spec's words", () => {
    expect(clockWords("calendar_count", 2)).toBe("calendar year");
    expect(clockWords("per_tooth_months", 84)).toContain("84 months per tooth");
    expect(clockWords("lifetime", 1)).toBe("lifetime");
    expect(conditionWords("molar")).toBe("a crown is placed on a molar");
    expect(conditionWords("any")).toBe("this service is performed");
    expect(conditionWords("weird_case")).toContain("weird case");
  });
  it("routes every checkpoint rule to a drawer section", () => {
    expect(sectionForRule("D")).toBe("deductible"); expect(sectionForRule("CO")).toBe("share"); expect(sectionForRule("M")).toBe("annualMax");
    expect(sectionForRule("N")).toBe("allowance"); expect(sectionForRule("missing")).toBe("allowance"); expect(sectionForRule("X")).toBe("exclusions");
    expect(sectionForRule("W")).toBe("waiting"); expect(sectionForRule("F")).toBe("frequency"); expect(sectionForRule("AB")).toBe("alternate");
    expect(sectionForRule("total")).toBe("finalCost"); expect(sectionForRule("fee")).toBe("procedure");
  });
});

describe("stitch resolution", () => {
  it("prefers the rule row's exact cite over the engine's page label", () => {
    const co = stitchForCheckpoint("CO", "ML26#p25", rule, plan, stitches);
    expect(co?.quote).toBe(clauses[1].quote);                 // not the first CO stitch on the page (the fillings clause)
    expect(stitchForCheckpoint("N", "ML26#p25", rule, plan, stitches)?.quote).toBe(clauses[3].quote);
    expect(stitchForCheckpoint("D", null, rule, plan, stitches)?.quote).toBe(clauses[2].quote);
    expect(citeForRule("M", rule, plan)?.quote).toBe(clauses[4].quote);
  });
  it("falls back to the page label when the rule has no cite, and to nothing when there is no label", () => {
    expect(stitchForCheckpoint("CO", "ML26#p25", undefined, plan, stitches)).toBeDefined();
    expect(stitchForCheckpoint("AB", null, rule, plan, stitches)).toBeUndefined();
  });
  it("collects the unique stitches of a line in step order", () => {
    const list = stitchesForLine(alexLine, stitches);
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
    expect(uniqueStitches([list[0], list[0], undefined]).length).toBe(1);
    expect(stitchScopeLabel(list[0])).toBe("ML26#p25");
  });
});

describe("checkpointsForLine", () => {
  it("builds the six fixed checkpoints for an estimate line and keeps zero changes as information", () => {
    const cps = checkpointsForLine(alexLine, undefined, rule, plan, stitches);
    expect(cps.map((c) => c.rule)).toEqual(["fee", "N", "D", "CO", "M", "total"]);
    expect(cps[0].amountOut).toBe(115000);                     // fee = allowed + network adjustment (reconciled display sum)
    expect(cps[1].owner).toBe("nobody");                       // the in-network write-off is never the patient's
    expect(cps[2].change).toBe(-0);                            // deductible: zero change still a checkpoint
    expect(cps[3].split).toEqual({ plan: 58800, patient: 39200, planPct: 60 });
    expect(cps[3].stitch?.quote).toBe(clauses[1].quote);
    expect(cps[5].amountOut).toBe(39200);
    expect(checkpointAmountWords(cps[3])).toBe("plan 60% · you 40%");
    expect(checkpointAmountWords(cps[4])).toBe("within the remaining maximum");
    expect(checkpointAriaName(cps[1])).toContain("change −$170.00");
    expect(checkpointAriaName(cps[1])).toContain("clause ML26");
    expect(cps[2].flags).toEqual([]);
  });
  it("gives a not-covered line exactly fee, one closed checkpoint and you pay", () => {
    const nc: LedgerLine = { ...alexLine, status: "not_covered", steps: [{ label: "Not covered: excluded by the plan", cents: 55000, owner: "patient", rule: "X", stitch: "ML26#p26" }], patient_cents: 55000, plan_cents: 0 };
    const cps = checkpointsForLine(nc, undefined, undefined, plan, stitches);
    expect(cps.map((c) => c.rule)).toEqual(["fee", "X", "total"]);
    expect(cps[1].explanation).toBe("Not covered: excluded by the plan");
    expect(cps[1].place).toBe("the closed channel");
  });
  it("gives an unresolved line one fog checkpoint carrying the missing inputs", () => {
    const un: LedgerLine = { ...alexLine, status: "unresolved", steps: [], patient_cents: null, plan_cents: null, flags: ["allowed amount: not stated"] };
    const missing = missingForLine([{ input: "allowed amount — Root canal therapy, molar (tooth 19)", how: "how", line: alexLine.label }, { input: "other", how: "h", line: "Crown" }], un);
    expect(missing).toHaveLength(1);
    const cps = checkpointsForLine(un, undefined, rule, plan, stitches, missing);
    expect(cps).toHaveLength(1);
    expect(cps[0].rule).toBe("missing"); expect(cps[0].badge).toBe("UNKNOWN"); expect(cps[0].amountOut).toBeNull();
    expect(cps[0].explanation).toContain("allowed amount");
    expect(checkpointAmountWords(cps[0])).toBe("Waiting for information");
  });
});

describe("thread-pull anchor bridge", () => {
  it("hands the pressed chip's rectangle to the next ClauseCard once", () => {
    const r = { left: 1, top: 2, width: 3, height: 4 } as DOMRect;
    rememberStitchAnchor(r);
    expect(takeStitchAnchor()).toBe(r);
    expect(takeStitchAnchor()).toBeNull();
  });
});
