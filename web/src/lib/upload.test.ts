import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import type { ExtractedField } from "./types";
import {
  checkPages, checkSize, decisionCandidate, decisionEdit, formatProposed, groupByLandmark, isPdfMagic, isTerminal, labelFor, MAX_BYTES, parseValueInput,
  pollExtraction, createSerialGate, startErrorCopy, problemCopy, publishErrorCopy, reviewErrorCopy, uploadErrorCopy, errorBody, sha256Hex, stageCopy, stageProgress, undecidedRequired, urlBase64ToUint8Array, verifiedUndecided, type ExtractionStatusFull,
} from "./upload";

const field = (over: Partial<ExtractedField>): ExtractedField => ({
  field_path: "deductible_individual", label: "Deductible (per person)", landmark: "bridge", unit: "cents", proposed_value: 5000, page: 6, quote: "a quote",
  quote_verified: true, confidence: "confirmed", evidence_status: "DOC", review_status: "quote_verified_in_text", candidates: [], required: true, decision: null, ...over,
});

const status = (over: Partial<ExtractionStatusFull>): ExtractionStatusFull => ({
  status: "queued", stage_index: 0, stages: [], pages: 14, pages_done: 0, quotes_total: 0, quotes_verified: 0, fields: [], mode: "demo", ...over,
});

describe("file validation (mirrors api/app/uploads.py)", () => {
  it("accepts %PDF- magic bytes and rejects anything else", () => {
    expect(isPdfMagic(new TextEncoder().encode("%PDF-1.7\n"))).toBe(true);
    expect(isPdfMagic(new TextEncoder().encode("hello world"))).toBe(false);
    expect(isPdfMagic(new Uint8Array([0x25, 0x50]))).toBe(false);
  });
  it("limits size to 32 MB and pages to 1..100", () => {
    expect(checkSize(MAX_BYTES)).toEqual({ ok: true });
    expect(checkSize(MAX_BYTES + 1)).toEqual({ ok: false, problem: "too_large" });
    expect(checkPages(100)).toEqual({ ok: true });
    expect(checkPages(101)).toEqual({ ok: false, problem: "too_many_pages" });
    expect(checkPages(0)).toEqual({ ok: false, problem: "unreadable" });
    expect(problemCopy.not_pdf).toBe("This file is not a PDF.");
    expect(problemCopy.too_large).toBe("This file is larger than 32 MB.");
    expect(problemCopy.too_many_pages).toBe("This document has more than 100 pages.");
  });
  it("computes SHA-256 with WebCrypto (known vector)", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("decodes a base64url VAPID key", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array("_-8"))).toEqual([255, 239]);
  });
});

describe("extraction stages", () => {
  it("renders the spec §7.3 copy for every status", () => {
    expect(stageCopy(status({ status: "queued" }))).toBe("Waiting to start…");
    expect(stageCopy(status({ status: "reading_text", pages_done: 3, pages: 14 }))).toBe("Reading the document text (3 of 14 pages)…");
    expect(stageCopy(status({ status: "redacting" }))).toBe("Removing personal details…");
    expect(stageCopy(status({ status: "identifying_fields" }))).toBe("Identifying benefit fields…");
    expect(stageCopy(status({ status: "matching_rules" }))).toContain("16 procedure identifiers");
    expect(stageCopy(status({ status: "verifying_quotes", quotes_verified: 20, quotes_total: 50 }))).toBe("Verifying each quote against the page text (20 of 50)…");
    expect(stageCopy(status({ status: "ready", counts: { confirmed: 50, likely: 0, needs_review: 0, not_found: 2 } }))).toBe("Extraction complete. 50 confirmed · 0 likely · 0 need review · 2 not found.");
    expect(stageCopy(status({ status: "failed", reason: "no text layer (scanned document)" }))).toBe("The document could not be read automatically (no text layer (scanned document)). Fields can be entered by hand below.");
    expect(stageCopy(status({ status: "demo_no_model" }))).toContain("No extraction model is configured");
  });
  it("knows the terminal statuses and the measurable progress", () => {
    expect(isTerminal("ready") && isTerminal("failed") && isTerminal("demo_no_model")).toBe(true);
    expect(isTerminal("verifying_quotes")).toBe(false);
    expect(stageProgress(status({ status: "reading_text", pages_done: 7, pages: 14 }))).toBe(0.5);
    expect(stageProgress(status({ status: "verifying_quotes", quotes_verified: 25, quotes_total: 50 }))).toBe(0.5);
    expect(stageProgress(status({ status: "identifying_fields" }))).toBeNull();
  });
  it("polls until a terminal status and reports every reading", async () => {
    const seq = [status({ status: "queued" }), status({ status: "reading_text" }), status({ status: "ready" })];
    let i = 0;
    const seen: string[] = [];
    const final = await pollExtraction("doc", (s) => seen.push(s.status), { intervalMs: 0, fetcher: async () => seq[i++] });
    expect(final.status).toBe("ready");
    expect(seen).toEqual(["queued", "reading_text", "ready"]);
  });
});

