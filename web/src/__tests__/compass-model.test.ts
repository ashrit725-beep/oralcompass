import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compassModel, headlineFor, ledgerEvidence, remainingAfterPlanned, restrictionsFor, sectionLabel } from "@/lib/compass-model";
import type { Benefits, PlanFixture, SavedEstimate } from "@/lib/types";

const ml26: PlanFixture = JSON.parse(readFileSync(join(__dirname, "../../../fixtures/plans/ml26.json"), "utf8"));
const fm26h: PlanFixture = JSON.parse(readFileSync(join(__dirname, "../../../fixtures/plans/fm26h.json"), "utf8"));

/** Alex's derived benefits (CLAUDE.md rule 8; api/app/records.py derived_benefits): $25 deductible met, $240 paid, $1,260 left. */
const alexBenefits: Benefits = {
  plan_code: "ML26", coverage_start: "2024-01-01", deductible_met_cents: 2500, benefits_used_cents: 24000, remaining_deductible_cents: 0, remaining_max_cents: 126000,
  annual_max_unlimited: false, claims: [],
  derivation: { remaining_deductible: "plan deductible $25.00 (document) − met $25.00 (statement) = $0.00", remaining_max: "annual maximum $1,500.00 (document) − plan paid $240.00 (statement) = $1,260.00" },
  source: { type: "benefit_statement", label: "MetLife benefit statement dated 2026-09-20", date: "2026-09-20" },
};

/** The engine's soundings for Alex: root canal then crown, annual maximum draining $1,260 → $672 → $162. */
const alexEstimate = {
  id: "e1", status: "estimate", assumptions: [],
  ledger: { status: "estimate", lines: [
    { label: "Root canal therapy, molar (tooth 19)", status: "estimate", steps: [], patient_cents: 39200, plan_cents: 58800, plan_is_upper_bound: false, flags: [], remaining_after: { deductible_cents: 0, annual_max_cents: 67200 }, benefit_year: 2026 },
    { label: "Crown, porcelain or ceramic (tooth 19)", status: "estimate", steps: [], patient_cents: 51000, plan_cents: 51000, plan_is_upper_bound: false, flags: [], remaining_after: { deductible_cents: 0, annual_max_cents: 16200 }, benefit_year: 2026 },
  ], patient_total_cents: 90200, plan_total_cents: 109800, plan_total_is_upper_bound: false, flags: [], not_provided: [], assumptions: [], order_note: "", could_change: "" },
} as unknown as SavedEstimate;

describe("compassModel with Alex on ML26", () => {
  const vm = compassModel(ml26, alexBenefits, alexEstimate);

  it("titles the panel with the question it answers: $1,500.00 maximum, $162.00 after the planned work", () => {
    expect(vm.headline).toEqual({ kind: "after", limitCents: 150000, answerCents: 16200 });
  });

  it("copies the document limit, the statement figures and the derived remaining amounts without recomputing them", () => {
    expect(vm.annualMax.limitCents).toBe(150000);
    expect(vm.annualMax.limitStatus).toBe("DOC");
    expect(vm.annualMax.limitCite?.page).toBe(25);
    expect(vm.annualMax.usedCents).toBe(24000);
    expect(vm.annualMax.remainingCents).toBe(126000);
    expect(vm.annualMax.derivation).toContain("$1,260.00");
    expect(vm.deductible.limitCents).toBe(2500);
    expect(vm.deductible.remainingCents).toBe(0);
    expect(vm.deductible.afterCents).toBe(0);
  });

  it("derives display proportions only (used ÷ limit; after = 1 − after ÷ limit)", () => {
    expect(vm.annualMax.usedFraction).toBeCloseTo(0.16, 5);
    expect(vm.annualMax.afterFraction).toBeCloseTo(1 - 16200 / 150000, 5);
    expect(vm.deductible.usedFraction).toBe(1);
  });

  it("lists the four coverage classes with their in-network share and the restrictions counts from the document", () => {
    expect(vm.coverage.map((c) => c.name)).toEqual(["Type I", "Type II", "Type II (50% row)", "Type III"]);
    expect(vm.coverage[0].pctIn).toBe(100);
    expect(vm.restrictions.frequency).toBe(6);
    expect(vm.restrictions.exclusions).toBe(1);
    expect(vm.restrictions.waiting.kind).toBe("not_stated");
    expect(vm.restrictions.alternate).toBe("not_stated");
    expect(vm.restrictions.unsupported).toBe(8);
  });
});

