import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { BenefitStatementForm } from "@/components/records/BenefitStatementForm";
import { TreatmentPlanImporter } from "@/components/plan/TreatmentPlanImporter";
import type { PlanFixture, Procedure } from "@/lib/types";

const ml26: PlanFixture = JSON.parse(readFileSync(join(__dirname, "../../../fixtures/plans/ml26.json"), "utf8"));
const procedures = [{ key: "crown_porcelain", name: "Crown, porcelain or ceramic", category_hint: "major", tooth_or_area_relevant: true }] as unknown as Procedure[];

/** a11y-26: no note or error inside a <label> (it would join the field's name); labels point at their control; one alert region. */
function checkForm(html: string) {
  const labels = html.match(/<label[^>]*>.*?<\/label>/g) ?? [];
  for (const l of labels) expect(l, l).not.toMatch(/<small|role="alert"/);
  for (const [, id] of html.matchAll(/<label for="([^"]+)"/g)) expect(html).toContain(`id="${id}"`);
  expect(html.match(/role="alert"/g)).toHaveLength(1);
}

describe("form fields and errors", () => {
  it("BenefitStatementForm", () => {
    const html = renderToStaticMarkup(<BenefitStatementForm planRef="ML26" plan={ml26} benefits={null} onSaved={() => undefined} />);
    checkForm(html);
    expect(html).toMatch(/<label for="[^"]+">Statement \(label, required\)<\/label>/);
  });
  it("TreatmentPlanImporter (manual form)", () => {
    const html = renderToStaticMarkup(<TreatmentPlanImporter procedures={procedures} onAdded={() => undefined} />);
    const form = html.slice(html.indexOf('<form class="tpi-form'));
    checkForm(form);
    expect(form).toMatch(/<label for="[^"]+">Dentist&#x27;s fee \(dollars\)<\/label>/);
  });
});

import { benefitsRecordKey } from "@/components/records/BenefitStatementForm";
import type { Benefits } from "@/lib/types";

describe("benefit statement form reset key (web-correctness-27)", () => {
  const saved = { plan_code: "ML26", deductible_met_cents: 2500, benefits_used_cents: 24000, remaining_deductible_cents: 0, remaining_max_cents: 126000, derivation: {}, claims: [],
    coverage_start: "2024-01-01", network_default: "in", source: { label: "MetLife benefit statement dated 2026-09-20", date: "2026-09-20" } } as Benefits;
  it("is the same for a new object with the same stored figures (the save echo, a records reload)", () => {
    expect(benefitsRecordKey({ ...saved, derivation: { remaining_max: "x" }, last_updated: "2026-09-20" })).toBe(benefitsRecordKey(saved));
  });
  it("changes when a figure, the statement or the plan changes", () => {
    expect(benefitsRecordKey({ ...saved, benefits_used_cents: 30000 })).not.toBe(benefitsRecordKey(saved));
    expect(benefitsRecordKey({ ...saved, source: { ...saved.source, date: "2026-10-01" } })).not.toBe(benefitsRecordKey(saved));
    expect(benefitsRecordKey({ ...saved, plan_code: "DD24" })).not.toBe(benefitsRecordKey(saved));
    expect(benefitsRecordKey(null)).toBe("");
  });
});
