// Shared upload/extraction types, verbatim from docs/ORALCOMPASS_DESIGN_SPEC.md §7.5. Frozen on day 1 by the foundation agent.
import type { Evidence } from "./types";

export interface ExtractedField {
  field_path: string;            // e.g. "deductible_individual", "classes[1].plan_share_bp_in", "class_of.crown", "frequency[0]"
  label: string;                 // "Deductible (per person)"
  landmark: "harbor" | "bridge" | "cove" | "lookout" | "rules";
  unit: "cents" | "bp" | "months" | "month_index" | "text" | "bool" | "list";
  proposed_value: unknown | null;
  page: number | null; page_note?: string | null; quote: string | null; quote_verified: boolean;
  confidence: "confirmed" | "likely" | "needs_review" | "not_found";
  evidence_status: Evidence; review_status: "quote_verified_in_text" | "needs_review" | "user_confirmed" | null;
  candidates: { value: unknown; quote: string; page: number }[];
  required: boolean;
  decision: null | { kind: "confirmed" | "edited" | "not_in_document" | "candidate"; value?: unknown; source?: string; candidate_index?: number; at: string };
}
export type ExtractionStatus = { status: "queued"|"reading_text"|"redacting"|"identifying_fields"|"matching_rules"|"verifying_quotes"|"ready"|"failed"|"demo_no_model";
  stage_index: number; stages: { key: string; label: string; done: boolean }[]; pages: number; pages_done: number; quotes_total: number; quotes_verified: number;
  fields: ExtractedField[]; reason?: string; mode: "demo" | "live"; model?: string };
