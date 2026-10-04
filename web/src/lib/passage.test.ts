import { describe, expect, it } from "vitest";
import alexJson from "../__fixtures__/passage/alex.json";
import samJson from "../__fixtures__/passage/sam.json";
import { BINDING_PX, TARGET_PX, VB_W, answerSegment, chipTitle, answersLog, buildPassage, planDisplayCode, checkpointAria, findCollisions, islandAmountText, layoutPassage, matchLine, moneyText, type PassageInputs } from "./passage";
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
const unitPx = BINDING_PX / VB_W;

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
    expect(islandAmountText(ng)).toBe("not covered");
    expect(ng.notices[0]).toMatch(/Mentioned at the consultation/);
  });
  it("START reads the plan_details stage; the Light lists the stages after the route including the last one", () => {
    expect(vm.start.title).toBe("Starting point");
    expect(vm.start.place).toBe("Harbor of Beginnings");
    expect(vm.start.subtitle).toBe("ML26 · in-network");
    expect(vm.start.stageIds).toEqual(["start"]);
    expect(vm.destination.stageIds).toEqual(["followup"]);                    // last linked stage is followup (crown) → nothing after; last stage kept
    expect(vm.destination.subtitle).toBe("Follow-up · Compass Rest");
    expect(vm.destination.youPay).toBe(90200);
  });
  it("answers log never prints $0.00 for a missing estimate and reads the five answers", () => {
    const rows = answersLog(vm, alex.journey, alex.plan, alexEstimate);
    expect(rows.map((r) => r.dt)).toEqual(["Where you are", "On the route", "Estimated you pay", "Rules applied", "From"]);
    expect(rows[0].dd).toBe("Before your visit · 1 of 3 checkpoints completed");
    expect(rows[1].dd).toBe("2 procedures, 4 completed on your statement");
    expect(rows[2].dd).toBe("$902.00 · plan $1,098.00");
    expect(rows[3].dd).toBe("6 steps cited · 2 rules not stated");
    expect(rows[4].dd).toMatch(/^ML26 · 2026 NCFlex Dental/);
    const none = answersLog(buildPassage({ ...alex, estimate: null }), alex.journey, alex.plan, null);
    expect(none[2].dd).toBe("No estimate yet");
    const unresolved: SavedEstimate = { ...alexEstimate, status: "unresolved", user_estimated_payment_cents: null, missing_inputs: [{ input: "remaining deductible", how: "x" }], ledger: { ...alexEstimate.ledger, lines: [] } };
    const u = answersLog(buildPassage({ ...alex, estimate: unresolved }), alex.journey, alex.plan, unresolved);
    expect(u[2].dd).toBe("Waiting for information (1 input)");
    expect(u[2].dd).not.toContain("$0.00");
    expect(answersLog(vm, alex.journey, alex.plan, alexEstimate, true)[2].dd).toBe("Recalculating…");
  });
  it("checkpoint accessible names carry the whole fact", () => {
    const cps = vm.islands[0].checkpoints;
    expect(checkpointAria(cps[1])).toBe("Allowed amount: −$170.00, amount out $980.00, not owed by you, clause ML26 page 25");
    expect(checkpointAria(cps[2])).toBe("Deductible: no change, amount out $980.00, clause ML26 page 25");
    expect(checkpointAria(cps[3])).toBe("Plan share: plan 60% $588.00, you 40% $392.00, clause ML26 page 25");
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
    expect(vm.start.notices[0]).toBe("Waiting for information");
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
    expect(islandAmountText(isl)).toBe("not covered · $1,150.00");
    const layout = layoutPassage(vm, "desktop");
    expect(layout.route.find((s) => s.from === isl.id && s.to !== isl.id)?.closed).toBe(true);
  });
  it("falls back to the index only when the engine's label matches; otherwise the island is fogged with a notice", () => {
    const lines = alexEstimate.ledger.lines.map((l) => ({ ...l, treatment_item_id: undefined }));
    const item = alex.items.find((i) => i.seed_id === "ti-a-rct-19")!;
    expect(matchLine(lines, item, 0, alex.procedures)).toMatchObject({ lineIndex: 0 });
    expect(matchLine(lines, item, 1, alex.procedures)).toEqual({ mismatch: true });
    const est: SavedEstimate = { ...alexEstimate, ledger: { ...alexEstimate.ledger, lines: [lines[1], lines[0]] } };
    const vm = buildPassage({ ...alex, estimate: est });
    expect(vm.islands[0].state).toBe("unresolved");
    expect(vm.islands[0].notices[0]).toMatch(/Could not match/);
    expect(vm.islands[0].youPay).toBeNull();
  });
  it("the pending state (items, no estimate) draws outline islands without checkpoints", () => {
    const vm = buildPassage({ ...alex, estimate: null });
    expect(vm.status).toBe("pending");
    expect(vm.islands.every((i) => i.state === "pending" && i.checkpoints.length === 0)).toBe(true);
    const empty = buildPassage({ ...alex, estimate: null, items: [] });
    expect(empty.status).toBe("empty");
    expect(layoutPassage(empty, "desktop").route).toHaveLength(1);
  });
});

