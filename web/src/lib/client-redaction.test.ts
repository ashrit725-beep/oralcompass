import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { UPLOAD } from "./copy/upload";
import type { FoundIdentifier } from "./redact";
import { categoryCounts, maskedVisible, pageRanges, previewPages, sortIdentifiers, termOccurrences, tokenize } from "./redaction-view";
import { buildClientRedaction, CLIENT_REDACTION_LIMITS, loadSampleStatement, SAMPLE_STATEMENT } from "./client-redaction";
import { pageTextFromItems, serverRedactionSummary, uploadErrorCopy } from "./upload";

const f = (category: FoundIdentifier["category"], value: string, occurrences = 1, pages = [1]): FoundIdentifier => ({ id: `${category}:${value}`, category, value, occurrences, pages });

describe("the upload's client_redaction field (design point 3)", () => {
  it("carries every removed identifier with its category and value, and the terms, in the contract's shape", () => {
    const p = buildClientRedaction({ removed: [f("name", "Riley Okafor"), f("member_id", " TWS-4471902 ")] }, ["Okafor Dental", "  "]);
    expect(p).toEqual({ version: 1, identifiers: [{ category: "name", value: "Riley Okafor" }, { category: "member_id", value: "TWS-4471902" }], extra_terms: ["Okafor Dental"] });
  });
  it("keeps within the limits: values 2..120 characters, at most 300 identifiers and 20 terms of up to 64 characters, under 64 KB", () => {
    const many = Array.from({ length: 400 }, (_, i) => f("account_number", `AC-${String(i).padStart(6, "0")}`));
    const p = buildClientRedaction({ removed: [f("name", "X"), f("address", "y".repeat(121)), ...many] }, Array.from({ length: 30 }, (_, i) => `term ${i}`).concat(["z".repeat(65)]));
    expect(p.identifiers).toHaveLength(CLIENT_REDACTION_LIMITS.identifiers);
    expect(p.identifiers.every((x) => x.value.length >= 2 && x.value.length <= 120)).toBe(true);
    expect(p.extra_terms).toHaveLength(20);
    expect(p.extra_terms.every((t) => t.length <= 64)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(p)).length).toBeLessThanOrEqual(64 * 1024);
  });
  it("drops repeated values and repeated terms", () => {
    const p = buildClientRedaction({ removed: [f("name", "Riley Okafor"), f("name", "Riley Okafor")] }, ["A1", "A1"]);
    expect(p.identifiers).toHaveLength(1);
    expect(p.extra_terms).toEqual(["A1"]);
  });
  it("has its own sentence for the server's 422", () => {
    expect(uploadErrorCopy(new ApiError(422, "/me/documents/upload", { detail: { error: "invalid_client_redaction" } }))).toBe(UPLOAD.invalidClientRedaction);
  });
});

describe("the server's summary (design point 4)", () => {
  const summary = { total: 12, by_category: { name: 2, phone: 1, bogus: "x" }, occurrences: 31, from_device: 12, from_server_check: 0, masked: [{ category: "name", masked: "R•••• O•••••", occurrences: 8 }, { nope: 1 }] };
  it("is read from the upload response, the document record or GET extraction", () => {
    expect(serverRedactionSummary({ redaction_preview: { text: "", removed: [], summary } })?.total).toBe(12);
    expect(serverRedactionSummary({ redaction_summary: summary })?.total).toBe(12);
    expect(serverRedactionSummary({ redaction: { summary } })?.total).toBe(12);
  });
  it("keeps only well-formed counts and masked rows", () => {
    const s = serverRedactionSummary({ redaction_summary: summary })!;
    expect(s.by_category).toEqual({ name: 2, phone: 1 });
    expect(s.masked).toHaveLength(1);
    expect(s.from_server_check).toBe(0);
  });
  it("is null when the server sent none or sent something else", () => {
    expect(serverRedactionSummary(null)).toBeNull();
    expect(serverRedactionSummary({ redaction_preview: { text: "", removed: ["ssn"] } })).toBeNull();
    expect(serverRedactionSummary({ redaction_summary: { total: -1 } })).toBeNull();
    expect(serverRedactionSummary({ redaction_summary: { total: 1.5 } })).toBeNull();
  });
});

