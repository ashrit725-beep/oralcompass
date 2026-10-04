import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { Gauge } from "@/components/compass/Gauge";
import { CoverageMeter } from "@/components/compass/CoverageMeter";
import type { MeterVM } from "@/lib/compass-model";

const meter = (p: Partial<MeterVM>): MeterVM => ({ limitCents: 150000, limitStatus: "DOC", limitCite: null, unlimited: false, usedCents: 24000, remainingCents: 126000, derivation: null, afterCents: null, afterWaiting: false, usedFraction: 0.16, afterFraction: null, ...p });

describe("compass meters", () => {
  it("names every role=meter (a11y-11)", () => {
    const g = renderToStaticMarkup(<Gauge label="Annual maximum" meter={meter({})} usedWord="paid by the plan" />);
    expect(g).toMatch(/role="meter" aria-label="Annual maximum"/);
    const c = renderToStaticMarkup(<CoverageMeter cls={{ name: "Type II", pctIn: 60, statusIn: "DOC", citeIn: null, pctOut: null, statusOut: null, classCite: null, section: null }} />);
    expect(c).toMatch(/role="meter" aria-label="Type II"/);
  });

  it("draws unknown usage differently from $0 used, and says so in the compact gauge (info-only-8)", () => {
    const g = renderToStaticMarkup(<Gauge label="Deductible" meter={meter({ usedCents: null, remainingCents: null, usedFraction: null })} usedWord="met" compact />);
    expect(g).toMatch(/class="cmp-meter\s+is-empty"/);
    expect(g).toContain("Missing");
    const css = readFileSync(join(__dirname, "../styles/plan.css"), "utf8");
    expect(css).toMatch(/\.cmp-meter\.is-empty:not\(\.is-unknown\)\s*\{[^}]*border:\s*1px dashed/);
  });
});

import { BenefitsCompass } from "@/components/compass/BenefitsCompass";
import type { Benefits, PlanFixture, SavedEstimate } from "@/lib/types";

describe("compass headline evidence (orchestrator note 1)", () => {
  const alex = JSON.parse(readFileSync(join(__dirname, "../__fixtures__/passage/alex.json"), "utf8"));
  const ml26: PlanFixture = JSON.parse(readFileSync(join(__dirname, "../../../fixtures/plans/ml26.json"), "utf8"));
  it("calls the remaining-after figure calculated instead of wearing a lone document badge", () => {
    const html = renderToStaticMarkup(<BenefitsCompass plan={ml26} benefits={alex.benefits[0] as Benefits} estimate={alex.estimate as SavedEstimate} stitches={[]} onOpenLandmark={() => undefined} onSelectStitch={() => undefined} />);
    const answer = /<p class="cmp-a">(.*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(answer).toContain("$162.00");
    expect(answer).toContain("We did the math:");
    expect(answer).not.toMatch(/class="badge badge-doc"/);
  });
});

describe("after-planned figure (numbers-7)", () => {
  it("reads as calculated, never as a bare 'From the plan document' figure", () => {
    const g = renderToStaticMarkup(<Gauge label="Annual maximum" meter={meter({ afterCents: 16200, afterFraction: 0.9 })} usedWord="paid by the plan" />);
    expect(g).toContain("$162.00");
    const after = g.slice(g.indexOf("$162.00"));
    expect(after).toMatch(/calculated/i);
    expect(after.slice(0, 400)).not.toContain("From your plan papers");
  });
});
