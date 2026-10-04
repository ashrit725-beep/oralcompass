export type Evidence = "DOC" | "USER" | "ASSUMED" | "AMBIGUOUS" | "UNKNOWN" | "CONFLICT";

export interface Cite { page: number; quote: string; doc?: string; page_note?: string; section?: string | null; fact_id?: string | null }
export interface VJson<T = unknown> { value: T | null; status: Evidence; cite?: Cite | null; note?: string; unlimited?: boolean }

export interface PlanFixture {
  plan_code: string;
  title: string;
  is_fictional: boolean;
  demo_label?: string;
  source_document: { title: string; version_label: string; sha256: string; pages: number | null; path?: string | null; url?: string | null; publisher?: string; document_date?: string | null; document_type?: string; retrieved_at?: string; access_limits?: string[]; reuse_terms?: string | null; source_id?: string };
  secondary_documents?: { version_label: string; title: string; url: string; document_date?: string | null; document_type?: string }[];
  catalog?: { carrier: string; plan_name: string; option: string; plan_year: number; region?: string; network?: string | { text: string; cite?: Cite };
              effective_dates?: { start?: string | null; end?: string | null; text?: string; cite?: Cite }; currency_note?: string;
              where_offered: { text: string; cite?: Cite | null }; eligibility: { text: string; cite?: Cite | null }; verification?: { date: string; method?: string; note?: string; fields_unknown?: string[] } };
  deductible_individual: VJson<number>;
  deductible_family?: VJson<number>;
  deductible_individual_out?: VJson<number>;
  deductible_waived_classes: string[];
  deductible_waiver_note?: string;
  annual_max: VJson<number>;
  annual_max_out?: VJson<number>;
  annual_max_exempt_classes?: string[];
  benefit_year_start_month: VJson<number>;
  classes: { name: string; plan_share_bp_in: VJson<number>; plan_share_bp_out?: VJson<number>; procedures_text: string[]; cite?: Cite; note?: string }[];
  class_of: Record<string, VJson<string>>;
  allowed_amounts: Record<string, VJson<number>>;
  allowed_amounts_note?: string;
  alternate_benefit: { status: Evidence; cite?: Cite; conditions: { procedure_key: string; condition: string; basis_key: string | null; text?: string }[]; note?: string };
  waiting_months: VJson<Record<string, number>>;
  frequency: { procedure_key: string; clock: string; n: number; cite?: Cite; period_as_printed?: string; note?: string }[];
  excluded?: Record<string, VJson<boolean>>;
  missing_tooth?: { present: boolean | null; status: Evidence; note?: string };
  oon_rule: VJson<{ in: string; out: string } | string>;
  dos_rule: VJson<string>;
  premium_monthly: Record<string, VJson<number>>;
  unsupported_rules?: { quote: string; page: number; page_note?: string; doc?: string; reason: string }[];
  conflicts?: { field: string; a: { value: string; quote: string; doc: string; date: string }; b: { value: string; quote: string; doc: string; date: string }; note: string }[];
  procedure_codes?: Record<string, { code: string; descriptor_as_printed: string; review: boolean; cite: Cite }>;
}

export interface Step { label: string; cents: number; owner: string; rule: string; stitch: string | null }
export interface LedgerLine {
  label: string; status: "estimate" | "unresolved" | "not_covered"; steps: Step[]; patient_cents: number | null; plan_cents: number | null;
  plan_is_upper_bound: boolean; flags: string[]; remaining_after: { deductible_cents?: number | null; annual_max_cents?: number | null }; benefit_year: number | null;
  treatment_item_id?: string; procedure_key?: string;     // added by the API (records.py) on saved estimates; optional on the client
}
export interface Ledger {
  status: "estimate" | "unresolved"; lines: LedgerLine[]; patient_total_cents: number | null; plan_total_cents: number | null;
  plan_total_is_upper_bound: boolean; flags: string[]; not_provided: string[]; assumptions: string[]; order_note: string; could_change: string;
}
export interface Movers { range: [number, number] | null; movers: { unknown: string; impact_cents: number | null; zero_impact: boolean }[]; unresolved_reasons: string[] }
export interface EstimateResponse { id: string; plan_ref: string; ledger: Ledger; movers: Movers; footer: string }


