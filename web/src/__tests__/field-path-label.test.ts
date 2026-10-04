import { describe, expect, it } from "vitest";
import { fieldPathLabel, labelFor } from "@/lib/upload";

const RAW = /[[\]_.]|^[a-z]+$/;

describe("fieldPathLabel (Documents card: needs your confirmation)", () => {
  it.each([
    ["classes[0].plan_share_bp_in", "Plan share in-network (coverage class 1)"],
    ["classes[2].plan_share_bp_out", "Plan share out-of-network (coverage class 3)"],
    ["oon_rule", "Out-of-network payment basis"],
    ["class_of", "Coverage class for at least one procedure"],
    ["deductible_individual", "Deductible (per person)"],
    ["annual_max", "Annual maximum"],
    ["benefit_year_start_month", "Benefit year start month"],
    ["alternate_benefit", "Alternate benefit clause"],
    ["waiting_months", "Waiting periods"],
    ["frequency[1]", "Frequency limit (rule 2)"],
  ])("%s -> %s", (path, label) => {
    expect(fieldPathLabel(path)).toBe(label);
  });

  it("names procedures in per-procedure paths and never returns a raw path", () => {
    for (const p of ["class_of.crown", "allowed_amounts.crown", "excluded.implant", "premium_monthly.employee_only", "something_new[3].x", "zz"]) {
      const out = fieldPathLabel(p);
      expect(out).not.toBe(p);
      expect(out).not.toMatch(RAW);
    }
    expect(fieldPathLabel("class_of.some_new_key")).toBe("Coverage class: some new key");
  });

  it("labelFor prefers the review row's own label and falls back to the plain label", () => {
    expect(labelFor([{ field_path: "oon_rule", label: "Row label" } as never], "oon_rule")).toBe("Row label");
    expect(labelFor([], "oon_rule")).toBe("Out-of-network payment basis");
  });
});
