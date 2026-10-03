---
description: Integrate generated paintings (islands, landmarks, backdrops) from web/public/art into the atlas scenes without losing the SVG fallback or any control
---
Read `docs/ORALCOMPASS_IMAGE_PROMPTS.md` §6 first. Then:
1. List `web/public/art/*.png|webp`; for each expected file that is missing, keep the SVG painting (never block on a missing asset).
2. Backdrops: insert an `<image>` layer right after `<AtlasDefs />` in `JourneyMap.tsx` and `PlanAtlas.tsx` (`preserveAspectRatio="xMidYMid slice"`), with the
   existing SVG scenery kept behind it as fallback; hide the image on error.
3. Islands: in `JourneyMap.tsx` map stage ids → `island-<id>.png` (fallback `island-generic.png`); size by `r` (width ≈ 3r), centered on `(cx, cy)`; keep the
   checkpoint path, markers, pin and all HTML buttons on top; when every checkpoint of a stage is `awaiting_info`, overlay `island-mist.png` at 60% opacity.
4. Landmarks: replace the hand-drawn groups in `PlanAtlas.tsx` with the plates at the same anchors; the `landmark-btn` cards and the compact list stay unchanged.
5. Add `web/public/art/LICENSE.md` (generator, prompts, originality). Compress to < 600 KB per file; total page weight < 3 MB.
6. `npx tsc --noEmit && npm run build`, then `python3 tools/screenshots.py shots/art` (44/44) and look at every PNG; the numbers must remain the crispest thing on screen.
