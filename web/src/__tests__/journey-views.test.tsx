import { describe, expect, it, vi } from "vitest";

// NumberFlow registers a custom element at import time; static markup needs only a placeholder for the digits.
vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { renderToStaticMarkup } from "react-dom/server";
import alexJson from "../__fixtures__/passage/alex.json";
import { DetailPanel } from "@/components/DetailPanel";
import { AnswersLog } from "@/components/journey/AnswersLog";
import { Money } from "@/components/Money";
import { OverviewList } from "@/components/OverviewList";
import { UI } from "@/lib/copy";
import { labeledSamples, shortJourneyLabel } from "@/lib/journey";
import { answersLog, buildPassage, type PassageInputs } from "@/lib/passage";
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

describe("start screen samples (finding demo-12)", () => {
  it("never offers the empty template as a labeled sample journey", () => {
    const api = [{ id: "sample-alex", label: "Sample journey — Alex Chen (fictional)" }, { id: "sample-sam", label: "Sample journey — Sam Rivera (fictional)" }, { id: "empty", label: "Your journey" }];
    expect(labeledSamples(api).map((s) => s.id)).toEqual(["sample-alex", "sample-sam"]);
  });
});

describe("DetailPanel forms (finding web-correctness-7)", () => {
  const base = { view: f.view, estimate: f.estimate, onSelect: noop, onOpenLandmark: noop, onOpenDocuments: noop, onPatch: async () => {}, onInstructions: async () => {}, busy: false, mobile: false, onClose: noop };
  const stage = f.view.journey.stages.find((s) => s.checkpoints.length >= 2)!;
  const bodyOf = (el: ReturnType<typeof DetailPanel>) => (el as React.ReactElement<{ children: React.ReactNode[] }>).props.children[1] as React.ReactElement;
  it("mounts a fresh checkpoint form per checkpoint and a fresh stage form per stage", () => {
    const a = bodyOf(DetailPanel({ ...base, selection: { stageId: stage.id, cpId: stage.checkpoints[0].id } }));
    const b = bodyOf(DetailPanel({ ...base, selection: { stageId: stage.id, cpId: stage.checkpoints[1].id } }));
    expect(a.key).toBe(`${stage.id}:${stage.checkpoints[0].id}`);
    expect(b.key).not.toBe(a.key);
    expect(bodyOf(DetailPanel({ ...base, selection: { stageId: stage.id } })).key).toBe(stage.id);
  });
});

describe("DetailPanel costs (finding web-correctness-28)", () => {
  it("prints the live estimate, not the journey view's stale latest_estimate snapshot", () => {
    const stale = { ...f.view, links: { ...f.view.links, latest_estimate: { id: "old", plan_code: "ML26", status: "estimate", calculated_at: "2026-01-01", user_estimated_payment_cents: 12345, insurer_estimated_payment_cents: 67890 } } };
    const props = { view: stale, estimate: f.estimate, onSelect: noop, onOpenLandmark: noop, onOpenDocuments: noop, onPatch: async () => {}, onInstructions: async () => {}, busy: false, mobile: false, onClose: noop };
    const stageHtml = renderToStaticMarkup(<DetailPanel {...props} selection={{ stageId: "before" }} />);
    expect(stageHtml).toContain("$902.00");
    expect(stageHtml).toContain("$1,098.00");
    expect(stageHtml).not.toContain("$123.45");
    const cpHtml = renderToStaticMarkup(<DetailPanel {...props} selection={{ stageId: "before", cpId: "estimate-reviewed" }} />);
    expect(cpHtml).toContain("$902.00");
    expect(cpHtml).not.toContain("$678.90");
  });
});

describe("completion disclaimer printed once (finding slop-29)", () => {
  it("is not repeated in the stage panel or the overview list", () => {
    const props = { view: f.view, estimate: f.estimate, onSelect: noop, onOpenLandmark: noop, onOpenDocuments: noop, onPatch: async () => {}, onInstructions: async () => {}, busy: false, mobile: false, onClose: noop };
    expect(renderToStaticMarkup(<DetailPanel {...props} selection={{ stageId: "before" }} />)).not.toContain(UI.progressNote.slice(0, 40));
    expect(renderToStaticMarkup(<OverviewList journey={f.view.journey} vm={vm} onSelect={noop} />)).not.toContain(UI.progressNote.slice(0, 40));
  });
});

describe("evidence beside journey figures (findings info-only-5, demo-8)", () => {
  it("marks the Answers-log totals as calculated", () => {
    const rows = answersLog(vm, f.view, f.plan, f.estimate);
    expect(rows.find((r) => r.key === "cost")).toMatchObject({ dd: "$902.00 · plan $1,098.00", calc: true });
    expect(answersLog(vm, f.view, f.plan, null).find((r) => r.key === "cost")?.calc).toBeFalsy();
    const html = renderToStaticMarkup(<AnswersLog vm={vm} view={f.view} plan={f.plan} estimate={f.estimate} onFocus={noop} />);
    expect(html).toContain("Calculated from the clauses cited");
  });
  it("Money says 'calculated' for engine totals and reads the badge label (not the code) when the badge is hidden", () => {
    expect(renderToStaticMarkup(<Money cents={90200} evidence="DOC" calc />)).toContain("Calculated from the clauses cited");
    expect(renderToStaticMarkup(<Money cents={4500} evidence="USER" badge={false} />)).toContain("Evidence: You entered");
    expect(renderToStaticMarkup(<Money cents={4500} evidence="USER" badge={false} />)).not.toContain("Evidence: USER");
  });
});

describe("overview figures (finding web-correctness-26)", () => {
  it("labels island totals as calculated and extends the fee by quantity through itemFeeCents", () => {
    const items = f.items.map((i) => (i.status === "planned" || i.status === "scheduled" ? { ...i, quantity: 2 } : i));
    const vm2 = buildPassage({ ...alex, items });
    const html = renderToStaticMarkup(<OverviewList journey={f.view.journey} vm={vm2} onSelect={noop} />);
    const route = html.slice(html.indexOf('class="ov-table ov-islands"'), html.indexOf("</table>", html.indexOf('class="ov-table ov-islands"')));
    expect(route).toContain(">$2300.00<");                            // root canal $1,150.00 x 2, as the engine multiplies (mocked digits)
    const rows = route.split('<tr class="ov-island').slice(1);
    for (const r of rows) {
      const cells = r.split("<td>");
      expect(cells[5]).toContain("Calculated from the clauses cited"); // You pay
      expect(cells[6]).toContain("Calculated from the clauses cited"); // Plan pays
      expect(cells[5]).not.toContain("You entered");
    }
  });
});

describe("journey picker labels (finding layout-9)", () => {
  it("keeps the closed Journey select short enough for a phone", () => {
    expect(shortJourneyLabel("Sample journey — Alex Chen (fictional) on the NCFlex Dental Classic Option 2026 (real public plan document)")).toBe("Alex Chen (fictional) · sample");
    expect(shortJourneyLabel("Sample journey — Sam Rivera (fictional)")).toBe("Sam Rivera (fictional) · sample");
    expect(shortJourneyLabel("Your journey")).toBe("Your journey");
  });
});
