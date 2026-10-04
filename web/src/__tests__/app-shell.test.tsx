import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildVersion, injectServiceWorker, precacheList, SHELL_ART } from "../../scripts/app-shell-plugin";
import { gateView, OfflineScreen, servedOffline } from "@/components/OnlineGate";
import { OFFLINE } from "@/lib/copy";

/** Installable, offline-capable app: the build stamps public/sw.js; the worker caches the shell and art only and never /api/*. */
const TEMPLATE = readFileSync(join(__dirname, "..", "..", "public", "sw.js"), "utf8");
const BUNDLE = ["index.html", "assets/index-AAA.js", "assets/index-BBB.css", "assets/motion-CCC.js", "assets/pdfjs-DDD.js",
  "assets/pdf.worker.min-EEE.mjs", "assets/PageView-FFF.js", "art/emblem.png", "sw.js", "manifest.webmanifest"];

describe("app-shell build step", () => {
  const list = precacheList(BUNDLE);
  it("precaches the shell, the hashed JS/CSS and the first-screen art, not pdf.js and nothing under /api", () => {
    expect(list).toContain("/");
    expect(list).toContain("/manifest.webmanifest");
    for (const f of ["/assets/index-AAA.js", "/assets/index-BBB.css", "/assets/motion-CCC.js", "/assets/PageView-FFF.js"]) expect(list).toContain(f);
    for (const a of SHELL_ART) expect(list).toContain(a);
    expect(list).toContain("/art/journey-passage-960.avif");
    expect(list).not.toContain("/art/journey-passage.webp");   // phones take the variant, never the 1080 px original
    expect(list.filter((u) => /pdf/.test(u))).toEqual([]);
    expect(list.filter((u) => u.startsWith("/api"))).toEqual([]);
  });
  it("derives the cache version from the bytes of the build", () => {
    const a = buildVersion(list, (u) => `bytes of ${u}`, TEMPLATE);
    const b = buildVersion(list, (u) => (u === "/" ? "a new index.html" : `bytes of ${u}`), TEMPLATE);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(b).not.toBe(a);
    expect(buildVersion(list, (u) => `bytes of ${u}`, TEMPLATE)).toBe(a);
  });
  it("stamps the two marker lines and refuses a template without them", () => {
    const out = injectServiceWorker(TEMPLATE, "abc123def456", list);
    expect(out).toContain('const BUILD = "abc123def456";');
    expect(out).toContain(`const PRECACHE = ${JSON.stringify(list)};`);
    expect(() => injectServiceWorker("self.addEventListener('push', () => {})", "x", list)).toThrow(/marker/);
  });
});

/* A small fake of the service-worker globals: enough to run sw.js and watch what it intercepts and what it writes to Cache Storage. */
type Listener = (event: Record<string, unknown>) => void;
function loadWorker(source: string, network: (url: string) => Promise<Response>) {
  const listeners: Record<string, Listener[]> = {};
  const stores = new Map<string, Map<string, Response>>();
  const puts: string[] = [];
  const keyOf = (r: Request | string) => new URL(typeof r === "string" ? r : r.url, "https://oc.test").href;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      add: async (r: Request) => { const res = await network(keyOf(r)); m.set(keyOf(r), res); puts.push(keyOf(r)); },
      put: async (r: Request, res: Response) => { m.set(keyOf(r), res); puts.push(keyOf(r)); },
      match: async (r: Request | string) => m.get(keyOf(r))?.clone(),
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (r: Request | string) => { for (const m of stores.values()) { const hit = m.get(keyOf(r)); if (hit) return hit.clone(); } return undefined; },
  };
  const self = {
    location: new URL("https://oc.test/sw.js"),
    addEventListener: (type: string, fn: Listener) => { (listeners[type] ??= []).push(fn); },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined, matchAll: async () => [], openWindow: async () => undefined },
    registration: { showNotification: async () => undefined },
  };
  const fetchFn = (r: Request) => network(keyOf(r));
  const FakeRequest = function (url: string) { return { url: new URL(url, "https://oc.test").href }; };   // the worker resolves URLs against its origin
  new Function("self", "caches", "fetch", "Request", source)(self, caches, fetchFn, FakeRequest);
  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    const event = { ...extra, waitUntil: (p: Promise<unknown>) => { waits.push(p); }, respondWith: (p: Promise<Response>) => { responded = Promise.resolve(p); } };
    for (const fn of listeners[type] ?? []) fn(event);
    const response = responded ? await responded : undefined;
    await Promise.all(waits);
    return { responded: responded !== undefined, response };
  }
  const fetchEvent = (url: string, init: { method?: string; mode?: string } = {}) =>
    dispatch("fetch", { request: { url: new URL(url, "https://oc.test").href, method: init.method ?? "GET", mode: init.mode ?? "cors" } });
  return { dispatch, fetchEvent, stores, puts };
}

// a same-origin network response, as a browser types it ("basic"; Node's own Response says "default")
const ok = (body: string) => Promise.resolve(Object.defineProperty(new Response(body, { status: 200 }), "type", { value: "basic" }));
const LIST = precacheList(BUNDLE);
const STAMPED = injectServiceWorker(TEMPLATE, "v1v1v1v1v1v1", LIST);

