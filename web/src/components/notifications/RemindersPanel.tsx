import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { REMINDERS } from "@/lib/copy/upload";
import { pushSupported, urlBase64ToUint8Array } from "@/lib/upload";
import { remindersApi, type ReminderItem, type RemindersResponse } from "./remindersApi";

/**
 * RemindersPanel (master prompt §19; api/app/notifications.py). Lists GET /me/reminders (fact sentences with their clause cite and source;
 * nothing urges), and manages this browser's Web Push subscription: the service worker `/sw.js` is registered HERE (not in main.tsx), the
 * VAPID public key comes from GET /notifications/vapid-public-key, the subscription is stored with POST /me/push/subscriptions and removed
 * with DELETE. The push body is fixed and generic (sw.js never shows payload text). "Send a test push" renders only when the dev-auth
 * header was accepted (the API exposes the test route in dev mode only; a 404 hides the button). One `role="status"` live region.
 */
export interface RemindersPanelProps { asOf?: string; className?: string }

type PushState = "unsupported" | "insecure" | "checking" | "off" | "on" | "working" | "denied" | "nokey";

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return reg ? reg.pushManager.getSubscription() : null;
}

export function RemindersPanel({ asOf, className }: RemindersPanelProps) {
  const [data, setData] = useState<RemindersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState<PushState>("checking");
  const [subId, setSubId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [devAuth, setDevAuth] = useState(false);
  const [testAvailable, setTestAvailable] = useState(true);
  const headingId = useId();

  useEffect(() => {
    let cancelled = false;
    remindersApi.reminders(asOf).then((r) => { if (!cancelled) { setData(r); setDevAuth(true); } }).catch(() => { if (!cancelled) setError(REMINDERS.failed); });
    return () => { cancelled = true; };
  }, [asOf]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) { setPush("unsupported"); return; }
      if (!window.isSecureContext) { setPush("insecure"); return; }
      if (Notification.permission === "denied") { setPush("denied"); return; }
      try {
        const sub = await currentSubscription();
        if (cancelled) return;
        if (!sub) { setPush("off"); return; }
        const mine = await remindersApi.subscriptions().catch(() => ({ items: [] }));
        const match = mine.items.find((s) => s.endpoint === sub.endpoint);
        if (cancelled) return;
        setSubId(match?.id ?? null);
        setPush(match ? "on" : "off");
      } catch { if (!cancelled) setPush("off"); }
    })();
    return () => { cancelled = true; };
  }, []);

  const subscribe = useCallback(async () => {
    setPush("working"); setStatus(REMINDERS.working);
    try {
      const { public_key } = await remindersApi.vapidPublicKey().catch((e) => { throw e instanceof ApiError && e.status === 404 ? new Error("nokey") : e; });
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setPush("denied"); setStatus(REMINDERS.denied); return; }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(public_key) as BufferSource }));
      const json = sub.toJSON();
      const stored = await remindersApi.addSubscription({
        endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" }, expiration_time: sub.expirationTime ?? null, label: navigator.userAgent.slice(0, 80),
      });
      setSubId(stored.id); setPush("on"); setStatus(REMINDERS.subscribed);
    } catch (e) {
      if (e instanceof Error && e.message === "nokey") { setPush("nokey"); setStatus(REMINDERS.noKey); return; }
      setPush("off"); setStatus(REMINDERS.subscribeFailed);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setPush("working"); setStatus(REMINDERS.working);
    try {
      const sub = await currentSubscription();
      if (sub) await sub.unsubscribe();
      if (subId) await remindersApi.deleteSubscription(subId).catch(() => undefined);
      setSubId(null); setPush("off"); setStatus(REMINDERS.notSubscribed);
    } catch { setPush("on"); setStatus(REMINDERS.subscribeFailed); }
  }, [subId]);

  const testPush = useCallback(async () => {
    setStatus(REMINDERS.working);
    try {
      const r = await remindersApi.pushTest();
      setStatus(REMINDERS.testSent(r.sent, r.failed));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) { setTestAvailable(false); setStatus(null); return; }
      setStatus(REMINDERS.testUnavailable);
    }
  }, []);

  const pushLine: Record<PushState, string> = {
    unsupported: REMINDERS.unsupported, insecure: REMINDERS.insecure, checking: REMINDERS.working, off: REMINDERS.notSubscribed, on: REMINDERS.subscribed,
    working: REMINDERS.working, denied: REMINDERS.denied, nokey: REMINDERS.noKey,
  };
  const canToggle = push === "off" || push === "on";

  return (
    <section className={["rm-panel", className].filter(Boolean).join(" ")} aria-labelledby={headingId}>
      <h3 id={headingId} className="rm-h3">{REMINDERS.title}</h3>
      <p className="rm-caption">{REMINDERS.intro}</p>
      {error && <p role="alert" className="rm-error">{error}</p>}
      {!data && !error && <p className="rm-caption">{REMINDERS.loading}</p>}
      {data && (
        <>
          <p className="rm-caption">{REMINDERS.asOf(data.as_of)}</p>
          {data.items.length === 0 ? <p className="rm-empty">{REMINDERS.empty}</p> : (
            <ul className="rm-list">
              {data.items.map((it: ReminderItem, i) => (
                <li key={`${it.kind}-${i}`} className="rm-item" data-kind={it.kind}>
                  <span className="rm-kind">{REMINDERS.kind[it.kind] ?? it.kind}</span>
                  <time className="rm-date" dateTime={it.date ?? undefined}>{it.date ?? REMINDERS.noDate}</time>
                  <p className="rm-text">{it.text}</p>
                  <p className="rm-source">
                    {it.cite && <span className="rm-cite"><span className="scope" aria-hidden="true">{it.cite.doc}</span> {REMINDERS.cite(it.cite.doc, it.cite.page)} <q>{it.cite.quote}</q></span>}
                    <span>{REMINDERS.source(it.source)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="rm-note">{data.note}</p>
        </>
      )}
      <div className="rm-push">
        <h4 className="rm-h4">{REMINDERS.pushTitle}</h4>
        <p className="rm-caption">{REMINDERS.pushBody}</p>
        <p className="rm-push-state" data-state={push}>{pushLine[push]}</p>
        <div className="rm-actions">
          {canToggle && (
            <Button type="button" size="touch" variant={push === "on" ? "outline" : "default"} aria-pressed={push === "on"} onClick={push === "on" ? unsubscribe : subscribe}>
              {push === "on" ? REMINDERS.unsubscribe : REMINDERS.subscribe}
            </Button>
          )}
          {devAuth && testAvailable && push === "on" && (
            <Button type="button" size="touch" variant="outline" onClick={testPush}>{REMINDERS.testPush}</Button>
          )}
        </div>
        {devAuth && testAvailable && push === "on" && <p className="rm-caption">{REMINDERS.devOnly}</p>}
        <p role="status" aria-live="polite" className="rm-status">{status}</p>
      </div>
    </section>
  );
}

export default RemindersPanel;
