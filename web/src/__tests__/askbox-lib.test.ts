import { describe, expect, it } from "vitest";
import alexJson from "../__fixtures__/passage/alex.json";
import { ASSIST } from "@/lib/copy/assistant";
import { askBoxScope, boxSuggestions, clientGuard, EMPTY_DATA, isSimpleBlock, plainText, resolveRef, splitAnswer, type AssistBlockX, type AssistData } from "@/lib/assistant";
import type { SavedEstimate, TreatmentItem } from "@/lib/types";

const alex = alexJson as unknown as { estimate: SavedEstimate; items: TreatmentItem[] };
const data: AssistData = { ...EMPTY_DATA, estimate: alex.estimate, items: alex.items };

describe("splitAnswer: simple terms first (the plain-words lead, then the details)", () => {
  const blocks: AssistBlockX[] = [
    { type: "sentence", kind: "simple", text: "You pay {{ref:0}}.", refs: [{ kind: "field", path: "estimate.ledger.patient_total_cents" }] },
    { type: "sentence", text: "The crown line: {{ref:0}}.", refs: [{ kind: "line_total", line_index: 1, which: "patient" }] },
    { type: "template", key: "advice_question", text: "Information, not a choice." },
  ];
  it("puts every block marked simple in the lead and keeps the rest, in order, for the details", () => {
    const { simple, details } = splitAnswer(blocks);
    expect(simple).toEqual([{ text: "You pay {{ref:0}}.", refs: [{ kind: "field", path: "estimate.ledger.patient_total_cents" }] }]);
    expect(details.map((b) => b.type)).toEqual(["sentence", "template"]);
  });
  it("reads a `type: \"simple\"` block and a simple template block the same way", () => {
    const { simple } = splitAnswer([{ type: "simple", text: "Plain." }, { type: "template", key: "out_of_scope", kind: "simple", text: "This is a question for your dentist." }]);
    expect(simple.map((s) => s.text)).toEqual(["Plain.", "This is a question for your dentist."]);
    expect(isSimpleBlock({ type: "simple", text: "x" })).toBe(true);
  });
  it("an answer without a simple block has no lead (the card renders its blocks directly, as before)", () => {
    expect(splitAnswer(blocks.slice(1)).simple).toEqual([]);
  });
  it("the client guard drops a simple block that states its own amount", () => {
    const g = clientGuard([{ type: "sentence", kind: "simple", text: "You pay $902.00 in total.", refs: [] }, { type: "simple", text: "It costs 902 dollars." }, blocks[1]]);
    expect(g.dropped).toBe(2);
    expect(g.blocks).toHaveLength(1);
  });
});

describe("boxSuggestions: four everyday chips per tab", () => {
  it("My journey names the journey's own procedures, the larger you-pay figure first", () => {
    const chips = boxSuggestions("journey", data);
    expect(chips).toHaveLength(4);
    expect(chips).toEqual(["What will I pay in total?", "Why does the crown cost more than the root canal?", "What is a deductible?", "How much of my yearly maximum is left?"]);
  });
  it("one planned procedure asks what it costs; none falls back to a definition", () => {
    const one = { ...alex.estimate, ledger: { ...alex.estimate.ledger, lines: alex.estimate.ledger.lines.slice(0, 1) } } as SavedEstimate;
    expect(boxSuggestions("journey", { estimate: one, items: alex.items })[1]).toBe("What do I pay for the root canal?");
    expect(boxSuggestions("journey", { estimate: null, items: [] })[1]).toBe(ASSIST.chipFallback);
  });
  it("an unresolved line is not compared (no figure, no claim that it costs more)", () => {
    const lines = alex.estimate.ledger.lines.map((l, i) => (i === 1 ? { ...l, patient_cents: null } : l));
    expect(boxSuggestions("journey", { estimate: { ...alex.estimate, ledger: { ...alex.estimate.ledger, lines } } as SavedEstimate, items: alex.items })[1]).toBe("What do I pay for the root canal?");
  });
  it("the other tabs use their own fixed chips", () => {
    for (const tab of ["plan", "compare", "documents"] as const) {
      expect(boxSuggestions(tab, data)).toEqual(ASSIST.boxChips[tab]);
      expect(ASSIST.boxChips[tab]).toHaveLength(4);
    }
    expect(boxSuggestions("plan", data)).toEqual(["What is a deductible?", "What does plan share mean?", "What is an annual maximum?", "What is a waiting period?"]);
  });
});

describe("askBoxScope: the journey-level scope (no line)", () => {
  it("sends the plan, the estimate of that plan and the journey", () => {
    expect(askBoxScope("ML26", { id: "e1", plan_code: "ML26" }, "j1")).toEqual({ plan_ref: "ML26", estimate_id: "e1", journey_id: "j1" });
  });
  it("leaves out an estimate that belongs to another plan (the API locks estimates to their plan)", () => {
    expect(askBoxScope("HB26", { id: "e1", plan_code: "ML26" }, null)).toEqual({ plan_ref: "HB26" });
    expect(askBoxScope("ml26", { id: "e1", plan_code: "ML26" })).toEqual({ plan_ref: "ml26", estimate_id: "e1" });
  });
  it("waits while no plan is selected", () => { expect(askBoxScope("", null)).toBeNull(); });
});

describe("journey totals resolve from the engine, labelled calculated", () => {
  it("patient and plan totals come from the ledger with calc", () => {
    const you = resolveRef({ kind: "field", path: "estimate.ledger.patient_total_cents" }, data);
    const planPays = resolveRef({ kind: "field", path: "estimate.ledger.plan_total_cents" }, data);
    expect(you).toMatchObject({ kind: "money", cents: 90200, calc: true, evidence: "DOC" });
    expect(planPays).toMatchObject({ kind: "money", cents: 109800, calc: true });
  });
  it("a missing estimate is UNKNOWN, never $0.00", () => {
    expect(resolveRef({ kind: "field", path: "estimate.ledger.patient_total_cents" }, EMPTY_DATA)).toMatchObject({ cents: null, evidence: "UNKNOWN", calc: false });
  });
  it("line figures by path", () => {
    expect(resolveRef({ kind: "field", path: "estimate.ledger.lines[1].patient_cents" }, data)).toMatchObject({ kind: "money", cents: 51000 });
  });
  it("plainText gives the screen reader the figure with its evidence words", () => {
    const t = plainText({ text: "You pay {{ref:0}} and the plan pays {{ref:1}}.", refs: [{ kind: "field", path: "estimate.ledger.patient_total_cents" }, { kind: "field", path: "estimate.ledger.plan_total_cents" }] }, data);
    expect(t).toBe("You pay $902.00 (calculated from the clauses cited) and the plan pays $1,098.00 (calculated from the clauses cited).");
  });
});
