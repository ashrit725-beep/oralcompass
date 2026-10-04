import type {
  AssistResponse, AssistScope, Benefits, ComparisonResponse, CoverageRule, EstimateResponse, ExtractionStatus, JourneyView, PlanEvidence, PlanFixture, PlanRef, PlanSummary,
  PrivateDocument, Procedure, ReviewDecision, SavedEstimate, SourceItem, TreatmentItem, UploadResponse, UploadedPlanSummary,
} from "./types";
import { isUpload, uploadId } from "./types";
import { DEV_AUTH, withAuth } from "./auth";

export class ApiError extends Error {
  constructor(public status: number, public path: string, public body?: unknown) { super(`${status} ${path}`); }
}

/**
 * Every API request: same-origin credentials (the production session cookie) plus, in dev builds only, the X-Dev-User header (lib/auth.ts).
 * In production the very first request runs alone, so the session cookie it receives is the one every later request carries (parallel
 * first requests would each be issued a different session).
 */
let sessionReady: Promise<unknown> | null = null;
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const go = () => fetch(`/api${path}`, withAuth(init));
  if (DEV_AUTH) return go();
  if (!sessionReady) {
    const first = go();
    sessionReady = first.catch(() => undefined);
    return first;
  }
  await sessionReady;
  return go();
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(path, { ...init, headers: { "Content-Type": "application/json", ...((init?.headers as Record<string, string>) || {}) } });
  if (!r.ok) throw new ApiError(r.status, path, await r.json().catch(() => undefined));
  return r.json();
}
const post = <T,>(path: string, body: unknown) => req<T>(path, { method: "POST", body: JSON.stringify(body) });
const patch = <T,>(path: string, body: unknown) => req<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const put = <T,>(path: string, body: unknown) => req<T>(path, { method: "PUT", body: JSON.stringify(body) });

/** Multipart POST (file uploads). No Content-Type header: the browser sets the boundary. Document bytes never touch logs. */
async function multipart<T>(path: string, fields: Record<string, string | number | Blob>): Promise<T> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v instanceof Blob ? v : String(v));
  const r = await apiFetch(path, { method: "POST", body: fd });
  if (!r.ok) throw new ApiError(r.status, path, await r.json().catch(() => undefined));
  return r.json();
}

/** Body of PUT /me/benefits/{plan_ref} (records.py): the user's dated benefit statement figures, all optional. */
export interface BenefitsIn {
  coverage_start?: string | null; deductible_met_cents?: number | null; benefits_used_cents?: number | null; remaining_deductible_cents?: number | null; remaining_max_cents?: number | null;
  annual_max_unlimited?: boolean; source?: { type?: string; label?: string; date?: string; entered_by?: string }; claims?: unknown[];
  network_default?: string | null; deductible_met_out_cents?: number | null; benefits_used_out_cents?: number | null; coverage_end?: string | null; last_updated?: string | null;
}

/** Binary GET with the caller's credentials (an uploaded document's stored PDF). */
async function blob(path: string): Promise<Blob> {
  const r = await apiFetch(path);
  if (!r.ok) throw new ApiError(r.status, path, await r.json().catch(() => undefined));
  return r.blob();
}

