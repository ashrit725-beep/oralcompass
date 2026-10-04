/**
 * Upload helpers (spec §7.3, component plan N6). Pure where possible; tested in lib/upload.test.ts.
 * - client validation mirrors api/app/uploads.py: `%PDF-` magic bytes, ≤ 32 MB, ≤ 100 pages (counted with pdf.js), SHA-256 (WebCrypto);
 * - pdf.js is loaded with a dynamic import so it stays in the lazy `pdfjs-*` chunk (vite.config manualChunks);
 * - `pollExtraction` reads GET /me/documents/{id}/extraction every 1.5 s until a terminal status;
 * - review helpers (grouping by landmark, proposed-value formatting, the required-rows rule) mirror `uploads.undecided_required`.
 * Frozen types are extended here (additive) rather than edited: `ExtractionStatusFull` adds the API's extra fields.
 */
import { ApiError, api } from "./api";
import { authHeaders } from "./auth";
import { UPLOAD } from "./copy/upload";
import { REDACTION_VERSION, type IdentifierCategory, type RedactionResult } from "./redact";
import type { ExtractedField, ExtractionStatus, ReviewDecision, UploadResponse } from "./types";

export const MAX_BYTES = 32 * 1024 * 1024;
export const MAX_PAGES = 100;
export const MAX_PREVIEW_CHARS = 400_000;
export const PREVIEW_SHOWN_CHARS = 1200;
export const POLL_MS = 1500;
export const TERMINAL = new Set(["ready", "failed", "demo_no_model"]);

/** The API's status dict carries more than the frozen `ExtractionStatus` (foundation notes §3.2); additive extension. */
export type ExtractionStatusFull = ExtractionStatus & {
  ribbon?: string;
  counts?: { confirmed: number; likely: number; needs_review: number; not_found: number } | null;
  structure?: {
    classes?: { name: string; procedures_text?: string[] }[]; carrier_text?: string;
    ignored_wording?: { page: number; quote: string }[]; unmatched_wording?: { wording: string; context?: string }[];
    annual_max_unlimited?: boolean; [k: string]: unknown;
  };
  demo_fixture_match?: boolean;
  notes?: string[];
  notes_dropped?: number;
  notes_for_review?: { paraphrase: string; publish: string; ignored_wording: string; unmatched_wording: string };
  undecided_required?: string[];
  model?: string | null;
  reason?: string | null;
};

/** POST /me/documents/upload also returns `mode` and the preview's `note` (additive to the frozen `UploadResponse`). */
export type UploadResponseX = UploadResponse & { mode?: "demo" | "live"; redaction_preview: UploadResponse["redaction_preview"] & { note?: string; summary?: unknown } };

/** The dev auth header in dev builds (empty in production, where the session cookie identifies the visitor); see lib/auth.ts. */
export const DEV_USER_HEADER: Record<string, string> = authHeaders();

export type FileProblem = "not_pdf" | "too_large" | "too_many_pages" | "unreadable";
export type FileCheck = { ok: true } | { ok: false; problem: FileProblem };

export const problemCopy: Record<FileProblem, string> = {
  not_pdf: UPLOAD.notPdf, too_large: UPLOAD.tooLarge, too_many_pages: UPLOAD.tooManyPages, unreadable: UPLOAD.unreadable,
};

/** `%PDF-` at byte 0 (the server applies the same check). */
export function isPdfMagic(bytes: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return bytes.length >= 5 && magic.every((b, i) => bytes[i] === b);
}

export function checkSize(bytes: number): FileCheck {
  return bytes > MAX_BYTES ? { ok: false, problem: "too_large" } : { ok: true };
}

export function checkPages(pages: number): FileCheck {
  if (!Number.isFinite(pages) || pages < 1) return { ok: false, problem: "unreadable" };
  return pages > MAX_PAGES ? { ok: false, problem: "too_many_pages" } : { ok: true };
}

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const b of u) out += b.toString(16).padStart(2, "0");
  return out;
}

/** SHA-256 of the file bytes via WebCrypto; the server recomputes it and rejects a mismatch (422 sha256_mismatch). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = data instanceof Uint8Array ? data.slice().buffer : data;
  const digest = await crypto.subtle.digest("SHA-256", buf as ArrayBuffer);
  return bytesToHex(digest);
}

export interface PdfInspection { pages: number; text: string; pageTexts: string[] }

/** One page's text layer as lines: items joined with a space, a line break where pdf.js marks the end of a line (`hasEOL`), runs of
 *  spaces collapsed. The on-device detector reads label values up to the line end, so the breaks matter. */