describe("headlineFor keeps unknowns honest", () => {
  it("never answers with 0 when nothing is entered: no_usage", () => {
    const vm = compassModel(ml26, null, null);
    expect(vm.headline).toEqual({ kind: "no_usage", limitCents: 150000 });
    expect(vm.annualMax.usedFraction).toBeNull();
    expect(vm.annualMax.remainingCents).toBeNull();
  });
  it("reads the remaining amount when a statement exists but no estimate", () => {
    expect(compassModel(ml26, alexBenefits, null).headline).toEqual({ kind: "remaining", limitCents: 150000, answerCents: 126000 });
  });
  it("says waiting for information when the estimate is unresolved", () => {
    const unresolved = { ...alexEstimate, status: "unresolved", ledger: { ...alexEstimate.ledger, status: "unresolved", lines: [] } } as unknown as SavedEstimate;
    expect(compassModel(ml26, alexBenefits, unresolved).headline).toEqual({ kind: "unresolved", limitCents: 150000 });
    expect(compassModel(ml26, alexBenefits, unresolved).annualMax.afterWaiting).toBe(true);
  });
  it("names an unlimited maximum (FM26H High Option) and an unknown one", () => {
    expect(compassModel(fm26h, null, null).headline).toEqual({ kind: "unlimited" });
    expect(headlineFor({ limitCents: null, unlimited: false, afterCents: null, afterWaiting: false, remainingCents: null } as never)).toEqual({ kind: "unknown" });
  });
});

describe("helpers", () => {
  it("reads remaining_after from the last line that carries it", () => {
    expect(remainingAfterPlanned(alexEstimate.ledger, "annual_max_cents")).toBe(16200);
    expect(remainingAfterPlanned({ ...alexEstimate.ledger, lines: [] }, "annual_max_cents")).toBeNull();
  });
  it("counts a waiting clause with months (SM26-style) and ambiguous ones", () => {
    const w = restrictionsFor({ ...ml26, waiting_months: { value: { "Class III": 6 }, status: "DOC" } }).waiting;
    expect(w).toEqual({ kind: "stated", months: 6, what: "Class III" });
    expect(restrictionsFor({ ...ml26, waiting_months: { value: {}, status: "AMBIGUOUS" } }).waiting.kind).toBe("ambiguous");
  });
  it("labels an engine total ASSUMED only when hypotheticals were entered", () => {
    expect(ledgerEvidence({ assumptions: [] })).toBe("DOC");
    expect(ledgerEvidence({ assumptions: ["remaining_max_cents: hypothetical you entered"] })).toBe("ASSUMED");
    expect(ledgerEvidence(null)).toBe("DOC");
  });
});

describe("coverage rows carry the document's row heading (demo-18)", () => {
  const rows = compassModel(ml26, null, null).coverage;
  it("tells the two Type II rows apart with the guide's own wording", () => {
    const two = rows.filter((r) => r.name.startsWith("Type II") && r.name !== "Type III");
    expect(two.map((r) => r.section)).toEqual(["Basic Services (row 1)", "Basic Services (row 2)"]);
    expect(rows.find((r) => r.name === "Type I")?.section).toBe("Diagnostic and Preventive");
  });
  it("adds nothing when the heading repeats the name or is missing", () => {
    expect(sectionLabel("Summary — Type I", "Type I")).toBeNull();
    expect(sectionLabel(undefined, "Type I")).toBeNull();
  });
});
