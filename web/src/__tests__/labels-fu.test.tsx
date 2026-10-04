import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// NumberFlow registers a custom element at import time; static markup needs only its props.
vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { ComparisonGrid, type GridPlan } from "@/components/ComparisonGrid";
import { LandmarkContent } from "@/components/LandmarkContent";
import { BADGE_LABEL, DRAWER } from "@/lib/copy";
import type { ComparisonResponse, PlanFixture, PlanSummary } from "@/lib/types";

const model = (code: string, title: string) => ({ plan_code: code, title, is_fictional: false, source_document: { version_label: code, document_type: "plan_document" }, classes: [] }) as unknown as PlanFixture;

describe("compare plan cards: engine totals are calculated, not 'From the plan document'", () => {
  const plans: Record<string, GridPlan> = { ML26: { model: model("ML26", "MetLife NCFlex"), ref: "ML26" }, DD26: { model: model("DD26", "Delta Dental PPO"), ref: "DD26" } };
  const ledger = (total: number, assumptions: string[]) => ({ status: "estimate", lines: [], patient_total_cents: total, plan_total_cents: 109800, plan_total_is_upper_bound: false, flags: [], not_provided: [], assumptions, order_note: "", could_change: "" });
  const data = (assumptions: string[]) => ({
    id: "c1", plan_refs: ["ML26", "DD26"], footer: "", banner: "",
    result: { columns: ["ML26", "DD26"], note: "", grid: [], ledgers: { ML26: ledger(90200, assumptions), DD26: ledger(80000, assumptions) } },
  }) as unknown as ComparisonResponse;
  const est = (html: string) => [...html.matchAll(/<div class="cmp-est">([\s\S]*?)<\/div>/g)].map((m) => m[1]).join("\n");

  it("labels both totals 'Calculated from the clauses cited' and never with the DOC badge", () => {
    const html = est(renderToStaticMarkup(<ComparisonGrid data={data([])} plans={plans} />));
    expect(html).toContain("$902.00");
    expect(html).toContain("$1098.00");   // the mock prints toFixed digits
    expect(html).toContain(DRAWER.calculatedCited);
    expect(html).not.toContain(BADGE_LABEL.DOC);
    // the visible caption appears once per card (on the you-pay total); the plan-payment line carries it for screen readers only
    expect(html.match(/class="fig-calc"/g)).toHaveLength(2);
  });

  it("keeps the 'Hypothetical you entered' badge when a total rests on assumptions (no seventh evidence status)", () => {
    const html = est(renderToStaticMarkup(<ComparisonGrid data={data(["you entered a hypothetical fee"])} plans={plans} />));
    expect(html).toContain(BADGE_LABEL.ASSUMED);
    expect(html).not.toContain(BADGE_LABEL.DOC);
  });
});

describe("My plan 'Your plan' landmark: plan name and option are one text run", () => {
  it("renders 'NCFlex Dental Plan (State of North Carolina), Classic Option' in a single <strong>", () => {
    const plan: PlanFixture = JSON.parse(readFileSync(join(__dirname, "../../../fixtures/plans/ml26.json"), "utf8"));
    const summary = { title: "NCFlex Dental Plan", plan_name: "NCFlex Dental Plan (State of North Carolina)", option: "Classic Option", insurer: "MetLife" } as unknown as PlanSummary;
    const html = renderToStaticMarkup(
      <LandmarkContent landmark="harbor" plan={plan} summary={summary} benefits={null} rules={[]} estimate={null} stitches={[]} selected={undefined} onSelect={() => {}} onOpenDocuments={() => {}} onBenefitsSaved={() => {}} planRef="ML26" />,
    );
    expect(html).toContain("<strong>NCFlex Dental Plan (State of North Carolina), Classic Option</strong>");
    expect(html).not.toMatch(/<\/strong><span>, Classic Option/);
  });
});