export function pageTextFromItems(items: readonly unknown[]): string {
  let out = "";
  for (const it of items) {
    if (!it || typeof it !== "object" || !("str" in it)) continue;
    const item = it as { str: string; hasEOL?: boolean };
    out += item.str + (item.hasEOL ? "\n" : " ");
  }
  return out.split("\n").map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim()).filter(Boolean).join("\n");
}

/** Page count + the per-page text layer of the first 100 pages (read on this device for the redaction review). pdf.js is imported lazily (its own chunk). */
export async function inspectPdf(data: ArrayBuffer, onPage?: (done: number, total: number) => void): Promise<PdfInspection> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  const pages = doc.numPages;
  const pageTexts: string[] = [];
  let total = 0;
  const limit = Math.min(pages, MAX_PAGES);
  try {
    for (let i = 1; i <= limit && total < MAX_PREVIEW_CHARS; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = pageTextFromItems(content.items).slice(0, MAX_PREVIEW_CHARS - total);
      pageTexts.push(text);
      total += text.length + 1;
      onPage?.(i, limit);
    }
  } finally {
    await doc.destroy().catch(() => undefined);
  }
  return { pages, text: pageTexts.join("\n"), pageTexts };
}

export type PreparePhase = { phase: "checksum" } | { phase: "reading"; done: number; total: number } | { phase: "detecting" } | { phase: "uploading" };
export interface PreparedFile { sha256: string; pages: number; text: string; pageTexts: string[]; bytes: number }

/** Validate + hash + read the text layer of a chosen file. Returns a FileCheck problem instead of throwing for the spec'd failures.
 *  Nothing leaves the device here: the upload happens after the person has reviewed what is removed (UploadWizardBody step 2). */
export async function prepareFile(file: File, onPhase?: (p: PreparePhase) => void): Promise<{ ok: true; prepared: PreparedFile } | { ok: false; problem: FileProblem }> {
  const size = checkSize(file.size);
  if (!size.ok) return size;
  const data = await file.arrayBuffer();
  if (!isPdfMagic(new Uint8Array(data, 0, Math.min(5, data.byteLength)))) return { ok: false, problem: "not_pdf" };
  onPhase?.({ phase: "checksum" });
  const sha = await sha256Hex(data);
  let inspection: PdfInspection;
  try {
    inspection = await inspectPdf(data, (done, total) => onPhase?.({ phase: "reading", done, total }));
  } catch {
    return { ok: false, problem: "unreadable" };
  }
  const pages = checkPages(inspection.pages);
  if (!pages.ok) return pages;
  return { ok: true, prepared: { sha256: sha, pages: inspection.pages, text: inspection.text, pageTexts: inspection.pageTexts, bytes: file.size } };
}

// ---------------------------------------------------------------- client redaction (design points 2 and 3)

export { serverRedactionSummary, type ServerRedactionSummary } from "./redaction-summary";

export const CLIENT_REDACTION_LIMITS = { identifiers: 300, valueMin: 2, valueMax: 120, terms: 20, termMax: 64, bytes: 64 * 1024 } as const;

export interface ClientRedactionPayload {
  version: number;
  identifiers: { category: IdentifierCategory; value: string }[];
  extra_terms: string[];
}

/** The multipart `client_redaction` field (upload contract, design point 3): every identifier the person left removed, with its value, so
 *  the server removes each occurrence from the text it reads before any model call; plus the person's own terms. Values outside the
 *  contract's 2..120 characters are left to the server's own patterns (a value that long is not an identifier). Within the limits. */
