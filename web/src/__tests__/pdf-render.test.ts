import { describe, expect, it } from "vitest";
import { renderSequential, stitchKey } from "@/lib/pdfRender";

describe("PDF page rendering (web-correctness-16)", () => {
  it("a superseded run never appends a page after it was cancelled mid-render", async () => {
    let cancelledA = false;
    const appended: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const runA = renderSequential(3, async (p) => { if (p === 2) await gate; return `A${p}`; }, (_p, v) => appended.push(v), () => cancelledA);
    await Promise.resolve(); await Promise.resolve();
    cancelledA = true;                                         // the URL changed while page 2 was rendering
    const runB = renderSequential(2, async (p) => `B${p}`, (_p, v) => appended.push(v), () => false);
    release();
    expect(await runA).toBe(false);
    expect(await runB).toBe(true);
    expect(appended).toEqual(["A1", "B1", "B2"]);             // A2 and A3 never land in the cleared container
  });

  it("the overlay key follows the stitch set, not the array identity", () => {
    const a = [{ id: "s1" }, { id: "s2" }];
    expect(stitchKey(a)).toBe(stitchKey([...a]));
    expect(stitchKey(a)).not.toBe(stitchKey([{ id: "s1" }]));
  });
});
