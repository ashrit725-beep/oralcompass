import { describe, expect, it, vi } from "vitest";

// NumberFlow registers a custom element at import time; static markup needs only a placeholder for the digits.
vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { renderToStaticMarkup } from "react-dom/server";
import alexJson from "../__fixtures__/passage/alex.json";
import { OverviewList } from "@/components/OverviewList";
import { buildPassage, type PassageInputs } from "@/lib/passage";
import { stitchesFromClauses } from "@/lib/stitches";
import type { Clause, CoverageRule, JourneyView, PlanFixture, Procedure, SavedEstimate, TreatmentItem } from "@/lib/types";

type Fixture = { view: JourneyView; items: TreatmentItem[]; benefits: PassageInputs["benefits"][]; estimate: SavedEstimate; rules: CoverageRule[]; plan: PlanFixture; clauses: Clause[]; procedures: Procedure[] };
const f = alexJson as unknown as Fixture;
const alex: PassageInputs = {
  items: f.items, estimate: f.estimate, benefits: f.benefits.find((b) => b?.plan_code === "ML26") ?? null, journey: f.view, rules: f.rules, plan: f.plan,
  procedures: f.procedures, stitches: stitchesFromClauses(f.clauses), planRef: "ML26",
};
const vm = buildPassage(alex);
const noop = () => {};

describe("OverviewList tables (findings layout-19, mobile-9, layout-5, layout-23)", () => {
  const html = renderToStaticMarkup(<OverviewList journey={f.view.journey} vm={vm} planTitle={f.plan.title} onSelect={noop} onSelectIsland={noop} onSelectStitch={noop} />);
  it("puts every table, the care-stage tables included, inside a focusable sideways scroller", () => {
    const tables = html.match(/<table/g) ?? [];
    const wrapped = html.match(/<div class="ov-scroll" role="region" aria-label="[^"]+" tabindex="0"><table/g) ?? [];
    expect(tables.length).toBeGreaterThanOrEqual(3 + f.view.journey.stages.length);
    expect(wrapped.length).toBe(tables.length);
  });
  it("keeps each table one real table (no split header/body layout classes)", () => {
    expect(html).not.toMatch(/display:\s*(block|table)/);
    // every header row has as many cells as its first body row: the columns are shared
    const visited = html.slice(html.indexOf('class="ov-table ov-visited"'));
    const head = visited.slice(0, visited.indexOf("</thead>"));
    const firstRow = visited.slice(visited.indexOf("<tbody>"), visited.indexOf("</tr>", visited.indexOf("<tbody>")));
    expect((head.match(/<th /g) ?? []).length).toBe((firstRow.match(/<t[hd][ >]/g) ?? []).length);
  });
});