export function buildClientRedaction(result: Pick<RedactionResult, "removed">, terms: readonly string[]): ClientRedactionPayload {
  const L = CLIENT_REDACTION_LIMITS;
  const seen = new Set<string>();
  const identifiers: ClientRedactionPayload["identifiers"] = [];
  for (const f of result.removed) {
    const value = f.value.trim();
    const key = `${f.category}|${value.toLowerCase()}`;
    if (value.length < L.valueMin || value.length > L.valueMax || seen.has(key)) continue;
    seen.add(key);
    identifiers.push({ category: f.category, value });
    if (identifiers.length >= L.identifiers) break;
  }
  const extra_terms = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= L.valueMin && t.length <= L.termMax))].slice(0, L.terms);
  const payload: ClientRedactionPayload = { version: REDACTION_VERSION, identifiers, extra_terms };
  // the 64 KB cap: drop identifiers from the end until the JSON fits (only reachable with hundreds of long values)
  while (identifiers.length && new TextEncoder().encode(JSON.stringify(payload)).length > L.bytes) identifiers.pop();
  return payload;
}

/** The clearly fictional sample statement (design point 5), read in the browser and sent down the SAME client path as a picked file. */
export const SAMPLE_STATEMENT = { path: "/fixtures/documents/sample_member_statement_hb26_fictional.pdf", name: "sample_member_statement_hb26_fictional.pdf" } as const;

export async function loadSampleStatement(fetcher: typeof fetch = fetch): Promise<File> {
  const r = await fetcher(SAMPLE_STATEMENT.path);
  if (!r.ok) throw new Error(`sample ${r.status}`);
  const blob = await r.blob();
  return new File([blob], SAMPLE_STATEMENT.name, { type: "application/pdf" });
}

export const isTerminal = (status: string | undefined | null) => !!status && TERMINAL.has(status);

const abortError = () => new DOMException("aborted", "AbortError");
/** web-correctness-20: an already-aborted signal rejects at once (an abort that lands during a fetch fires no later event). */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });

/** Poll GET /me/documents/{id}/extraction until a terminal status; every reading is reported to `onStatus`. */
export async function pollExtraction(
  id: string,
  onStatus: (st: ExtractionStatusFull) => void,
  opts: { intervalMs?: number; signal?: AbortSignal; fetcher?: (id: string) => Promise<ExtractionStatusFull>; maxPolls?: number } = {},
): Promise<ExtractionStatusFull> {
  const fetcher = opts.fetcher ?? ((d: string) => api.extraction(d) as Promise<ExtractionStatusFull>);
  const interval = opts.intervalMs ?? POLL_MS;
  const max = opts.maxPolls ?? Infinity;
  let n = 0;
  for (;;) {
    if (opts.signal?.aborted) throw abortError();
    const st = await fetcher(id);
    if (opts.signal?.aborted) throw abortError();
    onStatus(st);
    if (isTerminal(st.status)) return st;
    if (++n >= max) return st;
    await sleep(interval, opts.signal);
  }
}

/** Spec §7.3 step 3 copy for the current status (the server's `stages[]` labels remain the row names). */
export function stageCopy(st: Pick<ExtractionStatusFull, "status" | "pages" | "pages_done" | "quotes_total" | "quotes_verified" | "counts" | "reason">): string {
  switch (st.status) {
    case "queued": return UPLOAD.stageQueued;
    case "reading_text": return UPLOAD.stageReading(st.pages_done ?? 0, st.pages ?? 0);
    case "redacting": return UPLOAD.stageRedacting;
    case "identifying_fields": return UPLOAD.stageIdentifying;
    case "matching_rules": return UPLOAD.stageMatching;
    case "verifying_quotes": return UPLOAD.stageVerifying(st.quotes_verified ?? 0, st.quotes_total ?? 0);
    case "ready": { const c = st.counts ?? { confirmed: 0, likely: 0, needs_review: 0, not_found: 0 }; return UPLOAD.stageReady(c.confirmed, c.likely, c.needs_review, c.not_found); }
    case "failed": return UPLOAD.stageFailed(st.reason || UPLOAD.unreadable);
    case "demo_no_model": return UPLOAD.stageDemoNoModel;
    default: return String(st.status);
  }
}

/** 0..1 for the running stage when it is measurable (pages, quotes); otherwise null. */
export function stageProgress(st: Pick<ExtractionStatusFull, "status" | "pages" | "pages_done" | "quotes_total" | "quotes_verified">): number | null {
  if (st.status === "reading_text" && st.pages > 0) return Math.min(1, st.pages_done / st.pages);
  if (st.status === "verifying_quotes" && st.quotes_total > 0) return Math.min(1, st.quotes_verified / st.quotes_total);
  return null;
}

export const LANDMARK_ORDER = ["harbor", "bridge", "cove", "lookout", "rules"] as const;
export type LandmarkKey = (typeof LANDMARK_ORDER)[number];

