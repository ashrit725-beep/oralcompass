import { describe, expect, it } from "vitest";
import type { AssistScope, Benefits, CoverageRule, PlanFixture, SavedEstimate, Stitch, TreatmentItem } from "./types";
import {
  applyScopeChoice, clientGuard, EMPTY_DATA, hasBareMoney, initialSuggestions, lineEvidence, resolveRef, ribbonFor, scopeChoices, splitPlaceholders, stepEvidence,
  suggestionKey, templateLabel, toolLabel, trailingRefs, type AssistData,
} from "./assistant";

const estimate = {
  id: "est-1", plan_code: "ML26", plan_version_sha256: "x", calculated_at: "2026-10-03", status: "estimate",
  inputs: { treatment_item_ids: ["ti-rct", "ti-crown"], benefits_snapshot: { plan_code: "ML26" } as unknown as Benefits, hypotheticals: {}, dos_rule: "x", network: "in", network_status: "USER" },
  ledger: {
    status: "estimate", patient_total_cents: 90200, plan_total_cents: 109800, plan_total_is_upper_bound: false, flags: [], not_provided: ["waiting period"], assumptions: [], order_note: "", could_change: "",
    lines: [
      { label: "Root canal (tooth 19)", status: "estimate", patient_cents: 39200, plan_cents: 58800, plan_is_upper_bound: false, flags: ["waiting period: not found"], benefit_year: 2026, remaining_after: { deductible_cents: 0, annual_max_cents: 67200 },
        steps: [{ label: "Dentist's fee", cents: 98000, owner: "info", rule: "fee", stitch: null }, { label: "Deductible applied", cents: 0, owner: "patient", rule: "D", stitch: "ML26#p25" }, { label: "Plan share 60%", cents: 58800, owner: "plan_pre", rule: "CO", stitch: "ML26#p25" }] },
      { label: "Crown (tooth 19)", status: "unresolved", patient_cents: null, plan_cents: null, plan_is_upper_bound: false, flags: [], benefit_year: 2026, remaining_after: {}, steps: [] },
    ],
  },
  movers: { range: null, movers: [], unresolved_reasons: [] }, insurer_estimated_payment_cents: null, user_estimated_payment_cents: null, plan_payment_is_upper_bound: false,
  assumptions: [], unknowns: [], missing_inputs: [{ input: "allowed amount", how: "from the pre-treatment estimate", line: "Crown (tooth 19)" }], footer: "",
  sources: { plan_document: { version_label: "ML26", title: "t", has_stored_pdf: false, role: "primary" }, evidence_endpoint: "/plans/ML26/evidence" },
} as unknown as SavedEstimate;

const plan = {
  plan_code: "ML26", deductible_individual: { value: 5000, status: "DOC", cite: { page: 25, quote: "q" } }, annual_max: { value: 150000, status: "DOC" }, benefit_year_start_month: { value: 1, status: "DOC" },
} as unknown as PlanFixture;
const planUnlimited = { ...plan, annual_max: { value: null, status: "DOC", unlimited: true } } as unknown as PlanFixture;
const benefits = { plan_code: "ML26", remaining_deductible_cents: 0, remaining_max_cents: 126000, deductible_met_cents: 5000, benefits_used_cents: 24000, derivation: {}, claims: [] } as unknown as Benefits;
const rules: CoverageRule[] = [{ procedure_key: "root_canal", plan_code: "ML26", covered: true, category: "Type II", category_status: "DOC", status: "DOC", plan_pays_pct: 60, you_pay_pct: 40, coverage_cite: { page: 25, quote: "q" }, deductible_applies: true, deductible_cite: { page: 25, quote: "q" } }];
const items: TreatmentItem[] = [
  { id: "ti-rct", procedure_key: "root_canal", quantity: 1, dentist_fee_cents: 98000, allowed_cents: 98000, allowed_status: "USER", status: "planned", source: "typed" },
  { id: "ti-crown", procedure_key: "crown", quantity: 1, dentist_fee_cents: 120000, allowed_cents: null, status: "planned", source: "typed" },
];
const stitches: Stitch[] = [{ id: "ML26#7", doc: "ML26", n: 7, page: 25, quote: "q", topic: "coinsurance", ruleCodes: ["CO", "D"] }];
const data: AssistData = { estimate, plan, benefits, rules, items, stitches };
const scope: AssistScope = { plan_ref: "ML26", estimate_id: "est-1", line_index: 0, step_key: "deductible" };

