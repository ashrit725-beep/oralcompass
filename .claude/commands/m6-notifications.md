---
description: M6 (last) — optional, informational expiration notifications with simulated scheduler
---
Build milestone M6 (spec §3.5) ONLY after M1–M5 are green and the packet is drafted. This is the first feature to cut.

1. Event types (separate toggles): benefit-year reset (from the plan's benefit-year clause); documented promotional offers (only if a stored document states one —
   none in the fixtures, so the toggle shows "none found in your documents"); coverage/eligibility changes (user-entered dates); waiting-period completion
   (enrollment date USER + waiting clause DOC); other explicit plan deadlines.
2. Settings: opt-in per event; lead time 7/30/60 days; quiet hours; one-tap disable. Lock-screen text is FIXED: "A date you chose to follow is approaching.
   Open the app for details." Detail view after sign-in: the date, the source excerpt and page, what the plan says changes, conditions.
3. Delivery: service worker + Push API (iOS/iPadOS 16.4+ Home Screen web apps); server side a `web-push` Lambda. For the demo, a "simulate date" control
   fires the local notification; production scheduling (EventBridge Scheduler) is documented in infra/, not required for the demo.
4. Copy rule: never "use", "book", "don't waste", "before it's gone"; the annual maximum is "the most the plan pays", never money the user has.
   Run `python3 tools/advice_lint.py` over every notification template and the detail copy.
Acceptance: one simulated reminder fires and opens the detail view; linter 0 violations; the About screen marks scheduling as simulated.