describe("page text from pdf.js items", () => {
  it("joins items with spaces and breaks lines where pdf.js marks an end of line", () => {
    const items = [{ str: "Member:", hasEOL: false }, { str: "Riley  Okafor", hasEOL: true }, { str: "Member ID: TWS-4471902", hasEOL: true }, { type: "beginMarkedContent" }, { str: "", hasEOL: true }, { str: "Page 1", hasEOL: false }];
    expect(pageTextFromItems(items)).toBe("Member: Riley Okafor\nMember ID: TWS-4471902\nPage 1");
  });
});

describe("the fictional sample statement (design point 5)", () => {
  it("is read from the public fixtures as a PDF File and goes down the same path as a picked file", async () => {
    const fetcher = vi.fn(async () => new Response(new Blob(["%PDF-1.7"]), { status: 200 }));
    const file = await loadSampleStatement(fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledWith(SAMPLE_STATEMENT.path);
    expect(SAMPLE_STATEMENT.path).toMatch(/^\/fixtures\/documents\/[a-z0-9_-]{1,96}\.pdf$/);   // api/app/server.py serves only this shape
    expect(file.name).toBe(SAMPLE_STATEMENT.name);
    expect(file.type).toBe("application/pdf");
  });
  it("reports a missing file", async () => {
    await expect(loadSampleStatement((async () => new Response("", { status: 404 })) as unknown as typeof fetch)).rejects.toThrow();
  });
});

describe("review view helpers", () => {
  it("prints page ranges", () => {
    expect(pageRanges([1, 2, 3, 4])).toBe("1–4");
    expect(pageRanges([4, 1, 2])).toBe("1, 2, 4");
    expect(pageRanges([2, 2, 7, 8, 9, 11])).toBe("2, 7–9, 11");
    expect(pageRanges([])).toBe("");
  });
  it("describes what a masked value still shows", () => {
    expect(maskedVisible("•••• 1902")).toBe("1902");
    expect(maskedVisible("R•••• O•••••")).toBe("R O");
    expect(maskedVisible("••/••/••••")).toBe("/ /");
    expect(maskedVisible("••••")).toBe("");
  });
  it("splits redacted text into runs and placeholder tokens", () => {
    expect(tokenize("Member: [name removed] · ID [member ID removed] $50")).toEqual([
      { text: "Member: " }, { token: "name", text: "name removed" }, { text: " · ID " }, { token: "member_id", text: "member ID removed" }, { text: " $50" },
    ]);
    expect(tokenize("[date of birth removed]")).toEqual([{ token: "dob", text: "date of birth removed" }]);
    expect(tokenize("no tokens [here]")).toEqual([{ text: "no tokens [here]" }]);
  });
  it("shows whole pages up to the budget and says how much", () => {
    const v = previewPages(["a".repeat(30), "line one\nline two\nline three", ""], 40);
    expect(v.pages.map((p) => p.page)).toEqual([1, 2]);
    expect(v.pages[1].text).toBe("line one");
    expect(v.total).toBe(30 + 28);
    expect(v.shown).toBe(38);
    expect(previewPages(["", "  "], 100).pages).toEqual([]);
  });
  it("orders categories and rows for display", () => {
    expect(categoryCounts({ phone: 1, name: 2, email: 0 })).toEqual([{ category: "name", count: 2 }, { category: "phone", count: 1 }]);
    expect(sortIdentifiers([f("phone", "910", 1, [1]), f("name", "B", 1, [2]), f("name", "A", 1, [1])]).map((x) => x.value)).toEqual(["A", "B", "910"]);
  });
  it("finds where a term landed, ignoring case, spacing and punctuation", () => {
    const result = { removed: [f("phone", "(910) 555-0147", 2), f("name", "Riley Okafor", 3)] };
    expect(termOccurrences(result, "910-555-0147")).toBe(2);
    expect(termOccurrences(result, "riley  okafor")).toBe(3);
    expect(termOccurrences(result, "Lighthouse")).toBeNull();
    expect(termOccurrences(result, "--")).toBeNull();
  });
});