export const api = {
  health: () => req<{ ok: boolean; presets: string[]; real_presets: string[]; fictional_presets: string[]; llm_mode: "demo" | "live"; llm_model?: string; llm_cap_reached?: boolean }>("/health"),
  // public catalogs
  plans: () => req<{ items: PlanSummary[]; banner: string }>("/plans"),
  plan: (code: string) => req<{ summary: PlanSummary; model: PlanFixture }>(`/plans/${code}`),
  rules: (code: string, keys?: string[]) => req<{ plan_code: string; rules: CoverageRule[] }>(`/plans/${code}/rules${keys?.length ? `?procedure_keys=${keys.join(",")}` : ""}`),
  evidence: (code: string) => req<PlanEvidence>(`/plans/${code}/evidence`),
  procedures: () => req<{ items: Procedure[]; note: string }>("/procedures"),
  procedureCodes: (key: string) => req<any>(`/procedures/${key}/codes`),
  benchmarks: (key: string) => req<{ procedure_key: string; rows: any[]; source: any; mapping_review_required: boolean; note: string }>(`/procedures/${key}/benchmarks`),
  sources: () => req<{ items: SourceItem[]; retrieval_note: string }>("/sources"),
  dataReport: () => req<any>("/data/report"),
  // plan refs: a preset code or an uploaded, published plan ("upload:<document_id>", spec §7.1)
  planByRef: (ref: PlanRef) => (isUpload(ref) ? req<{ summary: PlanSummary; model: PlanFixture }>(`/me/plans/${uploadId(ref)}`) : req<{ summary: PlanSummary; model: PlanFixture }>(`/plans/${ref}`)),
  rulesByRef: (ref: PlanRef, keys?: string[]) => {
    const q = keys?.length ? `?procedure_keys=${keys.join(",")}` : "";
    return isUpload(ref) ? req<{ plan_code: string; rules: CoverageRule[] }>(`/me/plans/${uploadId(ref)}/rules${q}`) : req<{ plan_code: string; rules: CoverageRule[] }>(`/plans/${ref}/rules${q}`);
  },
  evidenceByRef: (ref: PlanRef) => (isUpload(ref) ? req<PlanEvidence>(`/me/plans/${uploadId(ref)}/evidence`) : req<PlanEvidence>(`/plans/${ref}/evidence`)),
  myPlans: () => req<{ items: UploadedPlanSummary[] }>("/me/plans"),
  // private records
  journeys: () => req<{ items: JourneyView[] }>("/journeys"),
  journeySamples: () => req<{ items: { id: string; label: string; plan_ref: string | null; stages: string[] }[]; note: string }>("/journeys/samples"),
  createJourney: (from: string) => post<JourneyView>("/journeys", { from }),
  journey: (id: string) => req<JourneyView>(`/journeys/${id}`),
  patchCheckpoint: (jid: string, cid: string, body: { status?: string; completed_by?: string; date?: string; date_source?: string; note?: string }) => patch<JourneyView>(`/journeys/${jid}/checkpoints/${cid}`, body),
  putInstructions: (jid: string, sid: string, body: { text: string; source: string; given_on?: string }) => put<JourneyView>(`/journeys/${jid}/stages/${sid}/instructions`, body),
  benefits: () => req<Benefits[]>("/me/benefits"),
  benefitsFor: (code: string) => req<Benefits>(`/me/benefits/${code}`),
  putBenefits: (ref: PlanRef, body: BenefitsIn) => put<Benefits>(`/me/benefits/${encodeURIComponent(ref)}`, body),
  treatmentItems: () => req<TreatmentItem[]>("/me/treatment-items"),
  patchItem: (id: string, body: Partial<TreatmentItem>) => patch<TreatmentItem>(`/me/treatment-items/${id}`, body),
  addItem: (body: Partial<TreatmentItem>) => post<TreatmentItem>("/me/treatment-items", body),
  estimateFromRecords: (plan_code: PlanRef, treatment_item_ids?: string[], hypotheticals?: Record<string, unknown>) => post<SavedEstimate>("/me/estimates", { plan_code, treatment_item_ids: treatment_item_ids ?? [], hypotheticals: hypotheticals ?? {} }),
  savedEstimates: () => req<SavedEstimate[]>("/me/estimates"),
  myDocuments: () => req<PrivateDocument[]>("/me/documents"),
  exportMe: () => req<Record<string, unknown[]>>("/me/export"),
  deleteMe: () => req<{ deleted: Record<string, number> }>("/me", { method: "DELETE" }),
  audit: () => req<{ ts: number; sub: string; action: string; type: string; id: string; outcome: string }[]>("/me/audit"),
  // uploads → extraction → review → publish (spec §7.3; api/app/uploads.py)
  uploadDocument: (file: File, sha256: string, pages: number, textPreview: string) => multipart<UploadResponse>("/me/documents/upload", { file, sha256, pages, text_preview: textPreview }),
  redaction: (id: string, extra_terms: string[]) => put<{ redaction_preview: { text: string; removed: string[] } }>(`/me/documents/${id}/redaction`, { extra_terms }),
  extract: (id: string) => post<{ status: string }>(`/me/documents/${id}/extract`, {}),
  extraction: (id: string) => req<ExtractionStatus>(`/me/documents/${id}/extraction`),
  documentFile: (id: string) => blob(`/me/documents/${id}/file`),
  review: (id: string, decisions: ReviewDecision[]) => put<{ fields: ExtractionStatus["fields"] }>(`/me/documents/${id}/review`, { decisions }),
  publish: (id: string) => post<{ plan_ref: PlanRef; version_label: string; published_at: string; sha256: string; summary: UploadedPlanSummary }>(`/me/documents/${id}/publish`, {}),
  // grounded assistant (spec §8.2; api/app/assistant.py)
  ask: (body: { message: string; scope: AssistScope }) => post<AssistResponse>("/me/assistant", body),
  // legacy (explicit lines/state) — used by Compare
  estimate: (body: unknown) => post<EstimateResponse>("/estimates", body),
  comparison: (body: unknown) => post<ComparisonResponse>("/comparisons", body),
  fixturePlan: async (code: string) => (await fetch(`/fixtures/plans/${code.toLowerCase()}.json`)).json() as Promise<PlanFixture>,
};