export function groupByLandmark(fields: ExtractedField[]): { landmark: LandmarkKey; title: string; fields: ExtractedField[] }[] {
  return LANDMARK_ORDER.map((landmark) => ({ landmark, title: UPLOAD.landmark[landmark], fields: fields.filter((f) => f.landmark === landmark) })).filter((g) => g.fields.length > 0);
}

export type Proposed = { kind: "money"; cents: number } | { kind: "text"; text: string } | { kind: "none" };

/** Format a proposed (or decided) value by unit. Cents are returned as a number so the caller renders them through <Money>. */
export function formatProposed(unit: ExtractedField["unit"], value: unknown): Proposed {
  if (value === null || value === undefined || value === "") return { kind: "none" };
  if (value === "unlimited") return { kind: "text", text: UPLOAD.valueUnlimited };
  switch (unit) {
    case "cents": return typeof value === "number" ? { kind: "money", cents: value } : { kind: "text", text: String(value) };
    case "bp": return typeof value === "number" ? { kind: "text", text: UPLOAD.percent(value) } : { kind: "text", text: String(value) };
    case "months": return typeof value === "number" ? { kind: "text", text: UPLOAD.months(value) } : { kind: "text", text: String(value) };
    case "month_index": return typeof value === "number" && value >= 1 && value <= 12 ? { kind: "text", text: UPLOAD.monthNames[value - 1] } : { kind: "text", text: String(value) };
    case "bool": return { kind: "text", text: value ? UPLOAD.valueBool.yes : UPLOAD.valueBool.no };
    case "text":
      if (typeof value === "object") { const o = value as Record<string, unknown>; return { kind: "text", text: Object.entries(o).map(([k, v]) => `${k}: ${String(v)}`).join("; ") }; }
      return { kind: "text", text: String(value) };
    case "list": return { kind: "text", text: listText(value) };
    default: return { kind: "text", text: typeof value === "string" ? value : JSON.stringify(value) };
  }
}

