/**
 * How the browser identifies itself to the API.
 *
 * Production: the API issues a private per-visitor session in a signed, HttpOnly cookie (api/app/sessions.py). The browser sends it on
 * same-origin requests (`credentials: "same-origin"`); script never reads it. No header is sent.
 * Development and tests: the API runs with ORALCOMPASS_DEV_AUTH=1 and reads the `X-Dev-User` header instead. The header is sent ONLY when
 * the bundle is a dev build (`import.meta.env.DEV`, which includes Vitest) or was built with VITE_DEV_AUTH=1; a production API ignores it.
 */
export const DEV_USER = "demo-user";

type Env = { DEV?: boolean; VITE_DEV_AUTH?: string };

export function devAuthEnabled(env: Env): boolean {
  return env.DEV === true || env.VITE_DEV_AUTH === "1";
}

export const DEV_AUTH = devAuthEnabled(import.meta.env as Env);

/** Headers that identify the caller: `{ "X-Dev-User": ... }` in dev builds, nothing in production. */
export function authHeaders(enabled: boolean = DEV_AUTH): Record<string, string> {
  return enabled ? { "X-Dev-User": DEV_USER } : {};
}

/** Every API fetch carries the session cookie (same origin only) and, in dev builds, the dev header. */
export function withAuth(init: RequestInit = {}, enabled: boolean = DEV_AUTH): RequestInit {
  return { ...init, credentials: "same-origin", headers: { ...authHeaders(enabled), ...((init.headers as Record<string, string>) || {}) } };
}
