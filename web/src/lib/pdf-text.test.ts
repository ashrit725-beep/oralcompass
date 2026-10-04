import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_STATEMENT_FILE, SAMPLE_STATEMENT_IDENTIFIER_COUNT, SAMPLE_STATEMENT_IDENTIFIERS, SAMPLE_STATEMENT_PAGE_LINES,
} from "./__fixtures__/sample-statement-text";
import { pageTextFromItems } from "./pdf-text";
import * as redact from "./redact";
import * as upload from "./upload";

const PDF = join(__dirname, "../../../fixtures/documents", SAMPLE_STATEMENT_FILE);
const key = (category: string, value: string) => `${category}:${value.toLowerCase()}`;

/** The fictional sample statement read with pdf.js the way inspectPdf() reads it in the browser (one string per page). */
async function samplePageTexts(): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(PDF)), useSystemFonts: false, verbosity: 0 }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) pages.push(pageTextFromItems((await (await doc.getPage(i)).getTextContent()).items));
    return pages;
  } finally {
    await doc.destroy();
  }
}

describe("pageTextFromItems (one shared implementation)", () => {
  it("is the function redact.ts re-exports, and upload.ts no longer defines its own", () => {
    expect(redact.pageTextFromItems).toBe(pageTextFromItems);
    expect("pageTextFromItems" in upload).toBe(false);
  });

  it("skips marked content, collapses whitespace, trims lines and drops empty ones", () => {
    const items = [
      { str: " Member:", hasEOL: false }, { str: "Riley  Okafor ", hasEOL: true }, { type: "beginMarkedContent" }, null, "x",
      { str: "", hasEOL: true }, { str: "Member ID:\tTWS-4471902", hasEOL: true }, { str: undefined, hasEOL: true }, { str: "Page 1" },
    ];
    expect(pageTextFromItems(items)).toBe("Member: Riley Okafor\nMember ID: TWS-4471902\nPage 1");
    expect(pageTextFromItems([])).toBe("");
  });

  it("reads the fictional sample statement exactly as the committed fixture's line text", async () => {
    expect(await samplePageTexts()).toEqual([...SAMPLE_STATEMENT_PAGE_LINES]);
  }, 30_000);

  it("gives the on-device detector exactly the 12 identifiers printed on the sample", async () => {
    const found = redact.detectIdentifiers(await samplePageTexts());
    expect(found).toHaveLength(SAMPLE_STATEMENT_IDENTIFIER_COUNT);
    expect(found.map((f) => key(f.category, f.value)).sort()).toEqual(SAMPLE_STATEMENT_IDENTIFIERS.map((i) => key(i.category, i.value)).sort());
  }, 30_000);
});
