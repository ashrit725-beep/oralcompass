import { describe, expect, it } from "vitest";
import { plainNote } from "../lib/stitches";

describe("plainNote", () => {
  it("reads engine notes without the spaced em dash", () => {
    expect(plainNote("waiting period: not found in the pages read — computed as none; could be higher if one applies"))
      .toBe("waiting period: not found in the pages read, computed as none; could be higher if one applies");
    expect(plainNote("network status not provided — unresolved")).toBe("network status not provided, unresolved");
    expect(plainNote("no dash here")).toBe("no dash here");
  });
});