describe("layoutPassage — 44 px targets at the 854 px plate (addendum B1/B2/B3)", () => {
  const hitUnits = (TARGET_PX * VB_W) / BINDING_PX;
  const pxApart = (layout: ReturnType<typeof layoutPassage>) => {
    const cps = layout.islands.flatMap((i) => i.checkpoints);
    let min = Infinity;
    for (let a = 0; a < cps.length; a++) for (let b = a + 1; b < cps.length; b++) min = Math.min(min, Math.hypot(cps[a].x - cps[b].x, cps[a].y - cps[b].y) * unitPx);
    return min;
  };
  it("Alex: no control rectangles intersect; checkpoints are ≥ 44 px apart; nothing is compound or collapsed", () => {
    const layout = layoutPassage(buildPassage(alex), "desktop");
    expect(layout.collisions).toEqual([]);
    expect(layout.dense).toBe(false); expect(layout.collapsed).toBe(false);
    expect(layout.islands.map((i) => i.checkpoints.length)).toEqual([6, 6]);
    expect(pxApart(layout)).toBeGreaterThanOrEqual(TARGET_PX);
    expect(layout.soundings).toHaveLength(2);
    expect(layout.visited).toHaveLength(3); expect(layout.visitedOverflow).toBe(1);
    expect(layout.marginal).toHaveLength(1);
    // every control inside the viewBox
    for (const c of layout.controls) { expect(c.x).toBeGreaterThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(0); expect(c.x + c.w).toBeLessThanOrEqual(VB_W); expect(c.y + c.h).toBeLessThanOrEqual(600); }
    // islands sit inside the backdrop's open water (addendum §C.1)
    for (const i of layout.islands) { expect(i.cx).toBeGreaterThan(180); expect(i.cx).toBeLessThan(830); expect(i.cy - i.arcR).toBeGreaterThan(90); }
  });
  it("soundings never sit on a control or on each other (delight pass mo-06; closes follow-up 7)", () => {
    for (const vm of [buildPassage(alex), buildPassage(sam)]) {
      const l = layoutPassage(vm, "desktop");
      const u = (px: number) => (px * VB_W) / BINDING_PX;
      const rects = l.soundings.map((s) => ({ x: s.x - u(160) / 2, y: s.y - u(60) / 2, w: u(160), h: u(60), id: `s:${s.islandId}` }));
      expect(findCollisions([...l.controls, ...rects]).filter(([a, b]) => a.startsWith("s:") || b.startsWith("s:"))).toEqual([]);
      for (const r of rects) { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(VB_W); }
    }
  });
  it("Sam: the 7-checkpoint crown widens its arc instead of crowding", () => {
    const layout = layoutPassage(buildPassage(sam), "desktop");
    expect(layout.collisions).toEqual([]);
    expect(layout.islands[0].checkpoints).toHaveLength(7);
    expect(layout.islands[0].arcR).toBeGreaterThan(1.35 * layout.islands[0].r);
    expect(pxApart(layout)).toBeGreaterThanOrEqual(TARGET_PX);
  });
  it("eight checkpoints widen to the widest arc; nine (five of them zero-change) collapse into one hollow 'passed' marker that lists them", () => {
    const vm = buildPassage(sam);
    const crown = vm.islands[0];
    const listed = (k: string, change: number): typeof crown.checkpoints[number] => ({ ...crown.checkpoints[5], key: `${crown.id}:${k}`, rule: "L", change, stepIndexes: change ? [9] : [] });
    const eight: PassageVM = { ...vm, islands: [{ ...crown, checkpoints: [...crown.checkpoints.slice(0, 6), listed("L", 1200), crown.checkpoints[6]] }, vm.islands[1]] };
    const l8 = layoutPassage(eight, "desktop");
    expect(l8.collisions).toEqual([]);
    expect(l8.islands[0].checkpoints).toHaveLength(8);
    expect(l8.islands[0].arcR).toBeGreaterThan(1.35 * l8.islands[0].r);
    expect(pxApart(l8)).toBeGreaterThanOrEqual(TARGET_PX);
    const nine: PassageVM = { ...vm, islands: [{ ...crown, checkpoints: [...crown.checkpoints.slice(0, 6), listed("L1", 0), listed("L2", 0), crown.checkpoints[6]] }, vm.islands[1]] };
    const l9 = layoutPassage(nine, "desktop");
    expect(l9.collisions).toEqual([]);
    expect(l9.collapsed).toBe(true);
    const passed = l9.islands[0].checkpoints.find((c) => c.collapsedKeys);
    expect(passed?.collapsedKeys).toEqual([`${crown.id}:D`, `${crown.id}:M`, `${crown.id}:L1`, `${crown.id}:L2`]);
    expect(l9.islands[0].checkpoints).toHaveLength(6);                       // fee, N, AB, passed, CO, total
    expect(l9.islands[0].checkpoints.map((c) => c.key.split(":").pop())).toEqual(["fee", "N", "AB", "passed", "CO", "total"]);
    expect(pxApart(l9)).toBeGreaterThanOrEqual(TARGET_PX);
  });
  it("five islands degrade honestly: compound badges (not controls) except the selected island, still no overlaps", () => {
    const vm = buildPassage(alex);
    const five: PassageVM = { ...vm, islands: Array.from({ length: 5 }, (_, i) => ({ ...vm.islands[i % 2], id: `island:x${i}`, order: i + 1, checkpoints: vm.islands[i % 2].checkpoints.map((c) => ({ ...c, key: c.key.replace(vm.islands[i % 2].id, `island:x${i}`) })) })) };
    const layout = layoutPassage(five, "desktop", { selected: "island:x2" });
    expect(layout.dense).toBe(true);
    expect(layout.collisions).toEqual([]);
    expect(layout.islands[2].compound).toBe(false);
    expect(layout.islands[2].checkpoints).toHaveLength(6);
    expect(layout.islands[0].compound).toBe(true);
    expect(layout.islands[0].checkpoints).toHaveLength(0);
    expect(layout.controls.filter((c) => c.id.startsWith("island:x0"))).toHaveLength(1);    // the island button only
    expect(pxApart(layout)).toBeGreaterThanOrEqual(TARGET_PX);
    const unselected = layoutPassage(five, "desktop");
    expect(unselected.collisions).toEqual([]);
    expect(unselected.islands.every((i) => i.compound)).toBe(true);
    for (const sel of five.islands.map((i) => i.id)) { const l = layoutPassage(five, "desktop", { selected: sel }); expect(l.collisions).toEqual([]); }
  });
  it("three islands stay fully expanded with every control clear; four become dense", () => {
    const vm = buildPassage(alex);
    const make = (k: number): PassageVM => ({ ...vm, islands: Array.from({ length: k }, (_, i) => ({ ...vm.islands[i % 2], id: `island:y${i}`, order: i + 1, checkpoints: vm.islands[i % 2].checkpoints.map((c) => ({ ...c, key: c.key.replace(vm.islands[i % 2].id, `island:y${i}`) })) })) });
    const three = layoutPassage(make(3), "desktop");
    expect(three.dense).toBe(false); expect(three.plain).toBe(false); expect(three.collisions).toEqual([]);
    expect(three.islands.map((i) => i.checkpoints.length)).toEqual([6, 6, 6]);
    expect(pxApart(three)).toBeGreaterThanOrEqual(TARGET_PX);
    expect(layoutPassage(make(4), "desktop").dense).toBe(true);
    const eight = layoutPassage(make(8), "desktop", { selected: "island:y5" });
    expect(eight.collisions).toEqual([]);
    for (const c of eight.controls) { expect(c.y + c.h).toBeLessThanOrEqual(600); expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x + c.w).toBeLessThanOrEqual(VB_W); }
  });
  it("hit rectangles are 44 px squares in viewBox units", () => {
    const layout = layoutPassage(buildPassage(alex), "desktop");
    const cp = layout.controls.find((c) => c.id.endsWith(":CO"))!;
    expect(cp.w).toBeCloseTo(hitUnits, 5);
  });
});

