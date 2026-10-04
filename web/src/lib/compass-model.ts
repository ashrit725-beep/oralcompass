import type { Benefits, Cite, Evidence, Ledger, PlanFixture, SavedEstimate } from "./types";

/**
 * Pure view-model for the Benefits compass (spec §4.6; addendum grafts: the panel is titled by the question it answers, filled from
 * fields; bullet-bar meters, never a radial dial). Nothing here computes money: every cents figure is copied from the plan document
 * (`plan.*`), the derived benefits record (`benefits.*`, computed on the server) or the engine's ledger (`remaining_after`).
 * The only arithmetic is the meter FRACTION (used ÷ limit, clamped to the track), which is a display proportion, not an amount.
 * Unit-tested in src/__tests__/compass-model.test.ts with the Alex (ML26) figures from CLAUDE.md rule 8.
 */

export interface MeterVM {
  /** The document's limit (DOC / UNKNOWN / AMBIGUOUS …) and its cite for the stitch chip. */
  limitCents: number | null;
  limitStatus: Evidence;
  limitCite: Cite | null;
  unlimited: boolean;
  /** What the statement reports (USER) and what the server derived from it (USER). */
  usedCents: number | null;
  remainingCents: number | null;
  derivation: string | null;
  /** The engine's `remaining_after` once the planned work is applied (null when no estimate, or unresolved). */
  afterCents: number | null;
  afterWaiting: boolean;
  /** Display proportions for the bar: 0..1 of the track, null when the limit is unknown or unlimited. */
  usedFraction: number | null;
  afterFraction: number | null;
}

export interface CoverageVM { name: string; pctIn: number | null; statusIn: Evidence; citeIn: Cite | null; pctOut: number | null; statusOut: Evidence | null; classCite: Cite | null;
  /** The document's own row heading for the class (the last part of the cited section, e.g. "Basic Services (row 2)"), so two rows the
   *  plan model names alike ("Type II", "Type II (50% row)") read as the document's rows (demo-18). Null when the cite has none. */
  section: string | null }

export interface RestrictionsVM {
  frequency: number;
  exclusions: number;
  waiting: { kind: "none" | "stated" | "not_stated" | "ambiguous"; months?: number; what?: string };
  alternate: "present" | "not_stated";
  unsupported: number;
}

export type Headline =
  | { kind: "after"; limitCents: number; answerCents: number }
  | { kind: "remaining"; limitCents: number; answerCents: number }
  | { kind: "no_usage"; limitCents: number }
  | { kind: "unresolved"; limitCents: number }
  | { kind: "unlimited" }
  | { kind: "unknown" };

export interface CompassVM { headline: Headline; deductible: MeterVM; annualMax: MeterVM; coverage: CoverageVM[]; restrictions: RestrictionsVM; conflict: Benefits["conflict"] | null }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const fraction = (part: number | null, whole: number | null) => (part == null || whole == null || whole <= 0 ? null : clamp01(part / whole));

/** The last ledger line that carries a `remaining_after` figure for the key, in ledger order (the engine applies lines in order). */
export function remainingAfterPlanned(ledger: Ledger | null | undefined, key: "deductible_cents" | "annual_max_cents"): number | null {
  if (!ledger) return null;
  for (let i = ledger.lines.length - 1; i >= 0; i--) {
    const v = ledger.lines[i].remaining_after?.[key];
    if (typeof v === "number") return v;
  }
  return null;
}

function meter(limit: PlanFixture["deductible_individual"], used: number | null | undefined, remaining: number | null | undefined, derivation: string | null | undefined, estimate: SavedEstimate | null, key: "deductible_cents" | "annual_max_cents"): MeterVM {
  const unlimited = !!limit.unlimited;
  const limitCents = unlimited ? null : limit.value;
  const resolved = estimate?.status === "estimate";
  const afterCents = resolved ? remainingAfterPlanned(estimate.ledger, key) : null;
  return {
    limitCents, limitStatus: limit.status, limitCite: limit.cite ?? null, unlimited,
    usedCents: used ?? null, remainingCents: remaining ?? null, derivation: derivation ?? null,
    afterCents, afterWaiting: !!estimate && !resolved,
    usedFraction: fraction(used ?? null, limitCents),
    afterFraction: afterCents == null || limitCents == null || limitCents <= 0 ? null : clamp01(1 - afterCents / limitCents),
  };
}

