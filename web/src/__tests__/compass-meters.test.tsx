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
    expect(g).toContain("Not provided");
    const css = readFileSync(join(__dirname, "../styles/plan.css"), "utf8");
    expect(css).toMatch(/\.cmp-meter\.is-empty:not\(\.is-unknown\)\s*\{[^}]*border:\s*1px dashed/);
  });
});
