/**
 * Save a JSON value as a file (web-correctness-18). The anchor is attached to the document for the click (Firefox ignores clicks on a
 * detached anchor) and the object URL is revoked on a later task, never synchronously after `click()` (Safari and Firefox can cancel
 * the download when the URL disappears before the navigation starts). `env` is injectable for tests.
 */
export interface DownloadEnv {
  document: Pick<Document, "createElement" | "body">;
  URL: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  setTimeout: (fn: () => void, ms: number) => unknown;
}

export const REVOKE_DELAY_MS = 30_000;

export function saveJson(data: unknown, filename: string, env: DownloadEnv = { document, URL, setTimeout: (fn, ms) => window.setTimeout(fn, ms) }): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const href = env.URL.createObjectURL(blob);
  const a = env.document.createElement("a");
  a.href = href; a.download = filename; a.rel = "noopener"; a.style.display = "none";
  env.document.body.appendChild(a);
  try { a.click(); } finally { a.remove(); }
  env.setTimeout(() => env.URL.revokeObjectURL(href), REVOKE_DELAY_MS);
}

/** A readable one-line reason for a failed request (ApiError and fetch's TypeError both carry `message`). */
export const failureReason = (e: unknown) => (e instanceof Error && e.message ? e.message : String(e));
