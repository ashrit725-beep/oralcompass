import { describe, expect, it, vi } from "vitest";

// NumberFlow registers a custom element at import time; static markup needs only a placeholder for the digits.
vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import alexJson from "../__fixtures__/passage/alex.json";
import { CinematicStage } from "@/components/atlas/CinematicStage";
import { PassageSides, PassageVertical } from "@/components/atlas/PassageVertical";
import { DetailPanel } from "@/components/DetailPanel";
import { AnswersLog } from "@/components/journey/AnswersLog";
import { CareTimeline } from "@/components/journey/CareTimeline";
import { ToothEdit } from "@/components/journey/ToothEdit";
import { WhatIfNetwork } from "@/components/journey/WhatIfNetwork";
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

describe("the phone passage on the cinematic stage (owner direction: full-bleed, mobile-only)", () => {
  const html = renderToStaticMarkup(<PassageVertical vm={vm} selected={null} onSelect={noop} planCode="ML26" onSelectStitch={noop} drawKey="test" />);
  const buttons = html.match(/<button[^>]*>/g) ?? [];
  it("lists START, each island followed by its checkpoints, then the Harbor Light, as real buttons in reading order", () => {
    const names = buttons.map((b) => /aria-label="([^"]*)"/.exec(b)?.[1] ?? "");
    expect(names[0]).toMatch(/^Start · ML26 · /);
    const rc = names.findIndex((n) => n.startsWith("Root canal")), crown = names.findIndex((n) => n.startsWith("Crown"));
    expect(rc).toBeGreaterThan(0);
    expect(crown).toBeGreaterThan(rc + vm.islands[0].checkpoints.length);       // the root canal's checkpoints sit between the two islands
    expect(names.filter((n) => n.startsWith("Harbor Light ·"))).toHaveLength(1);
    expect(buttons.every((b) => !b.includes("tabindex"))).toBe(true);           // every stop is in the tab order (no roving tabindex on phones)
  });
  it("marks one route stop per pier, shore and checkpoint marker, and no stop on the labels", () => {
    const stops = html.match(/data-wp="[^"]+"/g) ?? [];
    const cps = vm.islands.reduce((n, i) => n + i.checkpoints.length, 0);
    expect(stops).toHaveLength(1 + vm.islands.length * 2 + cps + 1);
    expect(stops[0]).toBe('data-wp="start"');
    expect(stops[stops.length - 1]).toBe('data-wp="destination"');
  });
  it("hands the stage camera only the selected island", () => {
    expect(html).not.toContain("data-stage-focus");
    const sel = renderToStaticMarkup(<PassageVertical vm={vm} selected={{ islandId: vm.islands[1].id }} onSelect={noop} planCode="ML26" drawKey="test" />);
    expect(sel.match(/data-stage-focus="true"/g) ?? []).toHaveLength(1);
    expect(sel).toMatch(new RegExp(`data-island="${vm.islands[1].id}"[^>]*data-stage-focus="true"|data-stage-focus="true"[^>]*data-island="${vm.islands[1].id}"`));
  });
  it("lists every visited and mentioned island below the stage (nothing hidden behind '+k more')", () => {
    const sides = renderToStaticMarkup(<PassageSides vm={vm} selected={null} onSelect={noop} />);
    expect(sides.match(/class="unstyled pv-mini /g) ?? []).toHaveLength(vm.visited.length + vm.marginal.length);
    expect(sides).toContain('aria-labelledby="pv-visited-h"');
  });
});

describe("CinematicStage (shared by My journey and My plan)", () => {
  const html = renderToStaticMarkup(<CinematicStage art="plan" title="Your plan" facts={<p>facts line</p>}><div id="map-layer" /></CinematicStage>);
  it("labels the stage with its title card and keeps the painting decorative", () => {
    const id = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<h2 id="${id}" tabindex="-1" class="cin-title-h">Your plan</h2>`);
    expect(html).toContain("facts line");
    expect(html).toMatch(/<div class="cin-plate[^"]*" aria-hidden="true">/);
    expect(html).toContain('src="/art/plan-passage.webp"');
    expect((html.match(/<img [^>]*alt=""/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(html).toContain('<div id="map-layer"></div>');
  });
  it("mirrors every other plate tile so the seams continue the painting", () => {
    const tiles = html.match(/class="cin-tile[^"]*"/g) ?? [];
    expect(tiles[0]).toBe('class="cin-tile"');
    expect(tiles[1]).toBe('class="cin-tile is-mirror"');
  });
});

describe("care rail (finding slop-27)", () => {
  it("shows a single 'Show on the chart' link, on the current stage", () => {
    const html = renderToStaticMarkup(<CareTimeline journey={f.view.journey} progress={f.view.progress} selected={null} onSelect={noop} currentStageId="before" linkedIsland={() => vm.islands[0].id} onShowOnChart={noop} />);
    expect(html.match(/Show on the chart/g) ?? []).toHaveLength(1);
    const at = html.indexOf('data-stage-btn="before"'), link = html.indexOf("Show on the chart"), next = html.indexOf("data-stage-btn=", at + 1);
    expect(link).toBeGreaterThan(at);
    expect(next === -1 || link < next).toBe(true);
  });
});

describe("journey motion rules (findings motion-5, motion-4, slop-26, motion-12)", () => {
  const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  // the forbidden words are assembled so this file itself passes tools/screenshots.py's forbidden-motion scan
  const SCROLL_HOOK = new RegExp(["use", "Scroll\\("].join(""));
  const GLASS = new RegExp(["<Gradual", "Blur|back", "drop-?filter"].join(""), "i");
  it("the care timeline fill follows the current stage, not page scroll, and animates transform only", () => {
    const t = src("../components/ui/timeline.tsx");
    expect(t).not.toMatch(SCROLL_HOOK);
    expect(t).not.toMatch(/useTransform\(|heightTransform/);
    expect(t).toMatch(/scaleY: fraction/);
  });
  it("no scroll parallax, glass blur or bobbing pin on the passage", () => {
    for (const f of ["../components/atlas/CinematicStage.tsx", "../components/atlas/PassageVertical.tsx", "../styles/journey.css"]) {
      expect(src(f)).not.toMatch(SCROLL_HOOK);
      expect(src(f)).not.toMatch(GLASS);
    }
    expect(src("../styles/journey.css")).not.toMatch(/filter:\s*blur/);
    expect(src("../styles.css")).not.toMatch(/@keyframes bob|animation:\s*bob/);
    expect(existsSync(new URL("../components/atlas/JourneyMap.tsx", import.meta.url))).toBe(false);   // the legacy pin map was removed (web-correctness-33)
  });
});

describe("what if and tooth controls (finding demo-5)", () => {
  it("the network hypothetical offers records / in / out and labels an active value ASSUMED", () => {
    const off = renderToStaticMarkup(<WhatIfNetwork value={null} recorded="in" onChange={noop} />);
    expect(off).toContain("As in your records (in-network)");
    expect(off).toContain("Out-of-network (hypothetical)");
    expect(off).not.toContain("badge-assumed");
    expect(renderToStaticMarkup(<WhatIfNetwork value="out" recorded="in" onChange={noop} />)).toContain("badge-assumed");
  });
  it("the tooth field starts from the record", () => {
    const item = f.items.find((i) => i.status === "planned" || i.status === "scheduled")!;
    expect(renderToStaticMarkup(<ToothEdit item={item} />)).toContain(`value="${item.tooth}"`);
  });
});