describe("placeholders and the amount guard (mirrors api/app/assistant.py)", () => {
  it("rejects a digit adjacent to $ or % or the words dollars/percent, outside placeholders", () => {
    for (const bad of ["It costs $5.", "Costs $ 12 today", "Pays 60% of it", "Pays 60 % of it", "About 5 dollars", "Pays 60 percent", "dollars 5"]) expect(hasBareMoney(bad)).toBe(true);
    for (const ok of ["This line applied {{ref:0}} to your deductible.", "The plan's share is {{ref:0}} of the amount.", "Page 25 of the certificate.", "No amount here."]) expect(hasBareMoney(ok)).toBe(false);
    // info-only-2: the widened mirror of the server check
    for (const bad of ["The annual maximum is 1,500 {{ref:0}}.", "The plan pays fifty percent of {{ref:0}}.", "You pay USD 392 {{ref:0}}.", "You owe 392.00 {{ref:0}}.", "You owe 392 {{ref:0}}."]) expect(hasBareMoney(bad)).toBe(true);
    expect(hasBareMoney("Tooth 19, statement dated 2026-09-20: your share is {{ref:0}}.")).toBe(false);
  });
  it("splits a sentence into text and ref segments and lists the refs that were not inlined", () => {
    const refs = [{ kind: "step" as const, line_index: 0, step_index: 1, label: "Deductible applied" }, { kind: "clause" as const, stitch: "ML26#p25", rule: "D" }];
    const segs = splitPlaceholders("This line applied {{ref:0}} to your deductible.", refs);
    expect(segs).toEqual([{ type: "text", text: "This line applied " }, { type: "ref", index: 0, ref: refs[0] }, { type: "text", text: " to your deductible." }]);
    expect(trailingRefs("This line applied {{ref:0}} to your deductible.", refs)).toEqual([refs[1]]);
    expect(splitPlaceholders("{{ref:3}}", refs)).toEqual([{ type: "ref", index: 3, ref: null }]);
  });
  it("drops sentences with bare amounts on the client and counts them", () => {
    const { blocks, dropped } = clientGuard([{ type: "sentence", text: "Pays $5.", refs: [] }, { type: "sentence", text: "Pays {{ref:0}}.", refs: [] }, { type: "template", key: "out_of_scope", text: "t" }]);
    expect(dropped).toBe(1);
    expect(blocks.map((b) => b.type)).toEqual(["sentence", "template"]);
  });
});

