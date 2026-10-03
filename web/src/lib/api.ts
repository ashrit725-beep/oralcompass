import type {
  Benefits, ComparisonResponse, CoverageRule, EstimateResponse, JourneyView, PlanEvidence, PlanFixture, PlanSummary, PrivateDocument, Procedure, SavedEstimate, SourceItem, TreatmentItem,
} from "./types";

const DEV_USER = "demo-user";   // dev auth only (ORALCOMPASS_DEV_AUTH=1 on the API); production sends the Cognito JWT.

export class ApiError extends Error {
  constructor(public status: number, public path: string) { super(`${status} ${path}`); }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, { ...init, headers: { "Content-Type": "application/json", "X-Dev-User": DEV_USER, ...(init?.headers || {}) } });
  if (!r.ok) throw new ApiError(r.status, path);
  return r.json();
}
const post = <T,>(path: string, body: unknown) => req<T>(path, { method: "POST", body: JSON.stringify(body) });
const patch = <T,>(path: string, body: unknown) => req<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const put = <T,>(path: string, body: unknown) => req<T>(path, { method: "PUT", body: JSON.stringify(body) });

export const api = {
  health: () => req<{ ok: boolean; presets: string[]; real_presets: string[]; fictional_presets: string[] }>("/health"),
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
  // private records
  journeys: () => req<{ items: JourneyView[] }>("/journeys"),
  journeySamples: () => req<{ items: { id: string; label: string; plan_ref: string | null; stages: string[] }[]; note: string }>("/journeys/samples"),
  createJourney: (from: string) => post<JourneyView>("/journeys", { from }),
  journey: (id: string) => req<JourneyView>(`/journeys/${id}`),
  patchCheckpoint: (jid: string, cid: string, body: { status?: string; completed_by?: string; date?: string; date_source?: string; note?: string }) => patch<JourneyView>(`/journeys/${jid}/checkpoints/${cid}`, body),
  putInstructions: (jid: string, sid: string, body: { text: string; source: string; given_on?: string }) => put<JourneyView>(`/journeys/${jid}/stages/${sid}/instructions`, body),
  benefits: () => req<Benefits[]>("/me/benefits"),
  benefitsFor: (code: string) => req<Benefits>(`/me/benefits/${code}`),
  treatmentItems: () => req<TreatmentItem[]>("/me/treatment-items"),
  patchItem: (id: string, body: Partial<TreatmentItem>) => patch<TreatmentItem>(`/me/treatment-items/${id}`, body),
  addItem: (body: Partial<TreatmentItem>) => post<TreatmentItem>("/me/treatment-items", body),
  estimateFromRecords: (plan_code: string, treatment_item_ids?: string[], hypotheticals?: Record<string, unknown>) => post<SavedEstimate>("/me/estimates", { plan_code, treatment_item_ids: treatment_item_ids ?? [], hypotheticals: hypotheticals ?? {} }),
  savedEstimates: () => req<SavedEstimate[]>("/me/estimates"),
  myDocuments: () => req<PrivateDocument[]>("/me/documents"),
  exportMe: () => req<Record<string, unknown[]>>("/me/export"),
  deleteMe: () => req<{ deleted: Record<string, number> }>("/me", { method: "DELETE" }),
  audit: () => req<{ ts: number; sub: string; action: string; type: string; id: string; outcome: string }[]>("/me/audit"),
  // legacy (explicit lines/state) — used by Compare
  estimate: (body: unknown) => post<EstimateResponse>("/estimates", body),
  comparison: (body: unknown) => post<ComparisonResponse>("/comparisons", body),
  fixturePlan: async (code: string) => (await fetch(`/fixtures/plans/${code.toLowerCase()}.json`)).json() as Promise<PlanFixture>,
};
