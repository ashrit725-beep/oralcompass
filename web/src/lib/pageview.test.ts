import { describe, expect, it } from "vitest";
import { clusterPins, normalizeWithMap, quoteItemRange } from "./pageview";

describe("PageView quote matching (layout-25)", () => {
  it("maps normalized offsets back to raw offsets", () => {
    const { text, map } = normalizeWithMap("  Adult   Cleaning\n$95 ");
    expect(text).toBe("adult cleaning $95");
    expect(map[0]).toBe(2);
    expect(map[text.indexOf("c")]).toBe(10);
  });
  it("covers only the quoted line's items, not the preceding one", () => {
    const items = ["Appendix A — Fee Schedule", "Periodic oral evaluation: $45.00", "Adult cleaning (prophylaxis): $95.00", "X-rays (set): $60.00"];
    expect(quoteItemRange(items, "Adult cleaning (prophylaxis): $95.00")).toEqual([2, 2]);
    expect(quoteItemRange(items, "periodic   oral evaluation")).toEqual([1, 1]);
    // whitespace before the page text no longer shifts the window onto the previous line
    expect(quoteItemRange(["   ", "  Line one", "Line two"], "Line two")).toEqual([2, 2]);
  });
  it("spans several items when the quote crosses them and returns null when absent", () => {
    expect(quoteItemRange(["Composite filling,", "two surfaces", "posterior tooth: $200.00"], "filling, two surfaces")).toEqual([0, 1]);
    expect(quoteItemRange(["abc"], "xyz")).toBeNull();
    expect(quoteItemRange(["abc"], "   ")).toBeNull();
  });
});

describe("PageView pin clustering (layout-4)", () => {
  it("chains a run of close lines into one pin; groups never sit closer than the gap", () => {
    const tops = [192, 218, 244, 270, 400, 30];
    const groups = clusterPins(tops, 44);
    expect(groups).toEqual([[5], [0, 1, 2, 3], [4]]);
    const anchors = groups.map((g) => Math.min(...g.map((i) => tops[i])));
    for (let i = 1; i < anchors.length; i++) expect(anchors[i] - anchors[i - 1]).toBeGreaterThanOrEqual(44);
  });
  it("keeps a lone pin alone", () => {
    expect(clusterPins([100], 44)).toEqual([[0]]);
    expect(clusterPins([], 44)).toEqual([]);
  });
});