describe("service worker", () => {
  it("never intercepts or caches the API, uploaded documents, non-GET requests or other origins", async () => {
    const w = loadWorker(STAMPED, (u) => ok(`net ${u}`));
    await w.dispatch("install");
    for (const [url, init] of [["/api/journeys/sample"], ["/api/documents/UP1/file"], ["/api"], ["/assets/index-AAA.js", { method: "POST" }],
      ["https://elsewhere.test/art/a.webp"], ["/fixtures/documents/harborview.pdf", { mode: "navigate" }], ["/manifest.webmanifest"]] as const) {
      expect((await w.fetchEvent(url, init)).responded, url).toBe(false);
    }
    expect(w.puts.filter((u) => new URL(u).pathname.startsWith("/api"))).toEqual([]);
  });
  it("precaches the shell on install and serves hashed bundles and art from the cache", async () => {
    const w = loadWorker(STAMPED, (u) => ok(`net ${u}`));
    await w.dispatch("install");
    expect([...w.stores.keys()]).toEqual(["oralcompass-shell-v1v1v1v1v1v1"]);
    expect(w.stores.get("oralcompass-shell-v1v1v1v1v1v1")!.size).toBe(LIST.length);
    const js = await w.fetchEvent("/assets/index-AAA.js");
    expect(js.responded).toBe(true);
    expect(await js.response!.text()).toBe("net https://oc.test/assets/index-AAA.js");
    const art = await w.fetchEvent("/art/journey-backdrop-phone.webp");
    expect(art.responded).toBe(true);
    expect(w.stores.get("oralcompass-art-1")?.has("https://oc.test/art/journey-backdrop-phone.webp")).toBe(true);   // revalidated copy
  });
  it("offline: a navigation gets the cached shell, or the parchment offline page when there is none", async () => {
    let online = true;
    const w = loadWorker(STAMPED, (u) => (online ? ok(`net ${u}`) : Promise.reject(new TypeError("Failed to fetch"))));
    await w.dispatch("install");
    online = false;
    const nav = await w.fetchEvent("/plan", { mode: "navigate" });
    expect(await nav.response!.text()).toBe("net https://oc.test/");   // the fake shell has no <head>: served as is
    const shell = w.stores.get("oralcompass-shell-v1v1v1v1v1v1")!;
    shell.set("https://oc.test/", new Response("<!doctype html><html><head><title>OralCompass</title></head><body></body></html>", { headers: { "Content-Type": "text/html", "Content-Encoding": "gzip" } }));
    const marked = await w.fetchEvent("/", { mode: "navigate" });
    expect(await marked.response!.text()).toContain('<head><meta name="oralcompass-offline" content="1"><title>');
    expect(marked.response!.headers.get("content-encoding")).toBeNull();
    w.stores.clear();
    const bare = await w.fetchEvent("/", { mode: "navigate" });
    expect(bare.response!.status).toBe(503);
    const html = await bare.response!.text();
    expect(html).toContain(OFFLINE.title);
    expect(html).toContain(OFFLINE.body);
  });
  it("drops the caches of older builds on activate and keeps the art cache and other apps' caches", async () => {
    const w = loadWorker(STAMPED, (u) => ok(`net ${u}`));
    w.stores.set("oralcompass-shell-0ld0ld0ld0ld", new Map());
    w.stores.set("oralcompass-art-1", new Map());
    w.stores.set("someone-else", new Map());
    await w.dispatch("install");
    await w.dispatch("activate");
    expect([...w.stores.keys()].sort()).toEqual(["oralcompass-art-1", "oralcompass-shell-v1v1v1v1v1v1", "someone-else"]);
  });
  it("unstamped (vite dev), it handles push only and intercepts nothing", async () => {
    const w = loadWorker(TEMPLATE, (u) => ok(`net ${u}`));
    await w.dispatch("install");
    expect(w.stores.size).toBe(0);
    expect((await w.fetchEvent("/assets/index-AAA.js")).responded).toBe(false);
    expect((await w.fetchEvent("/", { mode: "navigate" })).responded).toBe(false);
    expect(TEMPLATE).toMatch(/addEventListener\("push"/);
  });
});

describe("OnlineGate", () => {
  it("shows the offline screen only when the app has not opened yet", () => {
    expect(gateView(false, false)).toBe("offline-screen");
    expect(gateView(true, false)).toBe("offline-screen");   // the shell the worker served after a failed navigation
    expect(gateView(false, true)).toBe("app-offline");
    expect(gateView(true, true)).toBe("app");
  });
  it("reads the worker's offline mark on the served shell", () => {
    expect(servedOffline({ querySelector: (s: string) => (s.includes("oralcompass-offline") ? ({} as Element) : null) })).toBe(true);
    expect(servedOffline({ querySelector: () => null })).toBe(false);
  });
  it("renders the parchment offline screen with a heading and a retry button", () => {
    const html = renderToStaticMarkup(<OfflineScreen onRetry={() => undefined} />);
    expect(html).toContain(`<h1 id="offline-title">${OFFLINE.title}</h1>`);
    expect(html).toContain(OFFLINE.body);
    expect(html).toMatch(/<button type="button">Try again<\/button>/);
  });
});
