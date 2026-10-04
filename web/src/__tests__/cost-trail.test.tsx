import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { CostTrail } from "@/components/CostTrail";
import type { SavedEstimate } from "@/lib/types";

const alex = JSON.parse(readFileSync(join(__dirname, "../__fixtures__/passage/alex.json"), "utf8"));
const estimate = alex.estimate as SavedEstimate;

/** web-correctness-5 (CLAUDE.md rule 2): the My plan lighthouse trail (no `lineIndex`) prints no bare dollar figure. */
describe("CostTrail on the lighthouse", () => {
  const html = renderToStaticMarkup(<CostTrail estimate={estimate} stitches={[]} onSelect={() => undefined} />);
  const items = html.match(/<li class="trail-step[^"]*">.*?<\/li>/g) ?? [];

  it("marks every step that prints an amount with a stitch or a source badge", () => {
    expect(items.length).toBeGreaterThan(3);
    for (const li of items) if (/\$\d/.test(li)) expect(li).toMatch(/class="(badge|stitch)[ "]/);
  });

  it("says the totals are calculated from the steps", () => {
    expect(html).toMatch(/<p class="hero"[^>]*>.*\$902\.00.*Calculated from the steps below/);
  });

  it("gives every receipt row a mark", () => {
    const rows = html.match(/<tr class="owner-[^"]*">.*?<\/tr>/g) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toMatch(/class="(badge|stitch)[ "]/);
  });
});

describe("unresolved estimate range scope (numbers-6)", () => {
  const unresolved = { ...estimate, status: "unresolved", ledger: { ...estimate.ledger, status: "unresolved", lines: [], patient_total_cents: null, plan_total_cents: null },
    movers: { range: [174000, 223000], movers: [{ unknown: "remaining deductible", impact_cents: null, zero_impact: false }, { unknown: "remaining annual maximum", impact_cents: null, zero_impact: false }], unresolved_reasons: [] },
    missing_inputs: [{ input: "remaining deductible", how: "Enter it." }] } as unknown as SavedEstimate;
  it("keeps the whole-estimate range out of one procedure's drawer and keeps it on the full trail", () => {
    const one = renderToStaticMarkup(<CostTrail estimate={unresolved} stitches={[]} lineIndex={0} />);
    expect(one).not.toContain("$1,740.00");
    const all = renderToStaticMarkup(<CostTrail estimate={unresolved} stitches={[]} />);
    expect(all).toContain("Between $1,740.00 and $2,230.00, because remaining deductible and remaining annual maximum were not provided.");
  });
});