describe("ref resolution against the payloads (every Ref kind)", () => {
  it("step → the engine step's cents with the stitch-derived evidence", () => {
    expect(resolveRef({ kind: "step", line_index: 0, step_index: 2, label: "Plan share" }, data, scope)).toEqual({ kind: "money", cents: 58800, evidence: "DOC", label: "Step: Plan share 60%" });
    expect(resolveRef({ kind: "step", line_index: 0, step_index: 0, label: "Dentist's fee" }, data, scope)).toMatchObject({ kind: "money", cents: 98000, evidence: "USER" });
    expect(resolveRef({ kind: "step", line_index: 5, step_index: 0, label: "missing" }, data, scope)).toMatchObject({ kind: "money", cents: null, evidence: "UNKNOWN" });
  });
  it("line_total → patient / plan cents; unresolved lines are UNKNOWN, never 0", () => {
    expect(resolveRef({ kind: "line_total", line_index: 0, which: "patient" }, data)).toMatchObject({ kind: "money", cents: 39200, evidence: "DOC" });
    expect(resolveRef({ kind: "line_total", line_index: 0, which: "plan" }, data)).toMatchObject({ kind: "money", cents: 58800 });
    expect(resolveRef({ kind: "line_total", line_index: 1, which: "patient" }, data)).toMatchObject({ kind: "money", cents: null, evidence: "UNKNOWN" });
  });
  it("field → plan, benefits, rules, treatment item, remaining_after and non-amount paths", () => {
    expect(resolveRef({ kind: "field", path: "plan.deductible_individual" }, data)).toMatchObject({ kind: "money", cents: 5000, evidence: "DOC" });
    expect(resolveRef({ kind: "field", path: "plan.annual_max" }, data)).toMatchObject({ kind: "money", cents: 150000, evidence: "DOC" });
    expect(resolveRef({ kind: "field", path: "plan.annual_max" }, { ...data, plan: planUnlimited })).toMatchObject({ kind: "text", text: "no annual maximum stated" });
    expect(resolveRef({ kind: "field", path: "plan.annual_max_unlimited" }, data)).toMatchObject({ kind: "text", text: "no" });
    expect(resolveRef({ kind: "field", path: "plan.benefit_year_start_month" }, data)).toMatchObject({ kind: "text", text: "January" });
    expect(resolveRef({ kind: "field", path: "benefits.remaining_max_cents" }, data)).toMatchObject({ kind: "money", cents: 126000, evidence: "USER" });
    expect(resolveRef({ kind: "field", path: "benefits.remaining_deductible_cents" }, data)).toMatchObject({ kind: "money", cents: 0, evidence: "USER" });
    expect(resolveRef({ kind: "field", path: "benefits.remaining_deductible_cents" }, { ...data, benefits: null })).toMatchObject({ kind: "money", cents: null, evidence: "UNKNOWN" });
    expect(resolveRef({ kind: "field", path: "rules.plan_pays_pct" }, data, scope)).toMatchObject({ kind: "percent", pct: 60, evidence: "DOC" });
    expect(resolveRef({ kind: "field", path: "rules.category" }, data, scope)).toMatchObject({ kind: "text", text: "Type II", evidence: "DOC" });
    expect(resolveRef({ kind: "field", path: "rules.deductible_applies" }, data, scope)).toMatchObject({ kind: "text", text: "yes" });
    expect(resolveRef({ kind: "field", path: "treatment_item.dentist_fee_cents" }, data, scope)).toMatchObject({ kind: "money", cents: 98000, evidence: "USER" });
    expect(resolveRef({ kind: "field", path: "treatment_item.allowed_cents" }, data, { ...scope, line_index: 1 })).toMatchObject({ kind: "money", cents: null, evidence: "UNKNOWN" });
    expect(resolveRef({ kind: "field", path: "estimate.ledger.lines[0].remaining_after.annual_max_cents" }, data)).toMatchObject({ kind: "money", cents: 67200, evidence: "USER", label: "Annual maximum left after line 1" });
    expect(resolveRef({ kind: "field", path: "estimate.ledger.lines[0].flags" }, data)).toMatchObject({ kind: "text", text: "waiting period: not found" });
    expect(resolveRef({ kind: "field", path: "estimate.missing_inputs" }, data)).toMatchObject({ kind: "text", text: "allowed amount" });
    expect(resolveRef({ kind: "field", path: "estimate.ledger.not_provided" }, data)).toMatchObject({ kind: "text", text: "waiting period" });
    expect(resolveRef({ kind: "field", path: "estimate.inputs.hypotheticals" }, data)).toMatchObject({ kind: "text", text: "none", evidence: "USER" });
    expect(resolveRef({ kind: "field", path: "something.unknown" }, data)).toMatchObject({ kind: "text", text: "figure not loaded", evidence: "UNKNOWN" });
    expect(resolveRef({ kind: "field", path: "plan.deductible_individual" }, EMPTY_DATA)).toMatchObject({ kind: "money", cents: null, evidence: "UNKNOWN" });
  });
  it("clause → the stitch on that page with that rule, or none when the evidence list lacks it", () => {
    const r = resolveRef({ kind: "clause", stitch: "ML26#p25", rule: "D" }, data);
    expect(r.kind).toBe("clause");
    if (r.kind === "clause") { expect(r.stitch?.id).toBe("ML26#7"); expect(r.label).toBe("Clause ML26#p25"); }
    const none = resolveRef({ kind: "clause", stitch: "ML26#p99" }, data);
    if (none.kind === "clause") expect(none.stitch).toBeUndefined();
  });
  it("step and line evidence rules", () => {
    expect(stepEvidence({ label: "", cents: 1, owner: "plan", rule: "CO", stitch: "ML26#p25" })).toBe("DOC");
    expect(stepEvidence({ label: "", cents: 1, owner: "info", rule: "fee", stitch: null })).toBe("USER");
    expect(stepEvidence(undefined)).toBe("UNKNOWN");
    expect(lineEvidence(estimate.ledger.lines[1])).toBe("UNKNOWN");
  });
});

