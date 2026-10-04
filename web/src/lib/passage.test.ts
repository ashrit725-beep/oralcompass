import { describe, expect, it } from "vitest";
import alexJson from "../__fixtures__/passage/alex.json";
import samJson from "../__fixtures__/passage/sam.json";
import { chipTitle, answersLog, buildPassage, planDisplayCode, checkpointAria, islandAmountText, matchLine, moneyText, smoothRoute, type PassageInputs } from "./passage";
import { checkpointsForLine } from "./drawer";
import { stitchesFromClauses } from "./stitches";
import type { Clause, CoverageRule, JourneyView, LedgerLine, PassageVM, PlanFixture, Procedure, SavedEstimate, TreatmentItem } from "./types";

type Fixture = { view: JourneyView; items: TreatmentItem[]; benefits: PassageInputs["benefits"][]; estimate: SavedEstimate; rules: CoverageRule[]; plan: PlanFixture; clauses: Clause[]; procedures: Procedure[] };

function inputs(f: Fixture, planRef: string): PassageInputs {
  return {
    items: f.items, estimate: f.estimate, benefits: f.benefits.find((b) => b?.plan_code === planRef) ?? null, journey: f.view, rules: f.rules, plan: f.plan,
    procedures: f.procedures, stitches: stitchesFromClauses(f.clauses), planRef,
  };
}
const alex = inputs(alexJson as unknown as Fixture, "ML26");
const sam = inputs(samJson as unknown as Fixture, "HB26");
const alexEstimate = alex.estimate as SavedEstimate;

