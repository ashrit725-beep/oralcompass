import { describe, expect, it } from "vitest";
import { parseAllowedCents } from "@/lib/drawer";

/** web-correctness-9 / a11y-10: the drawer's allowed-amount field uses the strict parser; bad input is refused (and reported), not misread. */
describe("allowed amount parsing in the drawer", () => {
  it("refuses figures the old strip-everything parser misread", () => {
    expect(parseAllowedCents("1,5")).toBeUndefined();     // was $15.00
    expect(parseAllowedCents("1O0")).toBeUndefined();     // letter O, was $10.00
    expect(parseAllowedCents("12abc")).toBeUndefined();   // was $12.00
    expect(parseAllowedCents("1.2.3")).toBeUndefined();   // was NaN, silently ignored
    expect(parseAllowedCents("0")).toBeUndefined();       // passed `required`, then returned with no message
    expect(parseAllowedCents("")).toBeUndefined();
  });
  it("reads well-formed dollar figures", () => {
    expect(parseAllowedCents("$1,500.00")).toBe(150000);
    expect(parseAllowedCents("12,345")).toBe(1234500);
    expect(parseAllowedCents("812.5")).toBe(81250);
  });
});
