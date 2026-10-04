import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** a11y-14: every token used for TEXT meets 4.5:1 on the three paper surfaces (spec §9.1), computed from the :root hex values. */
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const hex = (name: string): string => {
  const m = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (m) return m[1];
  const alias = root.match(new RegExp(`--${name}:\\s*var\\(--([\\w-]+)\\)`));
  if (alias) return hex(alias[1]);
  throw new Error(`token --${name} not found`);
};
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("text token contrast (a11y-14)", () => {
  const surfaces = ["paper", "paper-deep", "parchment"];
  const textTokens = ["ink", "you-pay", "plan-pays", "basis", "owner-patient", "owner-plan", "closed", "terracotta-text", "water-ink-text", "forest-text", "ok-text", "wood-text"];
  for (const t of textTokens) {
    it(`--${t} reads at 4.5:1 or more on every paper surface`, () => {
      for (const s of surfaces) expect(ratio(hex(t), hex(s)), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("--ink-soft and --text-muted (secondary text) read at 4.5:1 on paper and paper-deep (on parchment the small text is ink)", () => {
    for (const t of ["ink-soft", "text-muted"]) for (const s of ["paper", "paper-deep"]) expect(ratio(hex(t), hex(s)), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });
});