describe("buildPassage — Alex on ML26 (CLAUDE.md rule 8: $902.00 you / $1,098.00 plan)", () => {
  const vm = buildPassage(alex);
  it("draws 2 route islands, 4 visited, 1 marginal", () => {
    expect(vm.status).toBe("estimate");
    expect(vm.islands.map((i) => i.title)).toEqual(["Root canal therapy, molar", "Crown, porcelain/ceramic"]);
    expect(vm.visited).toHaveLength(4);                                        // exam, cleaning, bitewing x-rays (claim only), composite
    expect(vm.visited.map((v) => v.item?.procedure_key ?? v.claim?.procedure_key)).toEqual(["exam", "cleaning", "bitewing_xrays", "composite"]);
    expect(vm.visited.every((v) => v.claim)).toBe(true);
    expect(vm.marginal).toHaveLength(1);
    expect(vm.marginal[0].place).toBe("Outer Reef");
  });
  it("names islands by the fixed vocabulary and matches lines by treatment_item_id", () => {
    expect(vm.islands[0].place).toBe("Narrow Strait");
    expect(vm.islands[1].place).toBe("High Cliffs");
    expect(vm.islands[0].line?.treatment_item_id).toBe(vm.islands[0].itemId);
    expect(vm.islands[0].lineIndex).toBe(0);
    expect(vm.islands[0].subtitle).toBe("tooth 19 · scheduled");
    expect(vm.islands[0].stageIds).toEqual(["before", "visit", "recovery"]);  // bridged through seed_id
  });
  it("prints soundings $0.00/$672.00 after the root canal and $0.00/$162.00 after the crown", () => {
    expect(vm.islands[0].soundingsAfter).toEqual({ deductible: 0, annualMax: 67200, unlimited: false });
    expect(vm.islands[1].soundingsAfter).toEqual({ deductible: 0, annualMax: 16200, unlimited: false });
    expect(vm.destination.soundingsAfter?.annualMax).toBe(16200);
    expect(vm.start.soundingsAfter).toEqual({ deductible: 0, annualMax: 126000, unlimited: false });
  });
  it("builds checkpoints in the fixed slot order with zero-change pass-through markers for the deductible and the maximum", () => {
    const cps = vm.islands[0].checkpoints;
    expect(cps.map((c) => c.rule)).toEqual(["fee", "N", "D", "CO", "M", "total"]);
    expect(cps[0].amountOut).toBe(115000);
    expect(cps[1].change).toBe(-17000); expect(cps[1].owner).toBe("nobody"); expect(cps[1].amountOut).toBe(98000);
    expect(cps[2].change).toBe(0); expect(cps[2].stepIndexes).toEqual([]); expect(cps[2].badge).toBe("DOC"); expect(cps[2].stitch?.page).toBe(25);   // met per the statement; the deductible clause is cited (same as the pipeline)
    expect(cps[3].split).toEqual({ plan: 58800, patient: 39200, planPct: 60 });
    expect(cps[3].stitch?.doc).toBe("ML26"); expect(cps[3].stitch?.page).toBe(25); expect(cps[3].badge).toBe("DOC");
    expect(cps[4].change).toBe(0); expect(cps[4].stepIndexes).toEqual([]);
    expect(cps[5].amountOut).toBe(39200);
    expect(vm.islands[1].youPay).toBe(51000); expect(vm.islands[1].planPays).toBe(51000);
  });
  it("totals come from the engine only; steps cited and rules not stated are counted, not computed", () => {
    expect(vm.totals).toEqual({ youPay: 90200, planPays: 109800, upperBound: false, range: [90200, 90200] });   // the engine's own range
    expect(vm.stepsCited).toBe(6);
    expect(vm.rulesNotStated).toBe(2);                                        // waiting period + alternate benefit, deduped
    expect(vm.islands[0].notices).toHaveLength(2);
  });
  it("marginal night guard is a single closed checkpoint with the exclusion stitch and never an amount", () => {
    const ng = vm.marginal[0];
    expect(ng.checkpoints).toHaveLength(1);
    expect(ng.checkpoints[0].rule).toBe("X");
    expect(ng.checkpoints[0].stitch?.page).toBe(26);
    expect(ng.youPay).toBeNull();
    expect(islandAmountText(ng)).toBe("insurance won't pay");
    expect(ng.notices[0]).toMatch(/Talked about at the visit/);
  });
  it("START reads the plan_details stage; the Light lists the stages after the route including the last one", () => {
    expect(vm.start.title).toBe("Starting point");
    expect(vm.start.place).toBe("Harbor of Beginnings");
    expect(vm.start.subtitle).toBe("ML26 · on your plan's list");
    expect(vm.start.stageIds).toEqual(["start"]);
    expect(vm.destination.stageIds).toEqual(["followup"]);                    // last linked stage is followup (crown) → nothing after; last stage kept
    expect(vm.destination.subtitle).toBe("Follow-up · Compass Rest");
    expect(vm.destination.youPay).toBe(90200);
  });
  it("answers log never prints $0.00 for a missing estimate and reads the five answers", () => {
    const rows = answersLog(vm, alex.journey, alex.plan, alexEstimate);
    expect(rows.map((r) => r.dt)).toEqual(["Where you are", "Your care", "You pay", "Plan rules used", "From"]);
    expect(rows[0].dd).toBe("Before your visit · 1 of 3 checkpoints completed");
    expect(rows[1].dd).toBe("2 care items, 4 done, says your insurance letter");
    expect(rows[2].dd).toBe("$902.00 · insurance $1,098.00");
    expect(rows[3].dd).toBe("6 steps from the papers · 2 rules not in the papers");
    expect(rows[4].dd).toMatch(/^ML26 · 2026 NCFlex Dental/);
    const none = answersLog(buildPassage({ ...alex, estimate: null }), alex.journey, alex.plan, null);
    expect(none[2].dd).toBe("No numbers yet");
    const unresolved: SavedEstimate = { ...alexEstimate, status: "unresolved", user_estimated_payment_cents: null, missing_inputs: [{ input: "remaining deductible", how: "x" }], ledger: { ...alexEstimate.ledger, lines: [] } };
    const u = answersLog(buildPassage({ ...alex, estimate: unresolved }), alex.journey, alex.plan, unresolved);
    expect(u[2].dd).toBe("We need more info (1 thing)");
    expect(u[2].dd).not.toContain("$0.00");
    expect(answersLog(vm, alex.journey, alex.plan, alexEstimate, true)[2].dd).toBe("Doing the math…");
  });
  it("checkpoint accessible names carry the whole fact", () => {
    const cps = vm.islands[0].checkpoints;
    expect(checkpointAria(cps[1])).toBe("Allowed amount: −$170.00, after this step $980.00, you don't pay this, rule ML26 page 25");
    expect(checkpointAria(cps[2])).toBe("Deductible: same, after this step $980.00, rule ML26 page 25");
    expect(checkpointAria(cps[3])).toBe("Plan share: insurance 60% $588.00, you 40% $392.00, rule ML26 page 25");
    expect(checkpointAria(cps[5])).toBe("You pay: $392.00");
    expect(islandAmountText(vm.islands[0])).toBe("you pay $392.00");
  });
});

