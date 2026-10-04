import { beforeEach, describe, expect, it, vi } from "vitest";

const explain = vi.fn();
vi.mock("@/lib/api", () => ({ api: { explain: (...a: unknown[]) => explain(...a) } }));
vi.mock("../lib/api", () => ({ api: { explain: (...a: unknown[]) => explain(...a) } }));

import { clearExplainCache, explainClause, explainKey, plainTopic } from "../lib/explain";

const stitch = { doc: "ML26", page: 25, quote: "80% after deductible 60% after deductible 50% after deductible" };
const ok = { mode: "demo", sentence: "s", refs: [{ kind: "clause", stitch: "ML26#p25", field: "classes[1].plan_share_bp_in.cite" }], cached: false, label: "Demo mode", topic: "coinsurance" };

describe("clause explainer client (addendum D.5b)", () => {
  beforeEach(() => { explain.mockReset(); clearExplainCache(); });

  it("asks once per (plan, clause) and sends the stitch and quote", async () => {
    explain.mockResolvedValue(ok);
    const [a, b] = await Promise.all([explainClause("ML26", stitch), explainClause("ML26", stitch)]);
    expect(a).toBe(b);
    expect(explain).toHaveBeenCalledTimes(1);
    expect(explain).toHaveBeenCalledWith({ plan_ref: "ML26", stitch: "ML26#p25", quote: stitch.quote });
    await explainClause("upload:abc", stitch);
    expect(explain).toHaveBeenCalledTimes(2);                       // a different plan reference is a different clause
  });

  it("forgets a failed request so a later open can retry", async () => {
    explain.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce(ok);
    await expect(explainClause("ML26", stitch)).rejects.toThrow();
    await expect(explainClause("ML26", stitch)).resolves.toEqual(ok);
    expect(explain).toHaveBeenCalledTimes(2);
  });

  it("keys and topics", () => {
    expect(explainKey("ML26", stitch)).toBe(`ML26|ML26#p25|${stitch.quote}`);
    expect(plainTopic({ topic: "class:Type II" })).toBe("coinsurance");
    expect(plainTopic({ topic: "deductible" })).toBe("deductible");
  });
});