describe("review helpers", () => {
  const fields: ExtractedField[] = [
    field({}),
    field({ field_path: "annual_max", label: "Annual maximum", landmark: "lookout", proposed_value: 150000 }),
    field({ field_path: "classes[0].plan_share_bp_in", label: "Plan share in-network (Preventive)", landmark: "cove", unit: "bp", proposed_value: 10000 }),
    field({ field_path: "class_of.crown", label: "Coverage class: Crown", landmark: "cove", unit: "text", proposed_value: "Major" }),
    field({ field_path: "class_of.filling", label: "Coverage class: Filling", landmark: "cove", unit: "text", proposed_value: "Basic" }),
    field({ field_path: "benefit_year_start_month", label: "Benefit year start month", landmark: "harbor", unit: "month_index", proposed_value: 1 }),
    field({ field_path: "waiting_months", label: "Waiting periods", landmark: "rules", unit: "list", proposed_value: { crown: 12 }, confidence: "likely", quote_verified: false }),
    field({ field_path: "oon_rule", label: "Out-of-network payment basis", landmark: "rules", unit: "text", proposed_value: null, confidence: "not_found", evidence_status: "UNKNOWN", quote_verified: false, quote: null, page: null }),
  ];
  it("groups by landmark in the fixed order", () => {
    expect(groupByLandmark(fields).map((g) => g.title)).toEqual(["Your plan", "Deductible", "Coverage", "Annual maximum", "Rules"]);
  });
  it("formats proposed values by unit and keeps cents as numbers for <Money>", () => {
    expect(formatProposed("cents", 5000)).toEqual({ kind: "money", cents: 5000 });
    expect(formatProposed("bp", 8000)).toEqual({ kind: "text", text: "80%" });
    expect(formatProposed("months", 12)).toEqual({ kind: "text", text: "12 months" });
    expect(formatProposed("month_index", 1)).toEqual({ kind: "text", text: "January" });
    expect(formatProposed("bool", true)).toEqual({ kind: "text", text: "Yes" });
    expect(formatProposed("text", { in: "allowed", out: "UCR" })).toEqual({ kind: "text", text: "in: allowed; out: UCR" });
    expect(formatProposed("list", { procedure_key: "cleaning", clock: "calendar_count", n: 2 })).toEqual({ kind: "text", text: "2 per calendar count" });
    expect(formatProposed("list", { crown: 12 })).toEqual({ kind: "text", text: "crown: 12 months" });
    expect(formatProposed("cents", "unlimited")).toEqual({ kind: "text", text: "no annual maximum" });
    expect(formatProposed("cents", null)).toEqual({ kind: "none" });
  });
  it("mirrors the server's required-rows rule (class_of is one group)", () => {
    expect(undecidedRequired(fields)).toEqual(["deductible_individual", "annual_max", "classes[0].plan_share_bp_in", "benefit_year_start_month", "waiting_months", "oon_rule", "class_of"]);
    const decided = fields.map((f) => (f.field_path === "class_of.crown" ? { ...f, decision: { kind: "confirmed" as const, at: "now" } } : f));
    expect(undecidedRequired(decided)).not.toContain("class_of");
    expect(labelFor(fields, "class_of")).toBe("at least one coverage class row");
    expect(labelFor(fields, "annual_max")).toBe("Annual maximum");
  });
  it("lists only verified, proposed, undecided rows for 'Confirm all verified quotes'", () => {
    expect(verifiedUndecided(fields).map((f) => f.field_path)).toEqual(["deductible_individual", "annual_max", "classes[0].plan_share_bp_in", "class_of.crown", "class_of.filling", "benefit_year_start_month"]);
  });
  it("parses edit inputs by unit into the server's value shape", () => {
    expect(parseValueInput("cents", "$1,234.50")).toEqual({ ok: true, value: 123450 });
    expect(parseValueInput("cents", "-3")).toEqual({ ok: false });
    expect(parseValueInput("bp", "80%")).toEqual({ ok: true, value: 8000 });
    expect(parseValueInput("bp", "120")).toEqual({ ok: false });
    expect(parseValueInput("months", "12")).toEqual({ ok: true, value: 12 });
    expect(parseValueInput("month_index", "13")).toEqual({ ok: false });
    expect(parseValueInput("bool", "yes")).toEqual({ ok: true, value: true });
    expect(parseValueInput("text", "  Major ")).toEqual({ ok: true, value: "Major" });
    expect(parseValueInput("list", '{"crown": 12}')).toEqual({ ok: true, value: { crown: 12 } });
    expect(parseValueInput("list", "not json")).toEqual({ ok: false });
  });
  it("builds review decisions in the API's shape", () => {
    expect(decisionEdit(fields[0], 6000, "EOB dated 2026-02-01")).toEqual({ field_path: "deductible_individual", decision: "edited", value: 6000, source: "EOB dated 2026-02-01" });
    expect(decisionCandidate(fields[3], 1)).toEqual({ field_path: "class_of.crown", decision: "candidate", candidate_index: 1 });
  });
});

