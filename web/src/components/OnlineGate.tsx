import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { OFFLINE, UI } from "@/lib/copy";

/**
 * OnlineGate (installable app, offline). The service worker serves this build's shell without a connection (public/sw.js); the journey's
 * figures always come from /api, which is never cached. So:
 * - opened without a connection, the gate shows the parchment offline screen INSTEAD of the app, and no API request is made. "Without a
 *   connection" is navigator.onLine === false, or the service worker's mark on the cached shell it served because the network failed
 *   (`<meta name="oralcompass-offline">`: browsers can report onLine while the network is gone);
 * - when the connection returns (the `online` event), the app mounts and loads its data as usual;
 * - once the app is open, losing the connection keeps what is on screen and adds a status line saying figures cannot load.
 * Information only: it states what is missing.
 */
export type GateView = "offline-screen" | "app" | "app-offline";

export function gateView(online: boolean, opened: boolean): GateView {
  if (!opened) return "offline-screen";
  return online ? "app" : "app-offline";
}

const PROBE_URL = "/manifest.webmanifest";
const PROBE_MS = 6000;

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => { window.removeEventListener("online", onChange); window.removeEventListener("offline", onChange); };
}
const readOnline = () => (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean" ? true : navigator.onLine);
/** True when this document is the cached shell the service worker served because the network failed (public/sw.js, navigate()). */
export function servedOffline(doc: Pick<Document, "querySelector"> | undefined = typeof document === "undefined" ? undefined : document): boolean {
  return !!doc?.querySelector('meta[name="oralcompass-offline"]');
}

export function OfflineScreen({ onRetry }: { onRetry?: () => void }) {
  return (
    <main id="main" className="offline-screen" aria-labelledby="offline-title">
      <div className="offline-card">
        <img className="offline-mark" src="/art/icons/icon-192.png" alt="" width={72} height={72} />
        <p className="offline-app">{UI.appName}</p>
        <h1 id="offline-title">{OFFLINE.title}</h1>
        <p className="offline-body">{OFFLINE.body}</p>
        <p className="offline-returns">{OFFLINE.returns}</p>
        <button type="button" onClick={onRetry ?? (() => window.location.reload())}>{OFFLINE.retry}</button>
      </div>
    </main>
  );
}

export function OnlineGate({ children }: { children: ReactNode }) {
  const online = useSyncExternalStore(subscribe, readOnline, () => true);
  // a shell served from the cache after a failed navigation opens on the offline screen; "Try again" reloads through the network
  const [opened, setOpened] = useState(() => online && !servedOffline());
  const [sawOffline, setSawOffline] = useState(!online);
  useEffect(() => { if (!online) setSawOffline(true); else if (sawOffline || !servedOffline()) setOpened(true); }, [online, sawOffline]);
  const view = gateView(online, opened);
  // reported online but showing the offline screen (the worker's mark): no `online` event will come, so check the connection now and then
  // with a HEAD request the worker never intercepts (no body, no personal data) and open the app when it answers
  useEffect(() => {
    if (view !== "offline-screen" || !online) return;
    let stopped = false;
    const probe = () => {
      fetch(PROBE_URL, { method: "HEAD", cache: "no-store" }).then((r) => { if (!stopped && r.ok) setOpened(true); }, () => undefined);
    };
    const timer = window.setInterval(probe, PROBE_MS);
    const onVisible = () => { if (document.visibilityState === "visible") probe(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [view, online]);
  if (view === "offline-screen") return <OfflineScreen />;
  return (
    <>
      {children}
      {/* one persistent live region, so the line is announced when it appears */}
      <div role="status" className="offline-status">{view === "app-offline" && <p className="offline-banner">{OFFLINE.banner}</p>}</div>
    </>
  );
}
