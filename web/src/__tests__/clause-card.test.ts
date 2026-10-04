import { describe, expect, it, vi } from "vitest";

vi.mock("@number-flow/react", () => ({ default: () => null }));

import { stepsAffectedBy } from "@/components/ClauseCard";
import type { Step } from "@/lib/types";

const step = (stitch: string, rule: string): Step => ({ label: rule, cents: 0, owner: "plan", rule, stitch });
const lines = [{ label: "Crown", steps: [step("DD24#p1", "CO"), step("MSU20h#p1", "P"), step("DD24#p3", "D")] }];

describe("ClauseCard 'In this scenario' (web-correctness-35)", () => {
  it("matches steps by document AND page, not by page number alone", () => {
    expect(stepsAffectedBy({ doc: "MSU20h", page: 1, ruleCodes: ["CO", "P"] }, lines).map((a) => a.step.stitch)).toEqual(["MSU20h#p1"]);
    expect(stepsAffectedBy({ doc: "DD24", page: 1, ruleCodes: ["CO"] }, lines).map((a) => a.step.stitch)).toEqual(["DD24#p1"]);
    expect(stepsAffectedBy({ doc: "DD24", page: 1, ruleCodes: ["D"] }, lines)).toEqual([]);
  });
});
