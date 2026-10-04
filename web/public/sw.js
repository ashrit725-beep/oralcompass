/* OralCompass service worker: the offline app shell and Web Push (api/app/notifications.py).
   Registered by main.tsx in production builds (lib/app-shell.ts) and by components/notifications/RemindersPanel.tsx when reminders are
   turned on; both use the same script URL and scope, so there is one registration.

   PERSONAL DATA NEVER ENTERS CACHE STORAGE. The fetch handler works from an allowlist: the precached shell (index.html, the hashed JS/CSS
   bundles, the manifest, the first-screen art), other content-hashed /assets/* files, and the painted /art/* plates. Every other request,
   and in particular everything under /api/ (journeys, estimates, benefits, reminders, uploaded documents and the bytes pdf.js reads from
   them), is not intercepted at all: it goes straight to the network and is never written to a cache. Nothing in the allowlist is personal:
   build files and public artwork only (docs/SECURITY.md, "Offline app shell").

   Push: the notification body is FIXED and generic: the payload is never read for text, so no figure, name, procedure or date can leave
   the app through the push channel.

   The two marker lines below are rewritten at build time (web/scripts/app-shell-plugin.ts): BUILD becomes a hash of the build and PRECACHE
   the shell's URLs. Unstamped (vite dev), the worker handles push only and intercepts nothing. */
const BUILD = "dev";
const PRECACHE = [];

const SHELL_CACHE = `oralcompass-shell-${BUILD}`;
const ART_CACHE = "oralcompass-art-1";
const OWN_PREFIX = "oralcompass-";
const SHELL_ON = BUILD !== "dev" && PRECACHE.length > 0;
const NAVIGATION_TIMEOUT_MS = 4000;
const MATCH = { ignoreVary: true };   // the server adds Vary: Accept-Encoding (gzip); the URL alone names a shell file

const TITLE = "OralCompass";
const BODY = "A date you chose to follow is approaching. Open the app for details.";

/* The last resort when neither the network nor the cached shell can answer a navigation. Information only, parchment style, no script. */
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f6f0e3"><title>OralCompass</title><style>
html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#f6f0e3;color:#23303d;font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:max(24px,env(safe-area-inset-top)) 24px max(24px,env(safe-area-inset-bottom))}
main{max-width:22rem;text-align:center}h1{font:600 1.5rem/1.25 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;margin:0 0 .5rem}p{margin:0 0 1.25rem;color:#505a66}
a{display:inline-flex;align-items:center;min-height:44px;padding:0 1.25rem;border-radius:999px;background:#23303d;color:#f6f0e3;text-decoration:none}
</style></head><body><main><h1>You are offline.</h1><p>We need the internet to show your numbers.</p><a href="/">Try again</a></main></body></html>`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (!SHELL_ON) return;
  // Best effort, one file at a time: a file that fails to download is fetched again on use, and the worker still installs so push keeps working.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) =>
    Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })))),
  ));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(OWN_PREFIX) && k !== SHELL_CACHE && k !== ART_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(response) {
  return response && response.status === 200 && response.type === "basic";
}

function offlinePage() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "Cache-Control": "no-store" },
  });
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/* Navigations: the network first (index.html is no-cache, so a new deploy is picked up at once); offline or slower than 4 s, the cached
   shell of this build, marked with <meta name="oralcompass-offline">: the browser can still report navigator.onLine === true when the
   network is gone (captive portals, a dead uplink), and the mark tells components/OnlineGate.tsx to show its offline screen instead of
   starting API requests that cannot succeed. */
const OFFLINE_MARK = '<meta name="oralcompass-offline" content="1">';
async function navigate(request) {
  try {
    return await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const shell = await cache.match("/", MATCH);
    if (!shell) return offlinePage();
    const html = (await shell.text()).replace(/<head>/i, `<head>${OFFLINE_MARK}`);
    const headers = new Headers(shell.headers);
    headers.delete("content-length"); headers.delete("content-encoding");
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(html, { status: 200, headers });
  }
}

/* Content-hashed bundles never change under a name: cache first, filled on first use for the ones not precached (pdf.js, its worker). */
async function hashedAsset(request) {
  const hit = await caches.match(request, MATCH);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      const copy = response.clone();
      await caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch {
    return Response.error();
  }
}

/* Painted plates: the cached copy at once, a fresh copy fetched behind it for next time. */
function staleWhileRevalidate(event, request) {
  const fresh = fetch(request).then(async (response) => {
    if (cacheable(response)) {
      const copy = response.clone();
      await caches.open(ART_CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  });
  event.waitUntil(fresh.catch(() => undefined));
  return (async () => {
    const hit = (await caches.open(ART_CACHE).then((c) => c.match(request, MATCH))) || (await caches.open(SHELL_CACHE).then((c) => c.match(request, MATCH)));
    return hit || fresh.catch(() => Response.error());
  })();
}

self.addEventListener("fetch", (event) => {
  if (!SHELL_ON) return;
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercepted, never cached: the API (every personal record and every uploaded document lives behind it).
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    // client-side routes only: a navigation to a file (a fixture PDF opened in a new tab) goes to the network untouched
    const last = url.pathname.split("/").pop() || "";
    if (url.pathname === "/" || url.pathname === "/index.html" || !last.includes(".")) event.respondWith(navigate(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) { event.respondWith(hashedAsset(request)); return; }
  if (url.pathname.startsWith("/art/")) { event.respondWith(staleWhileRevalidate(event, request)); return; }
  // everything else (the manifest, /fixtures/*): the browser's own fetch
});

self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification(TITLE, { body: BODY, icon: "/art/emblem.png", badge: "/art/emblem.png", tag: "oralcompass-reminder", renotify: false }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => "focus" in c);
      return open ? open.focus() : self.clients.openWindow("/");
    }),
  );
});
