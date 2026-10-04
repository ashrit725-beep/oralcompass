import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// NumberFlow registers a custom element at import time; static markup needs only its props.
vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { LandmarkContent } from "@/components/LandmarkContent";

import type { PlanFixture, PlanSummary } from "@/lib/types";

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
