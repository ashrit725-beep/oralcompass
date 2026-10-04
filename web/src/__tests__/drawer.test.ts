import { describe, expect, it } from "vitest";
import { allowedFigure, calcInputs, checkpointAmountWords, drawerPlanRef, checkpointAriaName, checkpointsForLine, citeForRule, rangeWords, remainingBeforeLine, clockWords, conditionWords, missingForLine, rememberStitchAnchor, sectionForRule, stitchForCheckpoint, stitchScopeLabel, takeStitchAnchor } from "@/lib/drawer";
import { stepContextFor, stitchesForLine, stitchesFromClauses, stitchForStep, uniqueStitches } from "@/lib/stitches";
import type { Benefits, Clause, CoverageRule, LedgerLine, PlanFixture, SavedEstimate, TreatmentItem } from "@/lib/types";
import { DRAWER } from "@/lib/copy/drawer";

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
  it("badges the network adjustment with the recorded allowed amount's evidence, not the cited clause's (numbers-1)", () => {
    const item = { id: "ti-a-rct-19", procedure_key: "root_canal_molar", dentist_fee_cents: 115000, quantity: 1, allowed_cents: 98000, allowed_status: "USER" } as unknown as TreatmentItem;
    const cps = checkpointsForLine(alexLine, item, rule, plan, stitches);
    const n = cps.find((c) => c.rule === "N")!;
    expect(n.stitch).toBeDefined();                            // the in-network clause chip still shows
    expect(n.badge).toBe("USER");                              // the dollars come from the entered allowed amount
    expect(checkpointsForLine(alexLine, { ...item, allowed_status: "ASSUMED" } as TreatmentItem, rule, plan, stitches).find((c) => c.rule === "N")!.badge).toBe("ASSUMED");
    expect(checkpointsForLine(alexLine, { ...item, allowed_cents: null, allowed_status: "DOC" } as unknown as TreatmentItem, rule, plan, stitches).find((c) => c.rule === "N")!.badge).toBe("DOC");
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

describe("demo-3: a coinsurance step cites its own class row", () => {
  // ML26 page 25 holds the coverage table for every class; sorted by quote, the Type I "100%" row comes first.
  const page25: Clause[] = [
    { n: 1, field: "classes[0].plan_share_bp_in.cite", doc: "ML26", page: 25, quote: "100% 100% 100% after deductible" },
    { n: 2, field: "classes[2].plan_share_bp_in.cite", doc: "ML26", page: 25, quote: "50% after deductible 50% after deductible Not Covered" },
    { n: 3, field: "classes[1].plan_share_bp_in.cite", doc: "ML26", page: 25, quote: "80% after deductible 60% after deductible 50% after deductible" },
  ];
  const st = stitchesFromClauses(page25);
  it("resolves the root canal CO steps through the rule row's coverage cite, not the first CO quote on the page", () => {
    const withoutCtx = stitchesForLine(alexLine, st);
    expect(withoutCtx[0].quote.startsWith("100%")).toBe(true);           // the old behaviour this guards against
    const list = stitchesForLine(alexLine, st, stepContextFor(alexLine, [rule]));
    const co = list.find((s) => s.ruleCodes.includes("CO") && s.quote.includes("60%"));
    expect(co).toBeDefined();
    const coSteps = alexLine.steps.filter((s) => s.rule === "CO").map((s) => stitchForStep(s, st, stepContextFor(alexLine, [rule])));
    expect(coSteps.every((s) => s?.quote.includes("60%") && !s.quote.startsWith("100%"))).toBe(true);
    expect(stitchForStep(alexLine.steps[2], st, { coverageCite: rule.coverage_cite })?.quote).toContain("60%");
  });
  it("leaves non-CO steps and lines without a rule row on the page lookup", () => {
    expect(stepContextFor({ procedure_key: "unknown" }, [rule])).toBeUndefined();
    expect(stitchForStep(alexLine.steps[0], st, { coverageCite: rule.coverage_cite })?.quote).toBe(st[0].quote);
  });
});

describe("demo-4: remaining before a line follows the route", () => {
  const crownLine: LedgerLine = { ...alexLine, label: "Crown", plan_cents: 51000, patient_cents: 51000, remaining_after: { deductible_cents: 0, annual_max_cents: 16200 }, procedure_key: "crown" };
  const lines = [alexLine, crownLine];
  const benefits = { remaining_deductible_cents: 0, remaining_max_cents: 126000 } as unknown as Benefits;
  it("starts the first line from the statement and later lines from the previous line's remaining_after", () => {
    expect(remainingBeforeLine("max", 0, lines, benefits)).toEqual({ cents: 126000, calculated: false });
    expect(remainingBeforeLine("max", 1, lines, benefits)).toEqual({ cents: 67200, calculated: true });   // $672.00, not the statement's $1,260.00
    expect(remainingBeforeLine("deductible", 1, lines, benefits)).toEqual({ cents: 0, calculated: true });
    expect(remainingBeforeLine("max", undefined, lines, benefits).cents).toBe(126000);
  });
  it("reconciles: before − consumed = after for the crown", () => {
    const before = remainingBeforeLine("max", 1, lines, benefits).cents ?? 0;
    expect(before - crownLine.plan_cents!).toBe(crownLine.remaining_after.annual_max_cents);
  });
});

describe("orchestrator note 1: calculated totals list the evidence of their inputs", () => {
  it("names USER for entered figures and ASSUMED for hypotheticals, never DOC", () => {
    const item = { id: "i", procedure_key: "crown", quantity: 1, dentist_fee_cents: 100000, allowed_cents: 90000, allowed_status: "USER", status: "planned" } as unknown as TreatmentItem;
    expect(calcInputs(item, null)).toEqual(["USER"]);
    expect(calcInputs({ ...item, allowed_status: "ASSUMED" }, null)).toEqual(["USER", "ASSUMED"]);
    const est = { inputs: { treatment_item_ids: ["i"], hypotheticals: {} }, assumptions: ["network assumed in"] } as unknown as SavedEstimate;
    expect(calcInputs(undefined, est)).toEqual(["USER", "ASSUMED"]);
    expect(calcInputs(item, null)).not.toContain("DOC");
  });
});

describe("demo-15: the movers range sentence never prints an empty cause", () => {
  it("names the measured movers, else every unknown input, else no 'because' clause", () => {
    expect(rangeWords([64000, 66500], [{ unknown: "remaining deductible", impact_cents: 2500, zero_impact: false }])).toContain("because remaining deductible was not provided");
    const multi = rangeWords([64000, 120000], [{ unknown: "remaining deductible", impact_cents: null, zero_impact: false }, { unknown: "enrollment date", impact_cents: null, zero_impact: false }]);
    expect(multi).toContain("remaining deductible and enrollment date");
    expect(multi).not.toMatch(/because\s+was/);
    expect(rangeWords([64000, 120000], [])).toBe("Between $640.00 and $1,200.00.");
  });
});

describe("demo-16 / slop-18: Harbor Light words", () => {
  it("agrees the verb for one stage, lists stage progress and does not repeat the place in the crumbs", () => {
    expect(DRAWER.afterRouteStages(1)).toMatch(/^1 care stage follows the route/);
    expect(DRAWER.afterRouteStages(2)).toMatch(/^2 care stages follow the route/);
    expect(DRAWER.stageProgress("Follow-up", 0, 2)).toBe("Follow-up · 0 of 2 checkpoints completed");
    expect(DRAWER.crumbsLight("Harbor Light")).not.toContain("Harbor Light");
  });
});

describe("web-correctness-23: uploaded plans send their upload ref, not the version label", () => {
  it("prefers the app's selected plan ref over the model's plan_code", () => {
    expect(drawerPlanRef("upload:abc123", null, { plan_code: "UP1" })).toBe("upload:abc123");
    expect(drawerPlanRef(undefined, { plan_code: "ML26" }, { plan_code: "ML26" })).toBe("ML26");
    expect(drawerPlanRef(undefined, null, { plan_code: "HB26" })).toBe("HB26");
  });
});

describe("demo-13: a table-row quote carries its section and plan option", () => {
  it("keeps the clause's section and the option column from the fact id", () => {
    const [s] = stitchesFromClauses([{ n: 30, field: "classes[1].plan_share_bp_in.cite", doc: "ML26", page: 25, quote: "80% after deductible 60% after deductible 50% after deductible",
      section: "Summary of Dental Benefits — Type II — Basic Services (row 1)", fact_id: "ncflex-2026-plan-details:coinsurance_type2_basic:Classic" }]);
    expect(s.section).toContain("Type II");
    expect(s.option).toBe("Classic");
    expect(DRAWER.clauseOption("Classic")).toContain("Classic column");
  });
});

describe("allowedFigure (numbers-4)", () => {
  const step = { amountOut: 100000, stitch: "HB26#p10" };
  const est = { ...alexLine, status: "estimate" } as LedgerLine;
  it("shows the engine's cited plan allowance as DOC when the item has no recorded allowed amount (Sam's crown, HB26 Appendix A)", () => {
    const item = { allowed_cents: null, allowed_status: "UNKNOWN" } as unknown as TreatmentItem;
    expect(allowedFigure(item, est, step)).toEqual({ cents: 100000, evidence: "DOC", fromPlan: true });
  });
  it("keeps the recorded figure and its own status first", () => {
    const item = { allowed_cents: 98000, allowed_status: "USER" } as unknown as TreatmentItem;
    expect(allowedFigure(item, est, step)).toEqual({ cents: 98000, evidence: "USER", fromPlan: false });
  });
  it("stays unknown on an unresolved line or an uncited step", () => {
    const item = { allowed_cents: null, allowed_status: "UNKNOWN" } as unknown as TreatmentItem;
    expect(allowedFigure(item, { ...est, status: "unresolved" } as LedgerLine, step).cents).toBeNull();
    expect(allowedFigure(item, est, { amountOut: 100000, stitch: null })).toEqual({ cents: null, evidence: "UNKNOWN", fromPlan: false });
  });
});
