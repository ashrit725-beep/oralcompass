---
description: Run the UI verification walk (desktop + phone, reduced motion) and the build/lint checks; report failures with screenshots
---
1. Ensure the API is running on :8000 with `ORALCOMPASS_DEV_AUTH=1` and the preview on :4173 (`cd web && npm run build && npx vite preview --port 4173`).
2. `python3 tools/screenshots.py shots/verify` — expect "44/44 checks passed". For every FAIL, open the matching PNG, explain the cause, fix the source, rerun.
3. `cd web && npx tsc --noEmit && npm run build` and `python3 ../tools/advice_lint.py src/lib/copy.ts` (0 violations).
4. Keyboard pass by hand: Tab order follows the visual order; every island, checkpoint, landmark, stitch chip and clause is reachable and activates with Enter/Space;
   the bottom sheet's close button is reachable; focus is visible on the painted map.
5. Report a table: check | status | note, and attach the screenshot paths.
