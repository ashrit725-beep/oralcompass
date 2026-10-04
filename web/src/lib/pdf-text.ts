/**
 * One page's text layer from pdf.js `getTextContent().items`, as lines: items joined with a space, a line break where pdf.js marks the end
 * of a line (`hasEOL`), whitespace runs collapsed, each line trimmed, empty lines dropped. Items without `str` (marked content) are skipped.
 *
 * The on-device identifier detector (redact.ts) reads label/value pairs up to the line end ("Member: Avery Rowan"), so the breaks matter.
 * This is the single implementation: upload.ts (main bundle) and redact.ts (lazy chunk) both import it, so it stays tiny and dependency-free.
 * It is the same rule tools/sample_statement_text.mjs uses to write SAMPLE_STATEMENT_PAGE_LINES.
 */
export function pageTextFromItems(items: readonly unknown[]): string {
  let out = "";
  for (const it of items) {
    if (!it || typeof it !== "object" || !("str" in it)) continue;
    const item = it as { str?: unknown; hasEOL?: unknown };
    out += String(item.str ?? "") + (item.hasEOL === true ? "\n" : " ");
  }
  return out.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}
