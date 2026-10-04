/**
 * Copy namespace: OFFLINE (the installed app without a connection: components/OnlineGate.tsx; the service worker's last-resort page in
 * public/sw.js repeats the title and body). Owner: app shell. `lib/copy.ts` re-exports this file. Every string must pass
 * `python3 tools/advice_lint.py`; no em dashes. Information only: it says what is missing, not what to do about the visitor's care.
 */
export const OFFLINE = {
  title: "You are offline.",
  body: "We need the internet to show your numbers.",
  returns: "Your numbers come back when the internet does.",
  banner: "You are offline. We need the internet to show your numbers.",
  retry: "Try again",
} as const;
