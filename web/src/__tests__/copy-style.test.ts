import { describe, expect, it, vi } from "vitest";

vi.mock("@number-flow/react", () => ({ default: () => null }));

import { UI } from "@/lib/copy";
import { RECONCILE_WARN } from "@/components/pipeline/CostPipeline";

const strings = (o: Record<string, unknown>): string[] =>
  Object.values(o).flatMap((v) => (typeof v === "string" ? [v] : typeof v === "function" ? [String((v as (...a: string[]) => string)("A", "B", "C"))] : Array.isArray(v) ? v.filter((x) => typeof x === "string") : []));

describe("shell copy", () => {
  it("prints no em dash as punctuation in the UI strings (slop-1, info-only-10; antislop R-02)", () => {
    const bad = strings(UI).filter((s) => /\s—\s/.test(s));
    expect(bad).toEqual([]);
    expect(UI.sampleRibbon).toBe("Pretend example: not a real person");
    expect(RECONCILE_WARN).not.toMatch(/—/);
  });
});