describe("buildPassage — Sam on HB26 ($640.00 you / $560.00 plan)", () => {
  const vm = buildPassage(sam);
  it("totals and the alternate-benefit checkpoint", () => {
    expect(vm.totals.youPay).toBe(64000); expect(vm.totals.planPays).toBe(56000);
    expect(moneyText(vm.totals.youPay)).toBe("$640.00");
    const crown = vm.islands[0];
    expect(crown.place).toBe("High Cliffs");
    expect(crown.checkpoints.map((c) => c.rule)).toEqual(["fee", "N", "AB", "D", "CO", "M", "total"]);
    expect(crown.checkpoints[2].change).toBe(-20000); expect(crown.checkpoints[2].owner).toBe("basis");
    expect(crown.checkpoints[2].stitch?.doc).toBe("HB26"); expect(crown.checkpoints[2].stitch?.page).toBe(9);
    expect(crown.youPay).toBe(60000);
    expect(vm.islands[1].place).toBe("Quiet Bay");
    expect(vm.visited).toHaveLength(5);                                       // 3 completed items + bitewing + amalgam claims
  });
});

describe("fog, closed channels and the index fallback", () => {
  it("an unresolved estimate with no lines fogs every island and puts the missing inputs on START", () => {
    const est: SavedEstimate = { ...alexEstimate, status: "unresolved", user_estimated_payment_cents: null, insurer_estimated_payment_cents: null, ledger: { ...alexEstimate.ledger, status: "unresolved", lines: [] },
      missing_inputs: [{ input: "remaining deductible", how: "Enter it." }, { input: "remaining annual maximum", how: "Enter it." }] };
    const vm = buildPassage({ ...alex, estimate: est });
    expect(vm.status).toBe("unresolved");
    expect(vm.islands.every((i) => i.state === "unresolved")).toBe(true);
    expect(vm.start.missing).toHaveLength(2);
    expect(vm.start.notices[0]).toBe("We need more info");
    expect(vm.destination.youPay).toBeNull();
    expect(vm.islands[0].soundingsAfter).toBeNull();
  });
  it("a not-covered line is two checkpoints: fee and the closed one, with the engine's label verbatim", () => {
    const line0 = alexEstimate.ledger.lines[0];
    const nc: LedgerLine = { ...line0, status: "not_covered", steps: [{ label: "Not covered: frequency limit (2 of 2 used this benefit year)", cents: 115000, owner: "patient", rule: "F", stitch: "ML26#p25" }], patient_cents: 115000, plan_cents: 0 };
    const est: SavedEstimate = { ...alexEstimate, ledger: { ...alexEstimate.ledger, lines: [nc, alexEstimate.ledger.lines[1]] } };
    const vm = buildPassage({ ...alex, estimate: est });
    const isl = vm.islands[0];
    expect(isl.state).toBe("not_covered");
    expect(isl.place).toBe("Narrow Strait, closed channel");
    expect(isl.checkpoints.map((c) => c.rule)).toEqual(["fee", "F"]);
    expect(isl.checkpoints[1].term).toBe("Frequency limit");
    expect(isl.checkpoints[1].explanation).toBe("Not covered: frequency limit (2 of 2 used this benefit year)");
    expect(islandAmountText(isl)).toBe("insurance won't pay · $1,150.00");
  });
  it("falls back to the index only when the engine's label matches; otherwise the island is fogged with a notice", () => {
    const lines = alexEstimate.ledger.lines.map((l) => ({ ...l, treatment_item_id: undefined }));
    const item = alex.items.find((i) => i.seed_id === "ti-a-rct-19")!;
    expect(matchLine(lines, item, 0, alex.procedures)).toMatchObject({ lineIndex: 0 });
    expect(matchLine(lines, item, 1, alex.procedures)).toEqual({ mismatch: true });
    const est: SavedEstimate = { ...alexEstimate, ledger: { ...alexEstimate.ledger, lines: [lines[1], lines[0]] } };
    const vm = buildPassage({ ...alex, estimate: est });
    expect(vm.islands[0].state).toBe("unresolved");
    expect(vm.islands[0].notices[0]).toMatch(/couldn.t match/);
    expect(vm.islands[0].youPay).toBeNull();
  });
  it("the pending state (items, no estimate) draws outline islands without checkpoints", () => {
    const vm = buildPassage({ ...alex, estimate: null });
    expect(vm.status).toBe("pending");
    expect(vm.islands.every((i) => i.state === "pending" && i.checkpoints.length === 0)).toBe(true);
    const empty = buildPassage({ ...alex, estimate: null, items: [] });
    expect(empty.status).toBe("empty");
  });
});