/** A stitch is one cited sentence in one document: scoped id = `${doc}#${n}` where n is assigned in page order. */
export interface Stitch { id: string; doc: string; n: number; page: number; quote: string; topic: string; ruleCodes: string[]; pageNote?: string; /** additive: the document section the quote sits in (e.g. a table row) */ section?: string; /** additive: the plan option column the fact was read from (e.g. "Classic") */ option?: string }

// ---------- records (owner-scoped, from the API) ----------
export type CheckpointStatus = "completed" | "current" | "upcoming" | "awaiting_info";
export interface DatedValue { value: string | null; source: "user" | "dental_team" | "document" | "benefit_statement" | string }
export interface CheckpointAction { type: "open_landmark" | "enter_date" | "add_document" | "mark_recorded"; target?: string; field?: string }
export interface Checkpoint {
  id: string; label: string; kind: string; status: CheckpointStatus; completed_by?: "user" | "dental_team" | null; date?: DatedValue | null; detail: string;
  source?: { label: string; doc?: string; page?: number } | null; action?: CheckpointAction; due_date?: string | null; completed_at?: string | null;
  links?: { document?: string; landmark?: string; treatment_items?: string[]; estimate?: string } | null; user_note?: string;
}
export interface Stage {
  id: string; title: string; island: string; purpose: string; finance: { kind: string }; checkpoints: Checkpoint[];
  linked_treatment_items: string[]; instructions: { text: string; source: string; given_on?: string | null } | null;
  dates: { label: string; values: string[]; source: string } | null;
}
export interface Journey { id: string; label: string; is_sample: boolean; plan_ref: string | null; user_ref?: string | null; note: string; stages: Stage[]; created_from?: string }
export interface Progress { stages: { id: string; title: string; completed: number; total: number; label: string }[]; current_stage: string | null; label: string; note: string }
export interface JourneyLinks {
  treatment_items: Record<string, { id: string; procedure_key: string; procedure_name?: string; tooth?: string | null; status: string; dentist_fee_cents: number; allowed_cents: number | null; allowed_status?: string; allowed_source?: string | null; appointment_date?: string | null; planned_completion?: string | null }>;
  documents: Record<string, { id: string; type: string; label: string; extraction_status?: string }>;
  latest_estimate: { id: string; plan_code: string; status: string; calculated_at: string; user_estimated_payment_cents: number | null; insurer_estimated_payment_cents: number | null } | null;
}
export interface JourneyView { id: string; journey: Journey; progress: Progress; links: JourneyLinks; is_sample: boolean; sample_label: string | null; seeded_records?: Record<string, number> }

