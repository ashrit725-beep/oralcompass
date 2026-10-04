/**
 * Types for the two AI features of addendum D.5 (api/app/treatment_reader.py, api/app/explain.py). Kept apart from the frozen `types.ts`
 * contracts so the features merge without touching them. The model never produces an amount the engine uses: the reader returns fees as
 * written (cents only when the written fee carries a currency sign or sits in a fee column) and the explainer returns one sentence of words.
 */
import type { PlanRef } from "./types";

export type ReadConfidence = "printed_code" | "wording" | "ambiguous" | "not_matched";
export interface ReadCandidate { key: string; name: string; basis: "printed code" | "wording" }
export interface ReadItem {
  procedure_as_written: string; tooth: string | null; surface: string | null; quantity: number; fee_as_written: string | null; fee_cents: number | null;
  code_as_written: string | null; date_as_written: string | null; quote: string; quote_verified: boolean | null;
  procedure_key: string | null; candidates: ReadCandidate[]; confidence: ReadConfidence; match_basis: string; notes: string[];
}
export interface ReadStage { key: string; label: string; done: boolean }
export interface ReadResponse {
  mode: "demo" | "live"; model?: string; source: "text" | "pdf" | "image"; items: ReadItem[]; ignored_text: string[];
  redaction: { removed: string[]; image_not_redacted: boolean }; ribbon: string | null; note: string | null; stages: ReadStage[];
  fixture: string | null; dropped_unverified: number; limited?: string;
}
export interface ReadSample { id: string; label: string; text: string }
export interface ConfirmItem { procedure_key: string; procedure_as_written: string; tooth: string | null; quantity: number; fee_cents: number; code_as_written: string | null; date_as_written?: string | null }

export interface ExplainRequest { plan_ref: PlanRef; stitch?: string; quote?: string; field_path?: string }
export interface ExplainResponse {
  mode: "demo" | "live"; sentence: string; refs: { kind: "clause"; stitch: string; field: string }[]; cached: boolean; label: string; topic: string; model?: string; reason?: string;
}
