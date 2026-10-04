// Reads a PDF's text layer with pdf.js (the same library and the same joining rule the browser upload uses in web/src/lib/pdf-text.ts)
// and prints JSON to stdout: { pages: string[], lines: string[] }.
//   pages: per page, every text item joined with " " and whitespace collapsed (exactly what inspectPdf() produces today);
//   lines: per page, the same text with a "\n" wherever pdf.js marks an end of line (hasEOL), for detectors that keep line structure.
// Used by tools/make_sample_statement.py to write web/src/lib/__fixtures__/sample-statement-text.ts.
// Run: node tools/sample_statement_text.mjs fixtures/documents/tw26_fictional_sample_statement.pdf
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PDFJS = resolve(ROOT, "web/node_modules/pdfjs-dist");

const file = process.argv[2];
if (!file) {
  console.error("usage: node tools/sample_statement_text.mjs <file.pdf>");
  process.exit(2);
}

const pdfjs = await import(pathToFileURL(resolve(PDFJS, "legacy/build/pdf.mjs")).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolve(PDFJS, "legacy/build/pdf.worker.mjs")).href;

const data = new Uint8Array(readFileSync(resolve(file)));
const doc = await pdfjs.getDocument({ data, standardFontDataUrl: resolve(PDFJS, "standard_fonts") + "/", verbosity: 0 }).promise;
const pages = [];
const lines = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  const items = content.items.filter((it) => "str" in it);
  pages.push(items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim());
  let text = "";
  for (const it of items) text += it.str + (it.hasEOL ? "\n" : " ");
  lines.push(
    text
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l.length > 0)
      .join("\n"),
  );
}
await doc.destroy();
process.stdout.write(JSON.stringify({ pages, lines }));