describe("scope, suggestions, ribbons, tools", () => {
  it("picks the suggestion list from the step key (mirrors assistant_templates.RULE_FROM_STEP_KEY)", () => {
    expect(suggestionKey({ plan_ref: "ML26", step_key: "deductible" })).toBe("D");
    expect(suggestionKey({ plan_ref: "ML26", checkpoint_key: "CO" })).toBe("CO");
    expect(suggestionKey({ plan_ref: "ML26", stitch: "ML26#p25" })).toBe("clause");
    expect(suggestionKey({ plan_ref: "ML26" })).toBe("default");
    expect(initialSuggestions({ plan_ref: "ML26", step_key: "max" })[0]).toBe("Does this line stay within the remaining annual maximum?");
  });
  it("offers scope choices and applies them without losing the plan ref or estimate id", () => {
    expect(scopeChoices(scope).map((c) => c.value)).toEqual(["step", "procedure", "plan"]);
    expect(scopeChoices({ plan_ref: "ML26", stitch: "ML26#p25" }).map((c) => c.value)).toEqual(["clause", "plan"]);
    expect(applyScopeChoice(scope, "procedure")).toEqual({ plan_ref: "ML26", estimate_id: "est-1", line_index: 0 });
    expect(applyScopeChoice(scope, "plan")).toEqual({ plan_ref: "ML26", estimate_id: "est-1" });
    expect(applyScopeChoice(scope, "step")).toEqual(scope);
  });
  it("labels the answer card from the server ribbon, the intent and the server mode", () => {
    const demo = "Demo mode: template answers assembled from the engine's fields, not a live model.";
    expect(ribbonFor({ mode: "demo", ribbon: demo, intent: "explain_step" }, "demo")).toEqual({ text: demo, tone: "demo" });
    expect(ribbonFor({ mode: "demo", ribbon: demo, intent: "advice_request" }, "live")).toMatchObject({ tone: "template" });
    expect(ribbonFor({ mode: "live", ribbon: null, intent: "explain_step", model: "anthropic/claude-haiku-4.5" }, "live")).toMatchObject({ tone: "live" });
    expect(ribbonFor({ mode: "demo", ribbon: "The model did not answer in time; a template answer is shown.", intent: "explain_step" }, "live")).toMatchObject({ tone: "fallback" });
    expect(ribbonFor({ mode: "live", ribbon: null, intent: "advice_request", model: "m" }, "live")).toMatchObject({ tone: "template" });
  });
  it("turns tool ids into words (ids only, never amounts)", () => {
    expect(toolLabel("get_clause(ML26#p25)")).toBe("clause ML26#p25");
    expect(toolLabel("get_estimate_line(line 0)")).toBe("ledger line 0");
    expect(toolLabel("get_benefits(ML26)")).toBe("benefits of ML26");
    expect(toolLabel("resolve_procedure")).toBe("procedure names");
    expect(templateLabel({ type: "template", key: "advice_question", text: "" })).toBe("Information, not a choice");
    expect(templateLabel({ type: "template", key: "out_of_scope", text: "" })).toBe("Outside this assistant's scope");
  });
});