describe("smoothRoute — the phone route through measured stops (mobile-only app)", () => {
  const pt = (id: string, x: number, y: number, closed = false) => ({ id, x, y, closed });
  it("draws one leg per pair of stops, straight along a run of markers and a vertical-tangent curve to a shore", () => {
    const legs = smoothRoute([pt("start", 120, 40), pt("isl:in", 200, 160), pt("isl:out", 200, 320), pt("isl:fee", 28, 380), pt("isl:N", 28, 440)]);
    expect(legs.map((l) => `${l.from}>${l.to}`)).toEqual(["start>isl:in", "isl:in>isl:out", "isl:out>isl:fee", "isl:fee>isl:N"]);
    expect(legs[1].d).toBe("M 200.0 160.0 L 200.0 320.0");
    expect(legs[3].d).toBe("M 28.0 380.0 L 28.0 440.0");
    // vertical tangents: the first control point shares the start's x, the second shares the end's x (no overshoot past the column)
    expect(legs[0].d).toBe("M 120.0 40.0 C 120.0 100.0, 200.0 100.0, 200.0 160.0");
  });
  it("marks the channel leaving a not-covered island closed, and only that channel", () => {
    const legs = smoothRoute([pt("isl:in", 200, 100), pt("isl:out", 200, 300, true), pt("isl:F", 28, 360, true), pt("destination", 180, 600)]);
    expect(legs.map((l) => l.closed)).toEqual([false, true, true]);
  });
  it("needs two stops to draw anything", () => {
    expect(smoothRoute([])).toEqual([]);
    expect(smoothRoute([pt("start", 0, 0)])).toEqual([]);
  });
});

describe("plan code on the START pennant (finding demo-14)", () => {
  it("shows an uploaded plan's version label, never the internal upload ref", () => {
    const plan = { ...(alex.plan as PlanFixture), plan_code: "UP1", source_document: { ...(alex.plan as PlanFixture).source_document, version_label: "UP1", document_type: "uploaded_plan_document" } };
    const vm = buildPassage({ ...alex, plan, planRef: "upload:c5fd44ebabc8d1e2" });
    expect(vm.start.subtitle).toMatch(/^UP1 · /);
    expect(vm.start.subtitle).not.toContain("upload:");
    expect(planDisplayCode("upload:c5fd44ebabc8d1e2", null)).toBe("your plan papers");
    expect(planDisplayCode("ML26", alex.plan)).toBe("ML26");
  });
});

describe("visited chip names (findings layout-18, demo-9)", () => {
  it("drop the parenthetical and the clause after a comma so the chip shows whole words, never an ellipsis", () => {
    expect(chipTitle("Adult cleaning (prophylaxis)")).toBe("Adult cleaning");
    expect(chipTitle("Bitewing x-rays (set)")).toBe("Bitewing x-rays");
    expect(chipTitle("Resin composite filling, two surfaces, posterior tooth")).toBe("Resin composite filling");
    expect(chipTitle("Periodic oral evaluation")).toBe("Periodic oral evaluation");
  });
});

describe("one checkpoint evidence rule for the map and the pipeline (finding web-correctness-25)", () => {
  it("gives every checkpoint of a line the same badge and clause in both builders", () => {
    const vm = buildPassage(alex);
    for (const isl of vm.islands) {
      const row = alex.rules.find((r) => r.procedure_key === isl.item!.procedure_key);
      const pipe = checkpointsForLine(isl.line!, isl.item, row, alex.plan!, alex.stitches, [], alex.benefits);
      expect(pipe.map((c) => [c.rule, c.badge, c.stitch?.id ?? null])).toEqual(isl.checkpoints.map((c) => [c.rule, c.badge, c.stitch?.id ?? null]));
    }
  });
});

describe("what if (finding demo-5)", () => {
  it("the Answers log says when the estimate uses a hypothetical the person entered", () => {
    const vm = buildPassage(alex);
    const est = { ...alexEstimate, inputs: { ...alexEstimate.inputs, hypotheticals: { network: "out" } } };
    expect(answersLog(vm, alex.journey, alex.plan, est).find((r) => r.key === "cost")?.dd).toBe("$902.00 · insurance $1,098.00 (with a guess you typed)");
    expect(answersLog(vm, alex.journey, alex.plan, alexEstimate).find((r) => r.key === "cost")?.dd).toBe("$902.00 · insurance $1,098.00");
  });
});
