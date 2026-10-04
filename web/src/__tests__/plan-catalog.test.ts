import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dollarsToCents, fastPathLabel, fullPlanLabel, firstCode, groupPlans, locatePlan, planLabel, summaryFor, uploadLabel } from "@/lib/plan-catalog";
import type { PlanSummary } from "@/lib/types";

/** The real preset catalog, reduced to the summary fields the pickers read (the API's plan_summary does the same projection). */
function loadSummaries(): PlanSummary[] {
  const dir = join(__dirname, "../../../fixtures/plans");
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const cat = j.catalog ?? {};
    return { plan_code: j.plan_code, title: j.title, insurer: cat.carrier, plan_name: cat.plan_name, option: cat.option, plan_year: cat.plan_year, is_fictional: !!j.is_fictional } as PlanSummary;
  });
}

describe("groupPlans (carrier → plan → year)", () => {
  const carriers = groupPlans(loadSummaries());

  it("puts ML26 under MetLife / NCFlex Classic Option / 2026", () => {
    const hit = locatePlan(carriers, "ML26");
    expect(hit).not.toBeNull();
    expect(hit!.carrier.label).toBe("Metropolitan Life Insurance Company (MetLife)");
    expect(hit!.plan.label).toBe("NCFlex Dental Plan (State of North Carolina), Classic Option");
    expect(hit!.year.year).toBe(2026);
    expect(hit!.carrier.fictional).toBe(false);
  });

  it("lists real carriers first and fictional carriers after them, each in alphabetical order", () => {
    const fict = carriers.map((c) => c.fictional);
    expect(fict.indexOf(true)).toBeGreaterThan(0);
    expect(fict.slice(fict.indexOf(true)).every(Boolean)).toBe(true);
    const real = carriers.filter((c) => !c.fictional).map((c) => c.label);
    expect(real).toEqual([...real].sort((a, b) => a.localeCompare(b)));
  });

  it("keeps plans of the same carrier apart by option and orders years newest first", () => {
    const metlife = carriers.find((c) => c.label.includes("MetLife"))!;
    expect(metlife.plans.map((p) => p.label)).toContain("The MetLife Federal Dental Plan (FEDVIP brochure 02AP-11), High Option");
    expect(metlife.plans.map((p) => p.label)).toContain("The MetLife Federal Dental Plan (FEDVIP brochure 02AP-11), Standard Option");
    const twoYears = groupPlans([
      { plan_code: "X25", title: "X 2025", insurer: "X Co", plan_name: "X Plan", option: "Standard", plan_year: 2025, is_fictional: false } as PlanSummary,
      { plan_code: "X26", title: "X 2026", insurer: "X Co", plan_name: "X Plan", option: "Standard", plan_year: 2026, is_fictional: false } as PlanSummary,
    ]);
    expect(twoYears[0].plans[0].years.map((y) => y.code)).toEqual(["X26", "X25"]);
    expect(firstCode(twoYears[0])).toBe("X26");
  });

  it("never places an upload ref in the preset grouping", () => {
    expect(locatePlan(carriers, "upload:abc")).toBeNull();
    expect(locatePlan(carriers, "")).toBeNull();
  });

  it("falls back to honest labels when the document states no carrier or option", () => {
    const [c] = groupPlans([{ plan_code: "UPX", title: "certificate.pdf", insurer: null as unknown as string, plan_name: "certificate.pdf", option: null as unknown as string, plan_year: null as unknown as number, is_fictional: false } as PlanSummary]);
    expect(c.label).toBe("Carrier not stated");
    expect(c.plans[0].label).toBe("certificate.pdf");
    expect(c.plans[0].years[0].year).toBeNull();
  });
});

describe("labels and lookups", () => {
  it("formats the fast-path option with the fictional word and the upload option with its version label", () => {
    expect(fastPathLabel({ title: "Harborview", is_fictional: true })).toBe("Harborview (fictional)");
    expect(fastPathLabel({ title: "NCFlex", is_fictional: false })).toBe("NCFlex");
    expect(uploadLabel({ version_label: "UP1", title: "harborview_certificate.pdf" })).toBe("UP1 · harborview_certificate.pdf");
    expect(planLabel({ plan_name: "P", option: "", title: "T" })).toBe("P");
  });

  it("finds a summary in either list without mixing them", () => {
    const plans = [{ plan_code: "ML26", title: "a" } as PlanSummary];
    const uploads = [{ plan_code: "upload:1", title: "b", version_label: "UP1" } as never];
    expect(summaryFor("ML26", plans, uploads)?.title).toBe("a");
    expect(summaryFor("upload:1", plans, uploads)?.title).toBe("b");
    expect(summaryFor("ZZ", plans, uploads)).toBeNull();
  });
});

describe("dollarsToCents", () => {
  it("converts typed dollars to integer cents and keeps empty as null (never 0)", () => {
    expect(dollarsToCents("125.00")).toBe(12500);
    expect(dollarsToCents("$1,150")).toBe(115000);
    expect(dollarsToCents("82.5")).toBe(8250);
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("   ")).toBeNull();
  });
  it("rejects what is not an amount", () => {
    expect(dollarsToCents("abc")).toBeUndefined();
    expect(dollarsToCents("-5")).toBeUndefined();
    expect(dollarsToCents("1.234")).toBeUndefined();
  });
});

describe("compact picker labels (layout-8, slop-20; orchestrator note 3)", () => {
  const ml26 = { title: "MetLife NCFlex Dental — Classic Option, plan year 2026 (State of North Carolina)", is_fictional: false, option: "Classic Option", plan_year: 2026 };
  const fm26h = { title: "The MetLife Federal Dental Plan 2026 — High Option (FEDVIP, nationwide)", is_fictional: false, option: "High Option", plan_year: 2026 };
  const hb26 = { title: "Harborview Dental PPO 2026 — fictional demonstration plan", is_fictional: true, option: "Standard", plan_year: 2026 };
  it("keeps the name part, then the option and year (once), with the fictional word", () => {
    expect(fastPathLabel(ml26)).toBe("MetLife NCFlex Dental · Classic Option 2026");
    expect(fastPathLabel(fm26h)).toBe("The MetLife Federal Dental Plan 2026 · High Option");
    expect(fastPathLabel(hb26)).toBe("Harborview Dental PPO 2026 · Standard (fictional)");
    expect(fastPathLabel(ml26).length).toBeLessThan(ml26.title.length);
  });
  it("keeps the full title for the tooltip", () => {
    expect(fullPlanLabel(ml26)).toBe(ml26.title);
    expect(fullPlanLabel(hb26)).toBe(`${hb26.title} (fictional)`);
  });
});
