# OralCompass — image generation prompt pack

Use these prompts in your image generator to paint the atlas. The app keeps every control as real HTML; the paintings are backdrops
and island/landmark plates layered inside the SVG scenes (integration steps in §6 and `/art-assets`). Nothing in a painting may contain
text, numbers, logos, people's faces, patient information or medical imagery. Generate at 2× the listed size and export PNG
(transparent where noted) or WebP; keep each file under 600 KB after compression (`squoosh`, `cwebp -q 82`).

## 1. Style preamble (prepend to every prompt)

> Impasto oil painting, thick palette-knife strokes with visible ridges and scraped texture, cinematic wide-screen composition, dramatic
> low sun from the upper right with warm ochre and gold highlights on lit edges, cool slate-teal shadows, soft rolling mist and banks of cloud,
> atmospheric perspective with pale distant silhouettes, warm ivory-and-parchment undertone showing through the paint, muted sage and forest
> greens, antique gold and terracotta accents, no text, no letters, no numbers, no logos, no watermark, no people, no animals, no symbols,
> painterly, gallery quality, 8k, matte finish.

Negative prompt (if supported): `text, letters, numbers, watermark, signature, logo, people, faces, hands, animals, cartoon, vector, flat
icon, neon, saturated blue, lens flare, photograph, 3d render, blurry, low detail, frame, border`.

Palette reference (keep every image inside it so the HTML tokens match): paper #f6f0e3 · parchment #e9dcc0 · ink #23303d · water #7fa9a6 /
#a9c7c3 · sage #9db08a · forest #5f7a52 · sand #e3cf9f · gold #c59a3c · terracotta #b86a4b · sky #e9e2cf. Think "the attached mountain
painting, but the subject is a calm coastal atlas at first light": same knife work, same mist, warmer and lighter overall.

## 2. Backdrops (opaque, 2000×1200 px, 5:3)

| File | Prompt |
|---|---|
| `journey-backdrop.png` | …preamble… A tranquil coastal seascape seen from high above at dawn, calm teal water with gentle knife-stroke ripples, a pale misty horizon with faint distant headlands, soft banks of cloud drifting across the upper third, warm light pooling on the right, the lower two thirds open water with no land, space reserved for islands. |
| `plan-backdrop.png` | …preamble… A single long coastline seen from the sea at first light: rolling sage-green hills descending to a sandy shore across the lower half, mist in the valleys, distant hills fading to pale slate, calm water in the foreground, warm light from the upper right, no buildings, no boats, no structures. |
| `intro-backdrop.png` (dark) | …preamble… Night falling over a calm sea, deep charcoal and slate sky with a last band of ochre light on the horizon, thin mist, faint moonlit ripples, very dark overall, quiet, cinematic, space for white text in the upper half (but paint no text). |
| `paper-texture.png` (tileable, 1024×1024) | …preamble… A close-up of warm ivory handmade paper with subtle fibers, faint ochre foxing and a gentle vignette, seamless tile, no marks. |

## 3. Islands (transparent PNG, 900×700 px each; one plate per stage, isolated on transparency)

