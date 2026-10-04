import { describe, expect, it } from "vitest";
import { artHref, artSources } from "@/lib/art-srcset";
import manifest from "../../public/art/sizes.json";

describe("art-srcset (phone variants of the painted plates)", () => {
  it("offers the journey plate's variants with the original last and as the fallback", () => {
    const s = artSources("journey-passage");
    expect(s.src).toBe("/art/journey-passage.webp");
    expect(s.webp).toMatch(/^\/art\/journey-passage-480\.webp 480w, .*\/art\/journey-passage\.webp 1080w$/);
    expect(s.avif ?? "").toContain("/art/journey-passage-960.avif 960w");
  });
  it("never lists a variant as wide as or wider than its original (no upscaling)", () => {
    for (const p of Object.values(manifest as Record<string, { w: number; variants: { w: number }[] }>)) {
      for (const v of p.variants) expect(v.w).toBeLessThan(p.w);
    }
  });
  it("falls back to the original for an unknown plate and for a slot wider than every variant", () => {
    expect(artSources("no-such-plate")).toEqual({ src: "/art/no-such-plate.webp", webp: "/art/no-such-plate.webp" });
    expect(artHref("island-generic", 100, 3)).toBe("/art/island-generic-480.webp");
    expect(artHref("island-generic", 2000, 3)).toBe("/art/island-generic.webp");
  });
});
