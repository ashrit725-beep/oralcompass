import type { PlanRef, PlanSummary, UploadedPlanSummary } from "./types";
import { isUpload } from "./types";

/**
 * Pure helpers for the plan pickers (spec §7.2): the carrier → plan → year grouping of `GET /plans` summaries, labels for the
 * grouped fast-path `<select>` (option values are plan codes), and the local type extensions this view needs for uploaded plans.
 * No fetching, no formatting of money: the view decides what to show. Unit-tested in src/__tests__/plan-catalog.test.ts.
 */

export interface CatalogYear { year: number | null; code: string; summary: PlanSummary }
export interface CatalogPlan { key: string; label: string; years: CatalogYear[] }
export interface CatalogCarrier { key: string; label: string; fictional: boolean; plans: CatalogPlan[] }

const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);

/** "plan_name, option" (the option is omitted when the document states none). */
export function planLabel(p: Pick<PlanSummary, "plan_name" | "option" | "title">): string {
  const name = text(p.plan_name, text(p.title, "Plan"));
  const option = text(p.option, "");
  return option ? `${name}, ${option}` : name;
}

/**
 * The option text of the plan pickers, compact enough for a closed native select (layout-8 / orchestrator note 3): the title's name part
 * (before " — "), then the option and plan year from the summary, with the fictional word so the list stays honest. The full title goes
 * in the option's `title` attribute (`fullPlanLabel`); option VALUES stay the plan codes. Without a " — " the title is used as written.
 */
export function fastPathLabel(p: Pick<PlanSummary, "title" | "is_fictional"> & Partial<Pick<PlanSummary, "option" | "plan_year">>): string {
  const [name, rest] = p.title.split(" — ");
  let label = p.title;
  if (rest !== undefined) {
    const option = text(p.option, "");
    const year = typeof p.plan_year === "number" && !name.includes(String(p.plan_year)) ? String(p.plan_year) : "";
    const tail = [option, year].filter(Boolean).join(" ");
    label = tail ? `${name} · ${tail}` : name;
  }
  return `${label}${p.is_fictional ? " (fictional)" : ""}`;
}

/** The full title for a picker option's tooltip and the visible "selected plan" line. */
export function fullPlanLabel(p: Pick<PlanSummary, "title" | "is_fictional">): string {
  return `${p.title}${p.is_fictional ? " (fictional)" : ""}`;
}

/** The option text for a published upload: "UP1 · filename". */
export function uploadLabel(u: Pick<UploadedPlanSummary, "version_label" | "title">): string {
  return `${u.version_label} · ${u.title}`;
}

/**
 * Carrier → plan (name + option) → year. Real carriers first (alphabetical), fictional carriers after them (they render under one
 * optgroup); plans alphabetical within a carrier; years newest first. Deterministic, so the three selects never reorder on reload.
 */
export function groupPlans(plans: PlanSummary[]): CatalogCarrier[] {
  const carriers = new Map<string, CatalogCarrier>();
  for (const p of plans) {
    const carrierLabel = text(p.insurer, "Carrier not stated");
    const key = `${p.is_fictional ? "f" : "r"}:${carrierLabel}`;
    let c = carriers.get(key);
    if (!c) { c = { key, label: carrierLabel, fictional: !!p.is_fictional, plans: [] }; carriers.set(key, c); }
    const label = planLabel(p);
    let plan = c.plans.find((x) => x.label === label);
    if (!plan) { plan = { key: `${key}|${label}`, label, years: [] }; c.plans.push(plan); }
    plan.years.push({ year: typeof p.plan_year === "number" ? p.plan_year : null, code: p.plan_code, summary: p });
  }
  const list = [...carriers.values()];
  for (const c of list) {
    c.plans.sort((a, b) => a.label.localeCompare(b.label));
    for (const pl of c.plans) pl.years.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || a.code.localeCompare(b.code));
  }
  list.sort((a, b) => Number(a.fictional) - Number(b.fictional) || a.label.localeCompare(b.label));
  return list;
}

/** Where a plan code sits in the grouping (null for unknown codes and upload refs). */
export function locatePlan(carriers: CatalogCarrier[], code: PlanRef): { carrier: CatalogCarrier; plan: CatalogPlan; year: CatalogYear } | null {
  if (!code || isUpload(code)) return null;
  for (const carrier of carriers) for (const plan of carrier.plans) for (const year of plan.years) if (year.code === code) return { carrier, plan, year };
  return null;
}

/** The code the cascade lands on when the carrier changes (its first plan's newest year) or the plan changes (its newest year). */
export function firstCode(carrier: CatalogCarrier | undefined, plan?: CatalogPlan): string | null {
  const pl = plan ?? carrier?.plans[0];
  return pl?.years[0]?.code ?? null;
}

/** Fields the API adds to an uploaded plan's summary beyond the frozen `UploadedPlanSummary` (uploads.py `upload_summary`). */
export interface UploadSummaryExtras { versions?: string[]; banner?: string; has_stored_pdf?: boolean }
export type UploadSummary = UploadedPlanSummary & UploadSummaryExtras;

/** Fields `GET /me/plans/{id}/evidence` adds beyond the frozen `PlanEvidence` (uploads.py `my_plan_evidence`). */
export interface UploadEvidenceExtras {
  version_label?: string;
  ignored_wording?: { page: number; quote: string }[];
  unmatched_wording?: { wording: string; context?: string }[];
  notes?: { ignored_wording?: string; unmatched_wording?: string };
}

/** Which Preset/Upload mode a plan ref belongs to. */
export const modeOf = (ref: PlanRef): "preset" | "upload" => (isUpload(ref) ? "upload" : "preset");

/** The summary for a ref from either list (presets from GET /plans, uploads from GET /me/plans). */
export function summaryFor(ref: PlanRef, plans: PlanSummary[], uploads: UploadSummary[]): PlanSummary | UploadSummary | null {
  return plans.find((p) => p.plan_code === ref) ?? uploads.find((u) => u.plan_code === ref) ?? null;
}

/** Dollars typed into a form → integer cents, or null when the field is empty. NaN and negatives are rejected (undefined). */
export function dollarsToCents(input: string): number | null | undefined {
  const s = input.trim().replace(/[$,\s]/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return undefined;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}