export function headlineFor(max: MeterVM): Headline {
  if (max.unlimited) return { kind: "unlimited" };
  if (max.limitCents == null) return { kind: "unknown" };
  if (max.afterCents != null) return { kind: "after", limitCents: max.limitCents, answerCents: max.afterCents };
  if (max.afterWaiting) return { kind: "unresolved", limitCents: max.limitCents };
  if (max.remainingCents != null) return { kind: "remaining", limitCents: max.limitCents, answerCents: max.remainingCents };
  return { kind: "no_usage", limitCents: max.limitCents };
}

export function restrictionsFor(plan: PlanFixture): RestrictionsVM {
  const w = plan.waiting_months;
  let waiting: RestrictionsVM["waiting"];
  if (w.status === "UNKNOWN") waiting = { kind: "not_stated" };
  else if (w.status === "AMBIGUOUS") waiting = { kind: "ambiguous" };
  else {
    const entries = Object.entries(w.value ?? {});
    if (entries.length === 0) waiting = { kind: "none" };
    else {
      const months = Math.max(...entries.map(([, m]) => m));
      const what = entries.filter(([, m]) => m === months).map(([k]) => k.replace(/_/g, " ")).join(", ");
      waiting = { kind: "stated", months, what };
    }
  }
  return {
    frequency: plan.frequency?.length ?? 0,
    exclusions: Object.keys(plan.excluded ?? {}).length,
    waiting,
    alternate: plan.alternate_benefit?.status === "DOC" || plan.alternate_benefit?.status === "USER" || plan.alternate_benefit?.status === "AMBIGUOUS" ? "present" : "not_stated",
    unsupported: plan.unsupported_rules?.length ?? 0,
  };
}

export function coverageFor(plan: PlanFixture): CoverageVM[] {
  return plan.classes.map((c) => ({
    name: c.name,
    pctIn: c.plan_share_bp_in.value == null ? null : c.plan_share_bp_in.value / 100,
    statusIn: c.plan_share_bp_in.status,
    citeIn: c.plan_share_bp_in.cite ?? null,
    pctOut: c.plan_share_bp_out?.value == null ? null : c.plan_share_bp_out.value / 100,
    statusOut: c.plan_share_bp_out?.status ?? null,
    classCite: c.cite ?? null,
    section: sectionLabel(c.plan_share_bp_in.cite?.section ?? c.cite?.section, c.name),
  }));
}

/** The last " — " part of a cited section heading, when it adds something to the class name. */
export function sectionLabel(section: string | null | undefined, name: string): string | null {
  if (!section) return null;
  const last = section.split(" — ").pop()?.trim() ?? "";
  return last && last !== name && !name.includes(last) ? last : null;
}

export function compassModel(plan: PlanFixture, benefits: Benefits | null, estimate: SavedEstimate | null): CompassVM {
  const deductible = meter(plan.deductible_individual, benefits?.deductible_met_cents, benefits?.remaining_deductible_cents, benefits?.derivation?.remaining_deductible, estimate, "deductible_cents");
  const annualMax = meter(plan.annual_max, benefits?.benefits_used_cents, benefits?.remaining_max_cents, benefits?.derivation?.remaining_max, estimate, "annual_max_cents");
  return { headline: headlineFor(annualMax), deductible, annualMax, coverage: coverageFor(plan), restrictions: restrictionsFor(plan), conflict: benefits?.conflict ?? null };
}

/**
 * The evidence badge for an engine total (a ledger's patient/plan total): the arithmetic rests on document rules and the user's records;
 * when the estimate carries hypotheticals every total is ASSUMED, otherwise the document's rules produced it (DOC). The per-step stitches
 * remain the primary evidence and stay one click away (CostTrail, pipeline).
 */
export function ledgerEvidence(e: { assumptions: string[] } | null | undefined): Evidence {
  return e && e.assumptions.length > 0 ? "ASSUMED" : "DOC";
}
