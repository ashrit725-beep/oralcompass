/**
 * Reminders + Web Push client calls (api/app/notifications.py). Kept beside the panel because lib/api.ts is frozen for this build; the
 * integrator may move these four methods into `api` (listed in open_issues). Same conventions as lib/api.ts: JSON, the dev-auth header,
 * `ApiError` with the parsed body. Subscription keys travel to the owner-scoped store only; the API never returns them.
 */
import { ApiError, apiFetch } from "@/lib/api";

export interface ReminderItem { kind: string; text: string; date: string | null; cite: { doc: string; page: number; quote: string } | null; source: string; plan_code?: string; procedure_key?: string; document_id?: string }
export interface RemindersResponse { as_of: string; items: ReminderItem[]; note: string }
export interface PushSubscriptionPublic { id: string; endpoint: string; label: string | null; created_at: string | null }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(path, { ...init, headers: { "Content-Type": "application/json", ...((init?.headers as Record<string, string>) || {}) } });
  if (!r.ok) throw new ApiError(r.status, path, await r.json().catch(() => undefined));
  return r.json();
}

export const remindersApi = {
  reminders: (asOf?: string) => req<RemindersResponse>(`/me/reminders${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`),
  vapidPublicKey: () => req<{ public_key: string }>("/notifications/vapid-public-key"),
  subscriptions: () => req<{ items: PushSubscriptionPublic[] }>("/me/push/subscriptions"),
  addSubscription: (body: { endpoint: string; keys: { p256dh: string; auth: string }; expiration_time?: number | null; label?: string | null }) =>
    req<PushSubscriptionPublic>("/me/push/subscriptions", { method: "POST", body: JSON.stringify(body) }),
  deleteSubscription: (id: string) => req<{ deleted: string }>(`/me/push/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  pushTest: () => req<{ sent: number; failed: number }>("/me/push/test", { method: "POST", body: "{}" }),
  health: () => req<{ llm_mode: "demo" | "live"; dev_auth?: boolean }>("/health"),
};
