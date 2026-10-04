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

describe("ComparisonGrid estimates (info-only-1: entered for this plan only)", () => {
  it("says per card whether inputs were entered for that plan, and never implies a carry-over", () => {
    const html = renderToStaticMarkup(<ComparisonGrid data={data} plans={plans} enteredFor={["ML26"]} />);
    expect(html.match(/entered for this plan only/g)).toHaveLength(1);
    expect(html.match(/Nothing is entered for this plan/g)).toHaveLength(1);
  });
});

describe("ComparisonGrid phone cards (mobile-only direction, part E)", () => {
  const html = renderToStaticMarkup(<ComparisonGrid data={data} plans={plans} labels={{ ML26: "MetLife NCFlex Dental · Classic 2026", DD26: "Delta Dental PPO · 2026" }} />);
  it("renders one swipeable card per plan, in the user's order, inside one horizontal track (no table, no nested vertical scroller)", () => {
    expect(html).not.toMatch(/<table/);
    expect(html.match(/<article[^>]*class="cmp-card"/g)).toHaveLength(2);
    expect(html.indexOf("MetLife NCFlex</h4>")).toBeLessThan(html.indexOf("Delta Dental PPO</h4>"));
    expect(html).toMatch(/<div[^>]*class="cmp-track"[^>]*role="region"/);
  });
  it("names each plan in the segmented switcher; the first card is the current one", () => {
    const segs = [...html.matchAll(/<button[^>]*class="cmp-seg-btn[^"]*"[^>]*>([^<]*)<\/button>/g)];
    expect(segs.map((m) => m[1])).toEqual(["MetLife NCFlex Dental · Classic 2026", "Delta Dental PPO · 2026"]);
    expect(segs[0][0]).toContain('aria-current="true"');
    expect(segs[1][0]).not.toContain("aria-current");
  });
  it("tags a topic whose values differ between the plans", () => {
    expect(html.match(/Differs between plans/g)).toHaveLength(2);
  });
});

describe("ComparisonGrid repetition (info-only-6, slop-11, slop-12)", () => {
  const html = renderToStaticMarkup(<ComparisonGrid data={data} plans={plans} />);
  it("prints the differences sentence once, for screen readers only (its figures are badged in the cells)", () => {
    expect(html.match(/<span class="sr-only">MetLife NCFlex: \$1,500\.00/g)).toHaveLength(1);
  });
  it("lists each estimate flag once", () => {
    expect(html.match(/waiting period: not found/g)).toHaveLength(1);
  });
});

describe("ComparisonGrid headings (a11y-22)", () => {
  it("nests the grid title as an h3 under the view's h2", () => {
    const html = renderToStaticMarkup(<ComparisonGrid data={data} plans={plans} />);
    expect(html).toMatch(/<h3 id="cmp-h"[^>]*>Side by side<\/h3>/);
    expect(html).not.toMatch(/<h2/);
  });
});
