import { describe, expect, it, vi } from "vitest";

vi.mock("@number-flow/react", () => ({ default: () => null }));

import { BADGE_LABEL } from "@/lib/copy";
import { evidenceWords, NO_AMOUNT } from "@/components/Money";

describe("Money screen-reader words", () => {
  it("a hidden badge reads the same plain words as the visible badge, never the status code (a11y-23)", () => {
    expect(evidenceWords("DOC")).toBe(`Evidence: ${BADGE_LABEL.DOC}`);
    expect(evidenceWords("USER")).toBe("Evidence: You entered");
    expect(evidenceWords("ASSUMED")).not.toContain("ASSUMED");
    expect(NO_AMOUNT).toBe("no amount");
  });
});
