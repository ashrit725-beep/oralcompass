import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { PlanAtlas, planLayout } from "@/components/atlas/PlanAtlas";
import { CinematicStage } from "@/components/atlas/CinematicStage";
import { LANDMARKS } from "@/lib/copy";

/** My plan in the Passage concept, phone only (owner directions 05:58 / 06:00). */
describe("planLayout (the five painted stops down the column)", () => {
  const LABEL_H = 112;   // the tallest label measured on iPhone SE / 13 / Pixel 7 (harbor: term, place, value, ribbon)
  for (const w of [320, 360, 375, 390, 412, 430, 480]) {
    it(`fits ${w} px without collisions`, () => {
      const l = planLayout(w);
      expect(l.stops.map((s) => s.id)).toEqual(LANDMARKS.map((m) => m.id));
      expect(l.route).toHaveLength(4);
      l.stops.forEach((s, i) => {
        // plates and labels stay inside the column; the label sits in the half opposite its plate
        expect(s.plate.x).toBeGreaterThanOrEqual(0);
        expect(s.plate.x + s.plate.w).toBeLessThanOrEqual(w);
        expect(s.label.x).toBeGreaterThanOrEqual(8);
        expect(s.label.x + s.label.w).toBeLessThanOrEqual(w - 8);
        const plateR = s.plate.x + s.plate.w, labelR = s.label.x + s.label.w;
        expect(s.side === "left" ? s.label.x >= plateR - 2 : labelR <= s.plate.x + 2).toBe(true);
        // rows are contiguous, so the full-row buttons never overlap
        if (i > 0) expect(s.top).toBe(l.stops[i - 1].top + l.stops[i - 1].height);
        // a label never touches the plates of the neighbouring rows on its side
        const labelTop = s.cy - LABEL_H / 2, labelBottom = s.cy + LABEL_H / 2;
        for (const n of [l.stops[i - 1], l.stops[i + 1]]) {
          if (!n || n.side === s.side) continue;
          expect(labelBottom <= n.plate.y || labelTop >= n.plate.y + n.plate.h, `${s.id} label vs ${n.id} plate at ${w}px`).toBe(true);
        }
      });
      expect(l.h).toBeGreaterThan(l.stops[4].top + l.stops[4].height);
    });
  }
});

describe("PlanAtlas markup", () => {
  const html = renderToStaticMarkup(
    <PlanAtlas selected="bridge" onSelect={() => undefined} label="Plan map"
               stops={{ bridge: { value: "$25.00", aria: "$25.00, From the plan document" }, lighthouse: { value: "Waiting for information", aria: "Waiting for information", state: "fog" } }} />,
  );
  it("renders one real button per landmark, named by the familiar term first", () => {
    const names = [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]).filter((n) => n !== "Plan map");
    expect(names).toEqual(["Your plan (The harbor)", "Pay first part (The bridge): $25.00, From the plan document", "Who pays what (The cove)", "Yearly limit (The lookout)", "You pay (The lighthouse): Waiting for information"]);
    expect(html.match(/<button/g)).toHaveLength(5);
    expect(html).toMatch(/data-stop="bridge"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/role="group" aria-label="Plan map"/);
  });
  it("keeps the painting decorative and fogs a stop that waits for information", () => {
    expect(html).toMatch(/<svg class="pa-route map-paint"[^>]*aria-hidden="true"/);
    expect(html).toMatch(/class="[^"]*pa-stop[^"]*is-fog/);
    expect(html).toContain("/art/fog-layer-1.webp");
    expect(html).not.toMatch(/class="map |plan-map|landmark-btn|landmark-row/);   // the flat hills atlas is gone
  });
});

describe("CinematicStage (shared stage on My plan)", () => {
  it("renders the plate, title card, facts, map layer, fade and vignette with no box", () => {
    const html = renderToStaticMarkup(<CinematicStage art="plan" title={<h3>T</h3>} facts={<p>F</p>}><div id="m" /></CinematicStage>);
    // mob/journey's CinematicStage is the one stage (integration rule 2.22): plate, title card, facts, map layer, fade and vignette
    for (const c of ["cin-stage", "cin-plate", "cin-title", "cin-facts", "cin-map", "cin-fade", "cin-vignette"]) expect(html).toContain(c);
    expect(html).toContain("/art/plan-passage.webp");
  });
  it("styles the stage full-bleed: no border, radius or shadow; drift and settle off under reduced motion", () => {
    const css = readFileSync(join(__dirname, "../styles/journey.css"), "utf8");
    const rule = css.match(/\.cin-stage \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/margin: calc\(-1 \* var\(--view-gutter/);
    expect(rule).not.toMatch(/border|radius|box-shadow/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.cin-settle\.is-establishing, \.cin-drift \{ animation: none !important; \}\s*\.cin-camera \{ transition: none !important; \}/);
    expect(css).toMatch(/\.cin-stage\[data-hidden\] \.cin-drift \{ animation-play-state: paused; \}/);
    // the mob/plan stub stage is gone: one stage, one set of rules
    const plan = readFileSync(join(__dirname, "../styles/plan.css"), "utf8");
    expect(plan).not.toMatch(/\.cstage/);
  });
  it("has no desktop branch in the plan stylesheet (phone-only app)", () => {
    const css = readFileSync(join(__dirname, "../styles/plan.css"), "utf8");
    const planPart = css.slice(0, css.indexOf("/* ---- treatment plan reader"));
    expect(planPart).not.toMatch(/@media \((min|max)-width/);
  });
});
