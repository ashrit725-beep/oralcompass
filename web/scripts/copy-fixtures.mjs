// Copies the public fixtures the web app fetches at runtime into web/public/fixtures
// (gitignored): ../fixtures/plans/*.json and ../fixtures/documents/*.pdf. Run by the
// predev, prebuild and prepreview npm hooks so a fresh checkout never ships without
// fixtures/documents/tw26_fictional_sample_statement.pdf ("Try a fictional sample statement").
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = resolve(webDir, "..", "fixtures");
const destRoot = join(webDir, "public", "fixtures");

const SETS = [
  { dir: "plans", ext: ".json" },
  { dir: "documents", ext: ".pdf" },
];
const REQUIRED = ["documents/tw26_fictional_sample_statement.pdf"];

let copied = 0;
for (const { dir, ext } of SETS) {
  const from = join(srcRoot, dir);
  if (!existsSync(from)) {
    console.error(`copy-fixtures: missing ${from}; the web build needs the repo's fixtures/ directory`);
    process.exit(1);
  }
  const to = join(destRoot, dir);
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (!name.endsWith(ext)) continue;
    copyFileSync(join(from, name), join(to, name));
    copied += 1;
  }
}
for (const rel of REQUIRED) {
  if (!existsSync(join(destRoot, rel))) {
    console.error(`copy-fixtures: ${rel} was not copied into public/fixtures`);
    process.exit(1);
  }
}
console.log(`copy-fixtures: ${copied} files -> public/fixtures`);
