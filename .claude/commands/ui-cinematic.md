---
description: Make the OralCompass UI beautiful, cinematic and painted — one bounded polish pass with screenshots before/after and all checks green
---
Goal: a judge opens the app on a phone and a laptop and says "that is beautiful" within ten seconds, and can say exactly where a number came from
within thirty. Read `docs/ORALCOMPASS_UI_GUIDE.md` (art direction, quality bar, headroom list) and `web/src/styles.css` (tokens) first.

Procedure (bounded: ≤ 90 minutes, then report):
1. Baseline: start the API (`cd api && ORALCOMPASS_DEV_AUTH=1 uvicorn app.main:app --port 8000`) and the preview (`cd web && npm run build && npx vite preview --port 4173`),
   run `python3 tools/screenshots.py shots/before` and LOOK at `iphone13-01-journey.png`, `iphone13-05-plan.png`, `iphone13-12-drawer.png`,
   `pixel7-01-journey.png`, `wide-01-journey.png` (mobile-only app: the desktop-*/mobile-* names are gone). Write down the three weakest things you see (composition, color, type, motion, spacing).
2. Pick items from the guide's §8 headroom list and your three findings. Work only in `web/src` (paint in `components/atlas/*`, tokens in `styles.css`,
   copy in `lib/copy.ts`). Keep the painting decorative and the controls real; keep layout derived from data (`lib/journey.ts`).
3. Painting rules: watercolor paper, soft wobble on every coastline, two to three washes per land mass, mist on the horizon, one warm light source,
   vignette; nothing saturated, nothing neon, no stock icons, no emoji in the scene. Serif headings, ink numbers, tabular numerals.
4. Motion rules: entrances ≤ 500 ms and ≤ 10 px; scenery drifts over tens of seconds; nothing loops faster than 2 s; every animation is listed in the
   `prefers-reduced-motion` block and turned off there; every end state is reachable without motion.
5. Phone: 360 px wide with no horizontal scroll; bottom sheet for details; landmarks as a list under a short painted header.
6. After each change: `npx tsc --noEmit && npm run build`, `python3 ../tools/advice_lint.py src/lib/copy.ts`, then `python3 tools/screenshots.py shots/after`
   (44/44 must pass). Compare before/after images side by side and keep only changes that are clearly better.
7. Report: what changed (file by file), the before/after screenshot pairs, the check results, and the next three headroom items. Commit with a message a judge could read.
Never: cover another island's checkpoints with a card; put patient information in a decorative label; color a total; add advice to copy.
