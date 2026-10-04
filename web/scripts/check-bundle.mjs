import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
let main = 0, pdfjsSeparate = false;
for (const f of readdirSync("dist/assets")) {
  if (!f.endsWith(".js")) continue;
  const gz = gzipSync(readFileSync(`dist/assets/${f}`)).length;
  console.log(`${f}  ${(gz / 1024).toFixed(1)} KB gzip`);
  if (f.startsWith("index-")) main = gz;
  if (f.startsWith("pdfjs-")) pdfjsSeparate = true;
}
if (main > 350 * 1024) { console.error("main chunk over 350 KB gzip"); process.exit(1); }
if (!pdfjsSeparate) { console.error("pdfjs is not a separate chunk"); process.exit(1); }
console.log(`OK-bundle main=${(main / 1024).toFixed(1)}KB`);
