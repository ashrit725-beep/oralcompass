import { describe, expect, it } from "vitest";
import { clauseFieldLabel, clauseSection, docMetaLine, fieldStem, groupClauses } from "./clauses";

describe("Documents clause list (slop-23)", () => {
  it("labels field paths in plain words, never as raw paths", () => {
    expect(fieldStem("classes[2].plan_share_bp_in.cite")).toBe("classes.plan_share_bp_in");
    expect(clauseFieldLabel("catalog.eligibility.cite")).toBe("Who can enroll");
    expect(clauseFieldLabel("catalog.where_offered.cite")).toBe("Where the plan is offered");
    expect(clauseFieldLabel("unsupported_rules[3]")).toBe("A rule the calculation does not model");
    expect(clauseFieldLabel("premium_monthly.employee_children.cite")).toBe("Monthly premium, employee and children");
    expect(clauseFieldLabel("class_of.amalgam.cite")).toBe("Coverage class: Amalgam filling");
    expect(clauseFieldLabel("classes[0].plan_share_bp_in.cite")).toBe("Plan share in network");
    expect(clauseFieldLabel("annual_max_rule_cite")).toBe("Annual maximum rule");
    expect(clauseFieldLabel("deductible_waiver_cite")).toBe("When the deductible is waived");
    expect(clauseFieldLabel("frequency[4].cite")).toBe("How often a service is covered");
    for (const f of ["catalog.eligibility.cite", "unsupported_rules[0]", "classes[1].cite", "oon_rule.section4_cite"]) expect(clauseFieldLabel(f)).not.toMatch(/cite|_|\./);
  });
  it("sorts fields into sections", () => {
    expect(clauseSection("deductible_individual.cite")).toBe("costs");
    expect(clauseSection("class_of.crown.cite")).toBe("coverage");
    expect(clauseSection("frequency[0].cite")).toBe("limits");
    expect(clauseSection("catalog.eligibility.cite")).toBe("eligibility");
    expect(clauseSection("unsupported_rules[0]")).toBe("other");
  });
  it("keeps one row per distinct sentence, listing every field it supports, sections in order", () => {
    const q = "if they work for a state agency, university, participating community college";
    const groups = groupClauses([
      { doc: "ML26", page: 2, quote: q, field: "catalog.eligibility.cite" },
      { doc: "ML26", page: 6, quote: "Deductible $50", field: "deductible_individual.cite" },
      { doc: "ML26", page: 2, quote: `${q} `, field: "catalog.where_offered.cite" },
      { doc: "ML26", page: 3, quote: q, field: "catalog.eligibility.cite" },
    ]);
    expect(groups.map((g) => g.section)).toEqual(["costs", "eligibility"]);
    const elig = groups[1].rows;
    expect(elig).toHaveLength(2);                       // page 2 (two fields, one row) and page 3
    expect(elig[0].labels).toEqual(["Who can enroll", "Where the plan is offered"]);
    expect(elig[0].all).toHaveLength(2);
  });
  it("builds the document meta line from the parts that exist", () => {
    expect(docMetaLine([null, "dated 2020-01-01", undefined, false, "secondary"])).toBe("dated 2020-01-01 · secondary");
    expect(docMetaLine(["", null])).toBe("");
  });
});
