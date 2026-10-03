export type Evidence = "DOC" | "USER" | "ASSUMED" | "AMBIGUOUS" | "UNKNOWN" | "CONFLICT";

export interface Cite { page: number; quote: string; doc?: string; page_note?: string }
export interface VJson<T = unknown> { value: T | null; status: Evidence; cite?: Cite | null; note?: string }

export interface PlanFixture {
  plan_code: string;
  title: string;
  is_fictional: boolean;
  demo_label?: string;
  source_document: { title: string; version_label: string; sha256: string; pages: number | null; path?: string; url?: string | null };
  catalog?: { carrier: string; plan_name: string; option: string; plan_year: number; where_offered: { text: string }; eligibility: { text: string }; verification: { date: string; method: string; fields_unknown: string[] } };
  deductible_individual: VJson<number>;
  deductible_waived_classes: string[];
  annual_max: VJson<number>;
  benefit_year_start_month: VJson<number>;
  classes: { name: string; plan_share_bp_in: VJson<number>; procedures_text: string[]; cite?: Cite }[];
  class_of: Record<string, VJson<string>>;
  allowed_amounts: Record<string, VJson<number>>;
  alternate_benefit: { status: Evidence; cite?: Cite; conditions: { procedure_key: string; condition: string; basis_key: string | null }[]; note?: string };
  waiting_months: VJson<Record<string, number>>;
  frequency: { procedure_key: string; clock: string; n: number; cite?: Cite }[];
  oon_rule: VJson<{ in: string; out: string } | string>;
  dos_rule: VJson<string>;
  premium_monthly: Record<string, VJson<number>>;
}

export interface Step { label: string; cents: number; owner: string; rule: string; stitch: string | null }
export interface LedgerLine {
  label: string; status: "estimate" | "unresolved" | "not_covered"; steps: Step[]; patient_cents: number | null; plan_cents: number | null;
  plan_is_upper_bound: boolean; flags: string[]; remaining_after: { deductible_cents?: number; annual_max_cents?: number }; benefit_year: number | null;
}
export interface Ledger {
  status: "estimate" | "unresolved"; lines: LedgerLine[]; patient_total_cents: number | null; plan_total_cents: number | null;
  plan_total_is_upper_bound: boolean; flags: string[]; not_provided: string[]; assumptions: string[]; order_note: string; could_change: string;
}
export interface Movers { range: [number, number] | null; movers: { unknown: string; impact_cents: number | null; zero_impact: boolean }[]; unresolved_reasons: string[] }
export interface EstimateResponse { id: string; plan_ref: string; ledger: Ledger; movers: Movers; footer: string }

export interface GridCell { text: string; badge: Evidence; cite: string | null; quote?: string; pct?: number }
export interface GridRow { topic: string; cells: GridCell[]; differences: string }
export interface ComparisonResponse { id: string; plan_refs: string[]; result: { columns: string[]; grid: GridRow[]; ledgers: Record<string, Ledger>; note: string }; footer: string; banner: string }

/** A stitch is one cited sentence in one document: scoped id = `${doc}#${n}` where n is assigned in page order. */
export interface Stitch { id: string; doc: string; n: number; page: number; quote: string; topic: string; ruleCodes: string[] }
