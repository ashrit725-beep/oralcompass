import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_STATEMENT_BY_CATEGORY,
  SAMPLE_STATEMENT_FILE,
  SAMPLE_STATEMENT_IDENTIFIER_COUNT,
  SAMPLE_STATEMENT_IDENTIFIERS,
  SAMPLE_STATEMENT_MUST_KEEP,
  SAMPLE_STATEMENT_PAGE_COUNT,
  SAMPLE_STATEMENT_PAGE_LINES,
  SAMPLE_STATEMENT_PAGES,
  SAMPLE_STATEMENT_SHA256,
  SAMPLE_STATEMENT_URL,
} from "@/lib/__fixtures__/sample-statement-text";

const PDF = join(__dirname, "../../../fixtures/documents", SAMPLE_STATEMENT_FILE);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const count = (text: string, value: string) => (text.match(new RegExp(escape(value), "gi")) ?? []).length;

describe("fictional sample statement text fixture (tools/make_sample_statement.py)", () => {
  it("was generated from the committed PDF (same SHA-256), served under /fixtures/documents", () => {
    expect(createHash("sha256").update(readFileSync(PDF)).digest("hex")).toBe(SAMPLE_STATEMENT_SHA256);
    expect(SAMPLE_STATEMENT_URL).toBe(`/fixtures/documents/${SAMPLE_STATEMENT_FILE}`);
    expect(SAMPLE_STATEMENT_FILE).toMatch(/fictional/);
    expect(SAMPLE_STATEMENT_PAGES).toHaveLength(SAMPLE_STATEMENT_PAGE_COUNT);
    expect(SAMPLE_STATEMENT_PAGE_LINES).toHaveLength(SAMPLE_STATEMENT_PAGE_COUNT);
    SAMPLE_STATEMENT_PAGES.forEach((p) => expect(p).toMatch(/^FICTIONAL SAMPLE/));
  });

  it("lists exactly 12 distinct identifiers whose counts match the text", () => {
    expect(SAMPLE_STATEMENT_IDENTIFIERS).toHaveLength(12);
    expect(SAMPLE_STATEMENT_IDENTIFIER_COUNT).toBe(12);
    expect(new Set(SAMPLE_STATEMENT_IDENTIFIERS.map((i) => i.value.toLowerCase())).size).toBe(12);
    expect(Object.values(SAMPLE_STATEMENT_BY_CATEGORY).reduce((a, b) => a + (b ?? 0), 0)).toBe(12);
    for (const ident of SAMPLE_STATEMENT_IDENTIFIERS) {
      const perPage = SAMPLE_STATEMENT_PAGES.map((p) => count(p, ident.value));
      expect(perPage.reduce((a, b) => a + b, 0), ident.value).toBe(ident.occurrences);
      expect(perPage.flatMap((n, i) => (n ? [i + 1] : [])), ident.value).toEqual(ident.pages);
      expect(ident.occurrences).toBeGreaterThan(0);
    }
  });

  it("keeps the line-structured text identical to the flat text once whitespace is collapsed", () => {
    SAMPLE_STATEMENT_PAGE_LINES.forEach((p, i) => expect(p.replace(/\s+/g, " ")).toBe(SAMPLE_STATEMENT_PAGES[i]));
  });

  it("carries the text the AI needs, none of which overlaps an identifier", () => {
    const all = SAMPLE_STATEMENT_PAGES.join(" ");
    for (const keep of SAMPLE_STATEMENT_MUST_KEEP) {
      expect(all, keep).toContain(keep);
      for (const ident of SAMPLE_STATEMENT_IDENTIFIERS) expect(ident.value.includes(keep) || keep.includes(ident.value), `${keep} / ${ident.value}`).toBe(false);
    }
  });
});
