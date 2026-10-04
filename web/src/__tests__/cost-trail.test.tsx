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