Each island is painted "as a plate": a single island floating on transparent background, soft shadow allowed, shoreline sand, two or three
green washes, a hint of the stage's idea without any symbols that read as medical instructions. Add to the preamble: `single isolated island on
a transparent background, no water around it, soft drop shadow only, top-down three-quarter view`.

| File | Stage | Prompt (after preamble + isolation clause) |
|---|---|---|
| `island-start.png` | Starting point — Harbor of Beginnings | A small green island with a sheltered sandy harbor, two weathered wooden piers, a single lantern post, calm shallows, morning light. |
| `island-before.png` | Before your visit — Lantern Cove | A crescent-shaped island curving around a quiet cove, a stone lantern on the headland, pale sand, a few windswept pines, mist on the far side. |
| `island-visit.png` | Your appointment — Anchor Point | A compact rocky island with a flat landing of smooth stones, a mooring post with coiled rope, a low cairn, warm light on the rock faces. |
| `island-recovery.png` | Recovery — Quiet Shoals | A low, soft island of grass and dunes with shallow sandbars fanning out into pale turquoise shallows, long gentle shadows, very calm. |
| `island-followup.png` | Follow-up — Compass Rest | A rounded island with a small stone lookout platform on its crown, a worn footpath spiraling up, low shrubs, gold light on the summit. |
| `island-generic.png` | any extra stage | A simple green island with a sandy rim and a single standing stone, neutral and quiet. |
| `island-mist.png` | awaiting-information overlay | A soft wisp of pale mist on a transparent background, thin and irregular, to lay over an island. |

## 4. Landmarks (transparent PNG, 700×700 px each; the familiar term stays in HTML — paint only the place)

| File | Landmark | Prompt (after preamble + `isolated subject on a transparent background`) |
|---|---|---|
| `landmark-harbor.png` | Your plan — The harbor | A small stone harbor with a curved breakwater, a weathered wooden dock and one moored sailing boat with a furled ivory sail, calm water, morning light. |
| `landmark-bridge.png` | Deductible — The bridge | An arched wooden footbridge over a narrow inlet, worn planks and rope rails, mist beneath, lit from the right. |
| `landmark-cove.png` | Coverage — The cove | A sheltered turquoise cove ringed by sand and sage grass, three smooth pebbles on the shore in gold, terracotta and ivory, gentle ripples. |
| `landmark-lookout.png` | Annual maximum — The lookout | A tall wooded hill with a small timber lookout tower on top and a single gold pennant, mist at the base, strong light on the summit. |
| `landmark-lighthouse.png` | Cost breakdown — The lighthouse | A white lighthouse with terracotta bands on a rocky point, a warm beam of light sweeping to the right through thin mist, waves below. |
| `landmark-compass.png` | map ornament | An antique brass-and-ivory compass rose, slightly worn, painted flat as if inked on parchment, no letters. |
| `marker-pin.png` | "you are here" | A small terracotta and ivory map pin with a soft shadow, painted, no text. |

## 5. Small plates (transparent, 400×400 px) — optional, for the cost trail and documents

`plate-fee.png` (a folded paper receipt, blank), `plate-allowed.png` (a brass balance scale), `plate-deductible.png` (a small toll gate on the bridge),
`plate-share.png` (two overlapping gold and sage circles), `plate-maximum.png` (a stone lookout seen close), `plate-you.png` (an open ivory purse),
`plate-document.png` (a rolled parchment with a wax seal, no writing), `plate-stitch.png` (a short length of gold thread with a needle).
Prompt each as `…preamble… a single [object] painted in thick oil on a transparent background, small, simple, no text`.

## 6. Integration (what Claude Code does with the files — `/art-assets`)

1. Put files in `web/public/art/` with the names above; add `web/public/art/LICENSE.md` stating who generated them, with which tool, and that
   they are original works for this project (no third-party IP).
2. Backdrops: in `components/atlas/JourneyMap.tsx` and `PlanAtlas.tsx` insert `<image href="/art/journey-backdrop.png" width={MAP_W} height={MAP_H}
   preserveAspectRatio="xMidYMid slice" />` directly after `<AtlasDefs />` and keep the painted SVG layers as a fallback behind it (`onError` → hide the image).
3. Islands: replace the `<Island>` ellipses with `<image href="/art/island-<stage>.png">` sized to `r` (width ≈ 3r, centered on `cx, cy`), keyed by stage id
   with `island-generic.png` for unknown stages; keep the checkpoint path and markers on top; the mist overlay when all checkpoints are `awaiting_info`.
4. Landmarks: swap each hand-drawn group for the matching plate, same anchor points (`POS`), buttons unchanged.
5. Keep contrast: the parchment cards and ink numbers sit on top; never place HTML text directly on the painting.
6. Run `python3 tools/screenshots.py shots/art` and compare against `shots/before`; the 44 checks must still pass and total page weight must stay under 3 MB.