describe("plan code on the START pennant (finding demo-14)", () => {
  it("shows an uploaded plan's version label, never the internal upload ref", () => {
    const plan = { ...(alex.plan as PlanFixture), plan_code: "UP1", source_document: { ...(alex.plan as PlanFixture).source_document, version_label: "UP1", document_type: "uploaded_plan_document" } };
    const vm = buildPassage({ ...alex, plan, planRef: "upload:c5fd44ebabc8d1e2" });
    expect(vm.start.subtitle).toMatch(/^UP1 · /);
    expect(vm.start.subtitle).not.toContain("upload:");
    expect(planDisplayCode("upload:c5fd44ebabc8d1e2", null)).toBe("your uploaded document");
    expect(planDisplayCode("ML26", alex.plan)).toBe("ML26");
  });
});

describe("Answers-log jumps (finding web-correctness-1)", () => {
  it("asks for the segment that shows the target once, and reports no switch when it is already showing", () => {
    // from the Care timeline or the Overview list, island/light/checkpoint rows need the map: one switch, then focus
    for (const t of ["island", "light", "checkpoint"] as const) {
      expect(answerSegment(t, false, "care")).toBe("map");
      expect(answerSegment(t, true, "overview")).toBe("map");
      expect(answerSegment(t, false, "map")).toBe("map");          // already there: focus at once, nothing re-scheduled
    }
    expect(answerSegment("stage", true, "map")).toBe("care");
    expect(answerSegment("stage", false, "care")).toBe("care");
    expect(answerSegment("stage", false, "overview")).toBe("map");
    expect(answerSegment("documents", false, "map")).toBeNull();
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

describe("overflow controls (finding web-correctness-30)", () => {
  it("draws a '+k more mentioned' control for marginal islands past the ones on the chart, clear of every other control", () => {
    const vm = buildPassage(alex);
    const m = vm.marginal[0];
    const five: PassageVM = { ...vm, marginal: Array.from({ length: 5 }, (_, i) => ({ ...m, id: `marginal:m${i}`, order: i + 1 })) };
    const l = layoutPassage(five, "desktop");
    expect(l.marginal).toHaveLength(3);
    expect(l.marginalOverflow).toBe(2);
    expect(l.marginalMore).not.toBeNull();
    expect(l.collisions).toEqual([]);
    expect(l.controls.some((c) => c.id === "marginal:more")).toBe(true);
    expect(layoutPassage(vm, "desktop").marginalMore).toBeNull();          // nothing hidden, no control
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
