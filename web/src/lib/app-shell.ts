/**
 * Registers the app-shell service worker (public/sw.js) in production builds, after the page has loaded so the first paint never waits on
 * it. The worker precaches the built shell and the first-screen art and never caches /api/* (see the comment at the top of sw.js). A
 * browser without service workers, or a page that is not a secure context, simply runs online-only; a failed registration is not an error
 * the visitor can act on, so it is not reported. RemindersPanel registers the same URL and scope for Web Push, which reuses this registration.
 */
export function registerAppShell(win: Window = window): void {
  const nav = win.navigator;
  if (!("serviceWorker" in nav) || !win.isSecureContext) return;
  const go = () => { nav.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined); };
  if (win.document.readyState === "complete") go();
  else win.addEventListener("load", go, { once: true });
}
