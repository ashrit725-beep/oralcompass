# OralCompass — image generation prompt pack

Use these prompts in your image generator to paint the atlas. The app keeps every control as real HTML; the paintings are backdrops
and island plates layered inside the SVG scenes (integration steps in §5 and `/art-assets`; slot contract in
`docs/ORALCOMPASS_DESIGN_SPEC.md` §10). Nothing in a painting may contain text, numbers, logos, people's faces, patient information or
medical imagery. Generate at 2× the listed size and export PNG (transparent where noted) or WebP; keep each file under 600 KB after
compression (`squoosh`, `cwebp -q 82`). The file names below are the fixed slot names: the loader tries `<name>.webp`, then `<name>.png`,
then paints the SVG fallback. Do not add a plate that has no slot.

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

## 2. Fixed slots (these nine files are the complete set)

| File | Size · format | Role in the app | Prompt (after the preamble) |
|---|---|---|---|
| `journey-backdrop.png` | 2000×1200, opaque (≥ 16:9) | the sea and sky behind the Passage on My journey; cropped as the phone header | A tranquil coastal seascape seen from high above at dawn, calm teal water with gentle knife-stroke ripples, a pale misty horizon with faint distant headlands, soft banks of cloud drifting across the upper third, warm light pooling on the right, the lower two thirds open water with no land, space reserved for islands. |
| `island-generic.png` | 900×700, transparent | ordinary procedure islands (preventive, basic, varies) and visited islands | `single isolated island on a transparent background, no water around it, soft drop shadow only, top-down three-quarter view` A simple green island with a sandy rim, two or three green washes and a single standing stone, neutral and quiet. |
| `island-major.png` | 900×700, transparent | major-procedure islands (crowns, dentures, implants) | `single isolated island on a transparent background, no water around it, soft drop shadow only, top-down three-quarter view` A dramatic island with pale sandstone cliffs rising from a sandy rim, elevated terrain with two rounded peaks, a small stone cairn on the summit, mist at the base, strong light on the cliff faces, medically neutral. |
| `island-lighthouse.png` | 900×700, transparent | the Harbor Light, the destination at the end of the route | `single isolated island on a transparent background, no water around it, soft drop shadow only, top-down three-quarter view` A calm rocky point with a white lighthouse banded in terracotta, a small stone harbor wall and one mooring post, warm light on the tower, thin mist below, no beam painted (the beam is drawn in code). |
| `emblem.png` + `emblem.svg` | 512×512 transparent PNG and a flat vector SVG | app mark, favicon source, loading indicator, centre of the Benefits compass, map ornament | An antique brass-and-ivory compass rose painted flat as if inked on parchment, eight points, the north point slightly longer, an extremely subtle curved notch on the south point suggesting a tooth's outline without depicting a tooth, no letters, no clip-art compass. For the SVG: redraw the same rose as simple filled paths in ink and gold, two colours only. |
| `benefits-chest.png` | 600×600, transparent | the records chest at the START harbor (benefit statement, documents) | A small antique navigational case in dark wood with brass corners and a brass clasp, closed, resting on sand, painted in thick oil on a transparent background, not a pirate chest, no coins, no text. |
| `fog-layer-1.png` | 2000×667, transparent | near fog drifting over islands whose estimate is waiting for information | A long horizontal band of soft, dense, pale ivory fog with irregular thinning edges on a transparent background, thick enough to veil what lies beneath, painted in soft knife strokes, no sky, no water. |
| `fog-layer-2.png` | 2000×667, transparent | far fog and horizon mist (parallax layer behind `fog-layer-1`) | A long horizontal band of thin, translucent pale mist with wide gaps, lighter and more transparent than the near fog, soft edges, on a transparent background, no sky, no water. |
| `paper-texture.png` | 1024×1024, seamless, opaque | grain over parchment surfaces (drawer, log line, compass) at low opacity | A close-up of warm ivory handmade paper with subtle fibers, faint ochre foxing and no vignette, seamless tile, no marks, even lighting. |

## 3. Optional category plates (only these two names have slots)

| File | Size · format | Used for | Prompt (after the preamble and the isolation clause) |
|---|---|---|---|
| `island-preventive.png` | 900×700, transparent | preventive-category islands (Clearwater Shoal): exams, cleanings, x-rays, fluoride, sealants | A low, soft island of grass and dunes with shallow sandbars fanning out into pale turquoise shallows, long gentle shadows, very calm. |
| `island-reef.png` | 900×700, transparent | not-covered lines and consultation-mentioned items (Outer Reef, the closed channel) | A low dark-rock reef island barely above the water, a ring of pale sand and foam, one weathered wooden marker post without a sign, quiet and a little stern, no wreck, no danger symbols. |

When a plate is missing, the SVG scene paints the island itself (`web/src/components/atlas/Paper.tsx`); nothing waits on an asset.

## 4. Retired plates

The following names from earlier versions of this pack have no slot and are not loaded by the app: `plan-backdrop.png` (My plan keeps
its SVG coast), `intro-backdrop.png`, the per-stage islands (`island-start/before/visit/recovery/followup.png`), `island-mist.png`
(replaced by the two fog layers), the landmark plates (`landmark-*.png`), `marker-pin.png` and the small cost-trail plates (`plate-*.png`).
Delete them from `web/public/art/` if present and remove their rows from `LICENSE.md`.

## 5. Integration (what Claude Code does with the files — `/art-assets`)

1. Put files in `web/public/art/` with the names above; keep `web/public/art/LICENSE.md` stating who generated them, with which tool,
   and that they are original works for this project (no third-party IP); its table must list exactly the files present.
2. Loading: every plate goes through `components/atlas/ArtPlate.tsx`, which renders `<image href="/art/<name>.webp">`, falls back to
   `.png`, and on error renders the SVG fallback passed as `children`. Errors are swallowed; nothing is logged.
3. Backdrop: in `components/atlas/PassageMap.tsx` the backdrop `<image>` sits directly after `<AtlasDefs />` with
   `preserveAspectRatio="xMidYMid slice"`; the painted `Scenery`, `oc-water` and ripples stay behind it as the fallback.
4. Islands: `ProcedureIsland` draws the plate for its category (`lib/islands.ts`: preventive → `island-preventive` else
   `island-generic`; major and major/excluded → `island-major`; not-covered and marginal → `island-reef` else their category plate),
   sized `3r × 2.33r` and centred on `(cx, cy)`; the checkpoint arc, markers, pennants and all HTML buttons stay on top. Fog layers are
   clipped to a `1.6r × 1.1r` ellipse over unresolved islands and drift at 120 s / 160 s (off under reduced motion).
5. Harbor Light: `HarborLight` draws `island-lighthouse`; the beam is an SVG path animated in CSS only when the estimate is resolved.
6. Emblem: `emblem.svg` is inlined for the brand mark and the compass centre; `emblem.png` is the source for `icons/*` and `favicon.ico`.
7. Keep contrast: parchment cards and ink numbers sit on top; HTML text is never placed directly on a painting.
8. Run `python3 tools/screenshots.py shots/art` and compare against `shots/before`; every check must still pass and total page weight
   must stay under 3 MB.
