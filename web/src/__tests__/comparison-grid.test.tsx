import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// NumberFlow registers a custom element at import time; static markup needs only its props.
vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { ComparisonGrid, type GridPlan } from "@/components/ComparisonGrid";
import type { ComparisonResponse, PlanFixture } from "@/lib/types";

const model = (code: string, title: string) => ({ plan_code: code, title, is_fictional: false, source_document: { version_label: code, document_type: "plan_document" }, classes: [] }) as unknown as PlanFixture;
const plans: Record<string, GridPlan> = { ML26: { model: model("ML26", "MetLife NCFlex"), ref: "ML26" }, DD26: { model: model("DD26", "Delta Dental PPO"), ref: "DD26" } };
const ledger = (total: number, flags: string[]) => ({ status: "estimate", lines: [], patient_total_cents: total, plan_total_cents: 1000, plan_total_is_upper_bound: false, flags, not_provided: [], assumptions: [], order_note: "", could_change: "" });
const data = {
  id: "c1", plan_refs: ["ML26", "DD26"], footer: "", banner: "",
  result: {
    columns: ["ML26", "DD26"], note: "",
    grid: [{ topic: "Annual maximum", differences: "MetLife NCFlex: $1,500.00; Delta Dental PPO: $1,000.00.", cells: [
      { text: "$1,500.00", badge: "DOC", cite: "ML26 p25", quote: "The annual maximum is $1,500." },
      { text: "$1,000.00", badge: "DOC", cite: "DD26 p3" },
    ] }],
    ledgers: { ML26: ledger(90200, ["waiting period: not found", "waiting period: not found"]), DD26: ledger(80000, []) },
  },
} as unknown as ComparisonResponse;

describe("ComparisonGrid cells (a11y-2: label in name)", () => {
  const html = renderToStaticMarkup(<ComparisonGrid data={data} plans={plans} />);
  const cellButtons = [...html.matchAll(/<button[^>]*class="[^"]*cmp-cell[^"]*"[^>]*>/g)].map((m) => m[0]);

  it("renders one trigger per cell, named by its visible content rather than an aria-label", () => {
    expect(cellButtons).toHaveLength(2);
    for (const b of cellButtons) expect(b).not.toMatch(/aria-label=/);
  });

  it("describes each trigger with the topic, plan and action through aria-describedby", () => {
    for (const b of cellButtons) {
      const id = /aria-describedby="([^"]+)"/.exec(b)?.[1];
      expect(id).toBeTruthy();
      expect(html).toMatch(new RegExp(`id="${id}" hidden="">Annual maximum for (MetLife NCFlex|Delta Dental PPO): open the clause`));
    }
    expect(html).toContain("$1,500.00");
  });
});

describe("ComparisonGrid rails (info-only-1: entered for this plan only)", () => {
  it("says per rail whether inputs were entered for that plan, and never implies a carry-over", () => {
    const html = renderToStaticMarkup(<ComparisonGrid data={data} plans={plans} enteredFor={["ML26"]} />);
    expect(html.match(/entered for this plan only/g)).toHaveLength(1);
    expect(html.match(/Nothing is entered for this plan/g)).toHaveLength(1);
  });
});
