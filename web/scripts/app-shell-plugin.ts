import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/**
 * App-shell build step (installable, offline-capable phone app). After Vite writes dist/, this stamps dist/sw.js (copied from public/sw.js)
 * with the precache list and a cache version derived from the build: a hash of every precached file's bytes plus the worker source, so a new
 * deploy gets a new cache name and the worker's activate step drops the old one.
 *
 * Precached: the built index.html (cached under "/"), the content-hashed JS and CSS bundles (pdf.js and its worker are left to the
 * runtime cache: they load only when a document is opened), the manifest and the first-screen art. Nothing under /api/ is ever listed and
 * nothing the visitor uploaded is a build file, so personal data cannot enter the precache (docs/SECURITY.md, "Offline app shell").
 */
export const SHELL_ART = [
  "/art/journey-passage-960.avif",   // the My journey plate as phones pick it (DPR 2-3, AVIF; lib/art-srcset)
  "/art/journey-passage-720.avif",   // ... and on a 320-360 px DPR 2 screen
  "/art/favicon.ico",
  "/art/icons/icon-32.png",
  "/art/icons/icon-180.png",
  "/art/icons/icon-192.png",
  "/art/icons/icon-512.png",
  "/art/icons/icon-512-maskable.png",
];
const SHELL_PAGES = ["/", "/manifest.webmanifest"];
const BUILD_MARKER = /^const BUILD = "dev";$/m;
const PRECACHE_MARKER = /^const PRECACHE = \[\];$/m;

/** The URLs the worker precaches, from the names of the files the bundle wrote (paths relative to dist/). */
export function precacheList(bundleFiles: string[]): string[] {
  const bundles = bundleFiles
    .filter((f) => /^assets\/[^/]+\.(js|css)$/.test(f) && !/^assets\/pdf/.test(f))
    .map((f) => `/${f}`);
  const list = [...SHELL_PAGES, ...SHELL_ART, ...bundles.sort()];
  if (list.some((u) => u.startsWith("/api/"))) throw new Error("app shell: /api/ must never be precached");
  return [...new Set(list)];
}

/** A short version for the cache name: the precache URLs, each file's bytes, and the worker template. */
export function buildVersion(list: string[], readFile: (url: string) => Buffer | string, workerSource: string): string {
  const h = createHash("sha256");
  for (const url of list) { h.update(url); h.update("\0"); h.update(readFile(url)); h.update("\0"); }
  h.update(workerSource);
  return h.digest("hex").slice(0, 12);
}

/** Replaces the two marker lines in the worker template; refuses a template that lost them (the shell would silently stay off). */
export function injectServiceWorker(source: string, version: string, list: string[]): string {
  if (!BUILD_MARKER.test(source) || !PRECACHE_MARKER.test(source)) throw new Error("app shell: sw.js lost its BUILD/PRECACHE marker lines");
  return source
    .replace(BUILD_MARKER, `const BUILD = ${JSON.stringify(version)};`)
    .replace(PRECACHE_MARKER, `const PRECACHE = ${JSON.stringify(list)};`);
}

export function appShellPlugin(): Plugin {
  return {
    name: "oralcompass-app-shell",
    apply: "build",
    writeBundle(options, bundle) {
      const outDir = options.dir;
      if (!outDir) return;
      const swPath = join(outDir, "sw.js");
      if (!existsSync(swPath) || !Object.prototype.hasOwnProperty.call(bundle, "index.html")) return;   // harness builds have no shell
      const template = readFileSync(swPath, "utf8");
      const list = precacheList(Object.keys(bundle));
      const fileFor = (url: string) => join(outDir, url === "/" ? "index.html" : url.slice(1));
      const missing = list.filter((u) => !existsSync(fileFor(u)));
      if (missing.length) throw new Error(`app shell: precache files missing from the build: ${missing.join(", ")}`);
      const version = buildVersion(list, (u) => readFileSync(fileFor(u)), template);
      writeFileSync(swPath, injectServiceWorker(template, version, list));
    },
  };
}
