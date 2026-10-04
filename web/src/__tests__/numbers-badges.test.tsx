import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { CoverageShareSection } from "@/components/drawer/sections/CoverageShareSection";
import type { SectionProps } from "@/components/drawer/sections/shared";

/** numbers-2: the coverage-share dollars are the document's percentage applied to the user's allowed amount, so they read as calculated
 *  (with the "You entered" input badge), never as a bare "From the plan document" figure. */
describe("coverage share dollars", () => {
  it("labels the plan share and your share as calculated from your figures", () => {
    const props = {
      island: { lineIndex: 0 } as never,
      item: { id: "ti", procedure_key: "root_canal_molar", dentist_fee_cents: 115000, quantity: 1, allowed_cents: 98000, allowed_status: "USER" } as never,
      rule: { procedure_key: "root_canal_molar", plan_pays_pct: 60, category: "Type II" } as never,
      trail: { steps: [{ key: "share", rule: "CO", title: "Plan share", amountIn: 98000, change: null, amountOut: 39200, owner: "patient", explanation: "The plan pays 60%.", stitch: null, split: { plan: 58800, patient: 39200, planPct: 60 } }] } as never,
      plan: { source_document: { version_label: "ML26" }, deductible_individual: {}, annual_max: {} } as never,
      rules: [], benefits: null, estimate: null, stitches: [], onSelectStitch: () => {}, onOpenDocuments: () => {},
    } as unknown as SectionProps;
    const html = renderToStaticMarkup(<CoverageShareSection {...props} />);
    expect(html).toContain("$588.00");
    expect(html).toContain("$392.00");
    expect(html).not.toContain("From your plan papers");
    expect(html).toContain("You typed this");
  });
});

import { lightWaitWord } from "@/lib/passage";
import { PASSAGE } from "@/lib/copy/passage";

/** numbers-5: the Harbor Light only says "waiting for information" when a planned procedure is waiting (Jordan has none planned). */
describe("Harbor Light words without a total", () => {
  it("says no estimate was calculated when nothing is planned, waiting only when a planned line waits", () => {
    expect(lightWaitWord({ islands: [], status: "pending" })).toBe(PASSAGE.noEstimateCalculated);
    expect(lightWaitWord({ islands: [{ id: "x" } as never], status: "unresolved" })).toBe(PASSAGE.waitingLower);
  });
});
