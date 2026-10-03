import type { ComparisonResponse, EstimateResponse, PlanFixture } from "./types";

const DEV_USER = "demo-user";   // dev auth only (FINEPRINT_DEV_AUTH=1 on the API); production sends the Cognito JWT.

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, { ...init, headers: { "Content-Type": "application/json", "X-Dev-User": DEV_USER, ...(init?.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export const api = {
  presets: () => req<{ items: any[]; banner: string }>("/presets"),
  estimate: (body: unknown) => req<EstimateResponse>("/estimates", { method: "POST", body: JSON.stringify(body) }),
  comparison: (body: unknown) => req<ComparisonResponse>("/comparisons", { method: "POST", body: JSON.stringify(body) }),
  fixturePlan: async (code: string) => (await fetch(`/fixtures/plans/${code.toLowerCase()}.json`)).json() as Promise<PlanFixture>,
};

export const SAM_LINES = [
  { key: "crown", label: "Porcelain/ceramic crown", tooth: "30", charge_cents: 120000, prep: "2026-11-03", completion: "2026-11-20" },
  { key: "composite", label: "Two-surface posterior composite", tooth: "19", charge_cents: 30000, completion: "2026-10-20" },
];
export const SAM_STATE = {
  remaining_deductible: { value: 5000, status: "USER", note: "statement 2026-09-15" },
  remaining_max: { value: 80000, status: "USER", note: "statement 2026-09-15" },
  network: { value: "in", status: "USER" },
  enrolled_months: { value: 30, status: "USER" },
};
