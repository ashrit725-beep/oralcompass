import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** motion-6 (addendum B1; anti-checklist): no blur entrance and no CSS entrance on the plan map; the ViewSwitch panel is the one wash-in. */
const dir = join(__dirname, "..");
const css = [join(dir, "styles.css"), ...readdirSync(join(dir, "styles")).filter((f) => f.endsWith(".css")).map((f) => join(dir, "styles", f))]
  .map((f) => ({ f, text: readFileSync(f, "utf8") }));

describe("CSS motion rules", () => {
  it("has no keyframes that animate a blur filter", () => {
    for (const { f, text } of css) {
      const frames = text.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? [];
      for (const k of frames) expect(k, f).not.toMatch(/blur\(/);
    }
  });
  it("gives the map no CSS entrance animation", () => {
    for (const { f, text } of css) expect(text, f).not.toMatch(/(^|[\s,}])\.map\s*\{[^}]*animation\s*:/);
  });
});