export interface Benefits {
  plan_code: string; coverage_start?: string | null; deductible_met_cents: number | null; benefits_used_cents: number | null; remaining_deductible_cents: number | null; remaining_max_cents: number | null;
  annual_max_unlimited?: boolean; derivation: Record<string, string>; source?: { type?: string; label?: string; date?: string; entered_by?: string }; last_updated?: string | null; claims: any[]; conflict?: { status: Evidence; note: string };
  remaining_deductible_out_cents?: number | null; remaining_max_out_cents?: number | null;
  // stored record fields the server echoes back (records.py BenefitsIn)
  network_default?: string | { value?: string | null } | null; deductible_met_out_cents?: number | null; benefits_used_out_cents?: number | null; coverage_end?: string | null;
}
export interface TreatmentItem {
  id: string; seed_id?: string; procedure_key: string; procedure_name?: string | null; tooth?: string | null; quantity: number; dentist_fee_cents: number; allowed_cents: number | null; allowed_status?: string; allowed_source?: string | null;
  code_as_written?: string | null; network?: string | null; appointment_date?: string | null; planned_prep?: string | null; planned_completion?: string | null; status: string; source: string;
  seeded_from_sample?: string | null;
}
export interface MissingInput { input: string; how: string; line?: string }
export interface SavedEstimate {
  id: string; plan_code: string; plan_version_sha256: string; calculated_at: string; status: "estimate" | "unresolved";
  inputs: { treatment_item_ids: string[]; benefits_snapshot: Benefits | null; hypotheticals: Record<string, unknown>; dos_rule: string; network: string | null; network_status: Evidence };
  ledger: Ledger; movers: Movers; insurer_estimated_payment_cents: number | null; user_estimated_payment_cents: number | null; plan_payment_is_upper_bound: boolean;
  assumptions: string[]; unknowns: string[]; missing_inputs: MissingInput[]; footer: string; sources: { plan_document: PlanDocument; evidence_endpoint: string };
}
export interface PlanDocument { version_label: string; title: string; publisher?: string; url?: string | null; document_type?: string; document_date?: string | null; pages?: number | null; retrieved_at?: string; stored_path?: string | null; has_stored_pdf: boolean; sha256?: string; access_limits?: string[]; reuse_terms?: string | null; role: "primary" | "secondary"; source_id?: string }
export interface Clause { n: number; field: string; doc: string; page: number; page_note?: string | null; section?: string | null; quote: string; fact_id?: string | null; review_status?: string | null }
export interface PlanEvidence {
  plan_code: string; documents: PlanDocument[]; clauses: Clause[]; conflicts: PlanFixture["conflicts"];
  // upload-only fields (uploads.py evidence for a published document)
  version_label?: string; ignored_wording?: { page: number; quote: string }[]; unmatched_wording?: { wording: string; context?: string }[]; notes?: { ignored_wording?: string; unmatched_wording?: string };
}
export interface PlanSummary {
  plan_code: string; title: string; insurer: string; plan_name: string; option: string; plan_year: number; region: string; network: string | { text: string } | null; effective_dates: any; is_fictional: boolean; demo_label?: string | null;
  premium_monthly: Record<string, VJson<number>>; deductible_individual: VJson<number>; deductible_family: VJson<number>; annual_max: VJson<number>; currency_note?: string | null; has_stored_pdf: boolean;
  source_document: PlanFixture["source_document"]; secondary_documents: PlanFixture["secondary_documents"]; conflicts: PlanFixture["conflicts"]; eligibility?: { text: string }; where_offered?: { text: string };
}
export interface CoverageRule {
  procedure_key: string; plan_code: string; covered: boolean | null; category: string | null; category_status?: Evidence; status?: Evidence; note?: string; category_cite?: Cite | null; plan_pays_pct: number | null; you_pay_pct: number | null;
  coverage_cite?: Cite | null; plan_pays_pct_out?: number | null; deductible_applies?: boolean | null; deductible_cite?: Cite | null; counts_toward_annual_max?: boolean; annual_max_cite?: Cite | null;
  waiting?: { months: number | null; status: Evidence; cite?: Cite | null; note?: string }; frequency?: { clock: string; n: number; cite: Cite | null }[] | null;
  alternate_benefit?: { status: Evidence; conditions?: any[]; cite?: Cite | null; note?: string } | null; exclusion?: { text: string; cite: Cite | null };
  code_as_printed?: { code: string; descriptor: string; cite: Cite | null; review: boolean }; allowed_amount?: { value: number | null; status: Evidence; note: string };
}
export interface Procedure { key: string; name: string; category_hint: string; dentist_fee_cents: number; fee_source: string; tooth_or_area_relevant: boolean; external_codes?: { primary_code: string | null; review_required: boolean; review_reason?: string | null; distinct_codes_seen: string[]; candidates: number } }
export interface SourceItem { source_id: string; version_label: string | null; title: string; publisher: string; url: string; document_type: string; document_date: string | null; effective_period: any; scope: any; retrieved_at: string; retrieval_method: string; pages_total: number | null; reuse_terms: string | null; access_limits: string[]; counts: { facts: number; by_status: Record<string, number>; procedure_mappings: number; conflicts: number; gaps: number }; supports_plan_codes: string[]; gaps_count?: number }
export interface PrivateDocument { id: string; seed_id?: string; type: string; label: string; location?: string; extraction_status?: string; fields_needing_confirmation?: string[]; filename?: string; pages?: number; redaction_preview?: { text: string; removed: string[]; summary?: unknown } }