describe("API error copy (FastAPI wraps the error object in `detail`)", () => {
  it("reads the server's error code from {detail: {error}}", () => {
    expect(uploadErrorCopy(new ApiError(422, "/me/documents/upload", { detail: { error: "sha256_mismatch" } }))).toContain("checksum computed here differs");
    expect(uploadErrorCopy(new ApiError(413, "/me/documents/upload", { detail: { error: "file_too_large", max_bytes: 1 } }))).toBe("The server limits uploads to 32 MB.");
    expect(reviewErrorCopy(new ApiError(422, "/me/documents/x/review", { detail: { error: "source_required" } }))).toBe("A source is required for an entered value.");
    expect(publishErrorCopy(new ApiError(409, "/me/documents/x/publish", { detail: { error: "undecided_fields", fields: ["class_of"] } }), [])).toContain("at least one coverage class row");
    expect(errorBody(new ApiError(422, "/x", { error: "term_too_long" }))?.error).toBe("term_too_long");
    expect(errorBody(new Error("x"))).toBeUndefined();
    expect(uploadErrorCopy(new ApiError(500, "/x", undefined))).toContain("could not be stored");
  });
});

describe("review decisions are serialized (web-correctness-21)", () => {
  it("refuses a second decision while one is in flight and reopens after it settles", () => {
    const gate = createSerialGate();
    expect(gate.enter()).toBe(true);
    expect(gate.busy).toBe(true);
    expect(gate.enter()).toBe(false);          // row B while row A's request runs: ignored, so A's response cannot overwrite B
    gate.leave();
    expect(gate.busy).toBe(false);
    expect(gate.enter()).toBe(true);
  });
});

describe("polling stops on abort (web-correctness-20)", () => {
  it("rejects with AbortError when the abort lands during a fetch, and fetches no more", async () => {
    const ctl = new AbortController();
    let calls = 0;
    const fetcher = async () => { calls++; ctl.abort(); return status({ status: "identifying_fields" }); };
    const seen: string[] = [];
    await expect(pollExtraction("d1", (st) => seen.push(st.status), { intervalMs: 5, signal: ctl.signal, fetcher })).rejects.toMatchObject({ name: "AbortError" });
    await new Promise((r) => setTimeout(r, 40));
    expect(calls).toBe(1);
    expect(seen).toEqual([]);                    // a reading that arrives after the abort is not reported
  });
  it("does not start when the signal is already aborted", async () => {
    const ctl = new AbortController(); ctl.abort();
    let calls = 0;
    await expect(pollExtraction("d1", () => undefined, { signal: ctl.signal, fetcher: async () => { calls++; return status({ status: "ready" }); } })).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(0);
  });
});

describe("extraction start failures (web-correctness-19)", () => {
  it("says the run did not start, with its own sentence for the rate limit", () => {
    expect(startErrorCopy(new ApiError(429, "/x"))).toContain("Too many extractions");
    expect(startErrorCopy(new ApiError(500, "/x"))).toContain("did not start");
    expect(startErrorCopy(new TypeError("network"))).toContain("did not start");
  });
});
