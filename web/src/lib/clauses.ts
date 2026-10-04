/**
 * The Documents view's clause list (slop-23; pure, tested in lib/clauses.test.ts). The evidence API lists one clause per plan field it
 * supports, so the same sentence can appear once per field, captioned with a raw field path ("catalog eligibility cite"). Here:
 * - `clauseFieldLabel`: a field path in plain words ("Who can enroll", "Coverage class: Silver filling");
 * - `clauseSection`: Costs · Coverage · Limits · Eligibility and dates · Other notes;
 * - `groupClauses`: one row per distinct sentence (doc + page + quote) listing every field it supports, grouped by section in that order.
 */

export const PROCEDURE_NAMES: Record<string, string> = {
  exam: "Periodic oral evaluation", cleaning: "Adult cleaning", bitewing_xrays: "Bitewing x-rays", fluoride_child: "Fluoride treatment (child)",
  sealant: "Sealant", composite: "Composite filling", amalgam: "Amalgam filling", extraction_simple: "Simple extraction",
  extraction_surgical: "Surgical extraction", scaling_root_planing: "Scaling and root planing", root_canal_molar: "Root canal, molar",
  crown: "Crown, porcelain or ceramic", cast_crown: "Crown, full cast metal", denture_partial: "Partial denture", implant: "Dental implant",
  night_guard: "Night guard",
};

const PREMIUM_TIERS: Record<string, string> = {
  employee_only: "employee only", employee_spouse: "employee and spouse", employee_children: "employee and children",
  employee_plus_dependents: "employee and dependents", family: "family",
};

const FIXED: Record<string, string> = {
  "alternate_benefit": "Alternate benefit", "alternate_benefit.rule": "Alternate benefit rule",
  "annual_max": "Annual maximum", "annual_max_out": "Annual maximum out of network", "annual_max_rule": "Annual maximum rule",
  "benefit_year_start_month": "Benefit year start",
  "catalog.effective_dates": "Plan dates", "catalog.effective_dates.benefit_period": "Benefit period", "catalog.eligibility": "Who can enroll",
  "catalog.governing_document": "Governing document", "catalog.network": "Network", "catalog.where_offered": "Where the plan is offered",
  "classes": "Coverage class", "classes.plan_share_bp_in": "Plan share in network", "classes.plan_share_bp_out": "Plan share out of network",
  "deductible_family": "Family deductible", "deductible_individual": "Deductible per person", "deductible_individual_out": "Deductible out of network",
  "deductible_waiver": "When the deductible is waived", "dos_rule": "Date of service rule", "frequency": "How often a service is covered",
  "missing_tooth": "Missing tooth rule", "oon_rule": "Out-of-network payment", "oon_rule.balance_billing": "Balance billing",
  "oon_rule.certificate": "Out-of-network payment (certificate)", "oon_rule.footnote": "Out-of-network footnote", "oon_rule.in_network": "In-network payment",
  "oon_rule.payment_basis": "Out-of-network payment basis", "oon_rule.plan_allowance": "Plan allowance", "oon_rule.section4": "Out-of-network payment (section 4)",
  "reuse_terms": "Reuse terms", "unsupported_rules": "A rule the calculation does not model", "waiting_months": "Waiting period",
};

const PER_PROCEDURE: Record<string, string> = {
  allowed_amounts: "Allowed amount", class_of: "Coverage class", excluded: "Exclusion", procedure_codes: "Procedure code",
};

/** `catalog.eligibility_cite` / `classes[2].plan_share_bp_in.cite` → the field path without index or cite suffix. */
export function fieldStem(field: string): string {
  return field.replace(/\[\d*\]/g, "").replace(/[._]?cite$/, "").replace(/\.$/, "");
}

export function clauseFieldLabel(field: string): string {
  const stem = fieldStem(field);
  if (FIXED[stem]) return FIXED[stem];
  const [head, key, ...rest] = stem.split(".");
  if (PER_PROCEDURE[head] && key) return `${PER_PROCEDURE[head]}: ${PROCEDURE_NAMES[key] ?? key.replace(/_/g, " ")}`;
  if (head === "premium_monthly" && key) return `Monthly premium, ${PREMIUM_TIERS[key] ?? key.replace(/_/g, " ")}`;
  if (FIXED[head]) return rest.length || key ? `${FIXED[head]} (${[key, ...rest].join(" ").replace(/_/g, " ")})` : FIXED[head];
  const words = stem.replace(/[._]/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : field;
}

export type ClauseSection = "costs" | "coverage" | "limits" | "eligibility" | "other";
export const SECTION_ORDER: ClauseSection[] = ["costs", "coverage", "limits", "eligibility", "other"];
export const SECTION_TITLES: Record<ClauseSection, string> = {
  costs: "Costs", coverage: "Coverage", limits: "Limits", eligibility: "Eligibility and dates", other: "Other notes",
};

export function clauseSection(field: string): ClauseSection {
  const head = fieldStem(field).split(".")[0];
  if (/^(premium_monthly|deductible|annual_max|allowed_amounts|oon_rule)/.test(head)) return "costs";
  if (/^(class_of|classes|procedure_codes|excluded|alternate_benefit)/.test(head)) return "coverage";
  if (/^(frequency|waiting_months|missing_tooth|dos_rule)/.test(head)) return "limits";
  if (/^(catalog|benefit_year_start_month)/.test(head)) return "eligibility";
  return "other";
}

export interface ClauseLike { doc: string; page: number | null; quote: string; field: string }
export interface ClauseRow<T extends ClauseLike> { key: string; first: T; all: T[]; labels: string[] }
export interface ClauseGroup<T extends ClauseLike> { section: ClauseSection; title: string; rows: ClauseRow<T>[] }

/** One row per distinct sentence (its first field decides the section), sections in SECTION_ORDER, rows in the input order. */
export function groupClauses<T extends ClauseLike>(clauses: T[]): ClauseGroup<T>[] {
  const rows = new Map<string, ClauseRow<T>>();
  for (const c of clauses) {
    const key = `${c.doc}|${c.page ?? ""}|${c.quote.replace(/\s+/g, " ").trim().toLowerCase()}`;
    const label = clauseFieldLabel(c.field);
    const row = rows.get(key);
    if (row) { row.all.push(c); if (!row.labels.includes(label)) row.labels.push(label); }
    else rows.set(key, { key, first: c, all: [c], labels: [label] });
  }
  const bySection = new Map<ClauseSection, ClauseRow<T>[]>();
  for (const r of rows.values()) {
    const s = clauseSection(r.first.field);
    bySection.set(s, [...(bySection.get(s) ?? []), r]);
  }
  return SECTION_ORDER.filter((s) => bySection.has(s)).map((s) => ({ section: s, title: SECTION_TITLES[s], rows: bySection.get(s)! }));
}

/** The document card's meta line: only the parts the document states, joined with " · " (never a leading dot or "Not stated" mid-line). */
export function docMetaLine(parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(" · ");
}