// ---------- day-1 frozen contracts (design spec §13.2; written by the foundation agent, built against by the map and upload/assistant agents) ----------
export type PlanRef = string;                                   // "ML26" | "upload:<document_id>"
export const isUpload = (r: PlanRef) => r.startsWith("upload:");
export const uploadId = (r: PlanRef) => (isUpload(r) ? r.slice("upload:".length) : r);
export interface UploadedPlanSummary extends PlanSummary { document_id: string; version_label: string; published_at: string; versions?: string[]; banner?: string }
export type ProcedureCategory = "preventive" | "basic" | "varies" | "major" | "major_excluded";
export type IslandKind = "start" | "procedure" | "visited" | "marginal" | "destination";
export type IslandState = "estimate" | "unresolved" | "not_covered" | "pending" | "visited" | "mentioned" | "frame";
export type CheckpointRule = "fee" | "N" | "AB" | "D" | "CO" | "M" | "L" | "total" | "X" | "W" | "F" | "missing";
export interface InsuranceCheckpointVM { key: string; rule: CheckpointRule; term: string; place: string; glyph: string; amountIn: number | null; change: number | null; amountOut: number | null;
  owner: "patient" | "plan" | "nobody" | "basis" | "info"; explanation: string; stitchLabel: string | null; stitch?: Stitch; badge: Evidence; stepIndexes: number[]; flags: string[]; split?: { plan: number; patient: number; planPct: number } }
export interface IslandVM { id: string; kind: IslandKind; state: IslandState; order: number; place: string; title: string; subtitle: string | null; category: ProcedureCategory | null;
  itemId?: string; item?: TreatmentItem; line?: LedgerLine; lineIndex?: number; checkpoints: InsuranceCheckpointVM[]; youPay: number | null; planPays: number | null; upperBound: boolean;
  missing: MissingInput[]; notices: string[]; soundingsAfter: { deductible: number | null; annualMax: number | null; unlimited: boolean } | null; claim?: Claim; stageIds: string[] }
export interface Claim { id: string; date: string; procedure_key: string; tooth?: string | null; dentist_fee_cents?: number | null; allowed_cents?: number | null; plan_paid_cents: number; patient_paid_cents?: number | null; deductible_applied_cents?: number; source: string }
export interface PassageVM { status: "empty" | "pending" | "estimate" | "unresolved"; start: IslandVM; islands: IslandVM[]; visited: IslandVM[]; marginal: IslandVM[]; destination: IslandVM;
  totals: { youPay: number | null; planPays: number | null; upperBound: boolean; range: [number, number] | null }; stepsCited: number; rulesNotStated: number }
export interface MapSelection { islandId: string; checkpointKey?: string }
/** Care-stage selection (a stage, optionally one of its checkpoints) from the Care timeline or the Overview list. */
export interface StageSelection { stageId: string; cpId?: string }
export interface JourneySelection { stage?: StageSelection; island?: MapSelection }
export interface AssistScope { plan_ref: PlanRef; estimate_id?: string; treatment_item_id?: string; line_index?: number; step_key?: string; checkpoint_key?: string; stitch?: string; journey_id?: string; }
export type AssistRef = { kind: "step"; line_index: number; step_index: number; label: string } | { kind: "line_total"; line_index: number; which: "patient" | "plan" } | { kind: "field"; path: string } | { kind: "clause"; stitch: string; rule?: string } | { kind: "estimate_total"; which: "patient" | "plan" } | { kind: "quick_estimate"; which: "fee" | "plan" | "patient"; cents?: number | null; evidence?: Evidence; label?: string };
export type AssistBlock = { type: "sentence"; text: string; refs: AssistRef[] } | { type: "clarify"; text?: string; options: { label: string; scope_patch: Partial<AssistScope> }[] } | { type: "template"; key: "advice_question" | "out_of_scope"; label?: string; text: string };
export interface AssistResponse { mode: "demo" | "live"; model?: string; ribbon?: string | null; intent: string; blocks: AssistBlock[]; suggested: string[]; guard: { dropped: number; grounding_failures: number }; tools_used: string[] }
export interface UploadResponse { id: string; sha256: string; pages: number; filename: string; extraction_status: string; redaction_preview: { text: string; removed: string[]; note?: string }; demo_fixture_match: boolean; mode?: "demo" | "live" }
/** One row of `PUT /me/documents/{id}/review` (spec §7.3). */
export interface ReviewDecision { field_path: string; decision: "confirmed" | "edited" | "not_in_document" | "candidate"; value?: unknown; source?: string; candidate_index?: number }
export type { ExtractedField, ExtractionStatus } from "./upload-types";    // the §7.5 definitions live in web/src/lib/upload-types.ts