function listText(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return UPLOAD.valueNone;
    return value.map((c) => (c && typeof c === "object" ? [c.procedure_key, c.condition, c.text].filter(Boolean).join(": ") : String(c))).join("; ");
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("procedure_key" in o && "n" in o) return UPLOAD.frequencyValue(Number(o.n), String(o.clock ?? "benefit year"));
    return Object.entries(o).map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "number" ? UPLOAD.months(v) : String(v)}`).join("; ");
  }
  return String(value);
}

export const isDecided = (f: ExtractedField) => !!f.decision;

/** One review request at a time (web-correctness-21): each response replaces the whole field list, so a slower earlier response must
 *  never land after a later decision. `enter()` is false while a request is in flight; `leave()` ends it. */
export function createSerialGate(): { enter: () => boolean; leave: () => void; readonly busy: boolean } {
  let busy = false;
  return { enter: () => (busy ? false : (busy = true)), leave: () => { busy = false; }, get busy() { return busy; } };
}

/** Mirrors `uploads.undecided_required`: required rows without a decision; class_of.* rows count as one group ("class_of"). */
export function undecidedRequired(fields: ExtractedField[]): string[] {
  const out = fields.filter((f) => f.required && !f.decision && !f.field_path.startsWith("class_of.")).map((f) => f.field_path);
  const classRows = fields.filter((f) => f.field_path.startsWith("class_of."));
  if (classRows.length && !classRows.some((f) => f.decision)) out.push("class_of");
  return out;
}

/** Rows whose quote verified on the cited page, with a proposed value and no decision yet ("Confirm all verified quotes"). */
export function verifiedUndecided(fields: ExtractedField[]): ExtractedField[] {
  return fields.filter((f) => f.confidence === "confirmed" && f.quote_verified && f.proposed_value !== null && f.proposed_value !== undefined && !f.decision);
}

export function labelFor(fields: ExtractedField[], path: string): string {
  if (path === "class_of") return UPLOAD.requiredGroup;
  return fields.find((f) => f.field_path === path)?.label ?? path;
}

export type ParsedValue = { ok: true; value: unknown } | { ok: false };

/** Parse the inline edit input by unit into the value the server validates (`_UNIT_CHECK`). */
export function parseValueInput(unit: ExtractedField["unit"], raw: string): ParsedValue {
  const s = raw.trim();
  if (!s) return { ok: false };
  switch (unit) {
    case "cents": { const n = Number(s.replace(/[$,\s]/g, "")); return Number.isFinite(n) && n >= 0 ? { ok: true, value: Math.round(n * 100) } : { ok: false }; }
    case "bp": { const n = Number(s.replace(/[%\s]/g, "")); return Number.isFinite(n) && n >= 0 && n <= 100 ? { ok: true, value: Math.round(n * 100) } : { ok: false }; }
    case "months": { const n = Number(s); return Number.isInteger(n) && n >= 0 ? { ok: true, value: n } : { ok: false }; }
    case "month_index": { const n = Number(s); return Number.isInteger(n) && n >= 1 && n <= 12 ? { ok: true, value: n } : { ok: false }; }
    case "bool": return s === "true" || s === "yes" ? { ok: true, value: true } : s === "false" || s === "no" ? { ok: true, value: false } : { ok: false };
    case "text": return { ok: true, value: s };
    case "list": { try { const v = JSON.parse(s); return Array.isArray(v) || (v && typeof v === "object") ? { ok: true, value: v } : { ok: false }; } catch { return { ok: false }; } }
    default: return { ok: false };
  }
}

export const decisionConfirm = (f: ExtractedField): ReviewDecision => ({ field_path: f.field_path, decision: "confirmed" });
export const decisionNotInDocument = (f: ExtractedField): ReviewDecision => ({ field_path: f.field_path, decision: "not_in_document" });
export const decisionCandidate = (f: ExtractedField, index: number): ReviewDecision => ({ field_path: f.field_path, decision: "candidate", candidate_index: index });
export const decisionEdit = (f: ExtractedField, value: unknown, source: string): ReviewDecision => ({ field_path: f.field_path, decision: "edited", value, source });

type Body = { error?: string; fields?: string[]; type?: string; field_path?: string; unit?: string } | undefined;
/** The API's error object: FastAPI wraps an HTTPException's dict in `detail` ({"detail": {"error": …}}); a bare object is accepted too. */
export const errorBody = (e: unknown): Body => {
  if (!(e instanceof ApiError) || !e.body || typeof e.body !== "object") return undefined;
  const b = e.body as { detail?: unknown };
  return (b.detail && typeof b.detail === "object" ? b.detail : b) as Body;
};
const body = errorBody;

/** Upload failure → one UPLOAD sentence (the server's error codes, foundation notes §3.2 item 1). */
export function uploadErrorCopy(e: unknown): string {
  const b = body(e);
  switch (b?.error) {
    case "not_a_pdf": return UPLOAD.serverNotPdf;
    case "unreadable_pdf": return UPLOAD.unreadable;
    case "file_too_large": return UPLOAD.serverTooLarge;
    case "too_many_pages": return UPLOAD.serverTooManyPages;
    case "sha256_mismatch": return UPLOAD.shaMismatch;
    case "invalid_client_redaction": return UPLOAD.invalidClientRedaction;
    case "upload_quota": return UPLOAD.uploadQuota;
    default: return UPLOAD.uploadFailed;
  }
}

/** web-correctness-19: POST /extract failed (anything but 409, which means a run already exists). */
export function startErrorCopy(e: unknown): string {
  return e instanceof ApiError && e.status === 429 ? UPLOAD.startLimited : UPLOAD.startFailed;
}

export function reviewErrorCopy(e: unknown): string {
  const b = body(e);
  switch (b?.error) {
    case "source_required": return UPLOAD.sourceRequired;
    case "invalid_value": return UPLOAD.invalidValue;
    case "unknown_class": return UPLOAD.unknownClass;
    default: return UPLOAD.reviewFailed;
  }
}

export function publishErrorCopy(e: unknown, fields: ExtractedField[]): string {
  const b = body(e);
  if (b?.error === "undecided_fields") return UPLOAD.publishUndecided((b.fields ?? []).map((p) => labelFor(fields, p)).join(", "));
  if (b?.error === "plan_invalid") return UPLOAD.publishInvalid(b.type ?? "error");
  return UPLOAD.publishFailed;
}

/** Scheme + host check for Web Push (RemindersPanel). */
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** VAPID public key (base64url) → the Uint8Array `applicationServerKey` wants. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
