---
description: Add the cinematic journey intro and the Begin → Next/Back → X review → Summary → Exit flow from the master prompt (docs/MASTER_PROMPT_UPLOADED.md §9) on top of the existing atlas
---
Keep everything that exists (map, islands, checkpoints, detail panel, cost trail, documents). Add, in `web/src`:
1. A journey state machine (`lib/journeyFlow.ts`): INTRO → MAP_READY → CHECKPOINT → MAP_REVIEW → SUMMARY → EXIT, with back/edit/retry that never loses a valid journey.
2. Intro (first open of a journey, skippable, reduced-motion alternative): the view fades to a dark charcoal wash (`intro-backdrop.png` when present, else a CSS
   gradient), the heading "Your Journey" types one letter at a time (≤ 1.2 s total), the parchment map fades in, a Begin button appears beneath the map.
   Once the question composer exists (`/assistant-grounded`) it mounts here and stays mounted through every later state.
3. Begin zooms the map toward the first island (SVG viewBox interpolation, 400–700 ms, interruptible) and shows a small original painted traveler on the island
   (no face, no brand); Next moves the traveler along the dotted route to the next island; Back returns. Navigation never records a checkpoint and never changes the estimate.
4. The end of the route is a restrained terracotta X with the sentence "The X marks the end of the modeled journey. It is not a statement about recovery or clearance."
   Arriving zooms out to the full map (MAP_REVIEW): a first tap shows an island's name; a second tap or the explicit "View details" button opens its details; the Overview list
   remains the accessible alternative.
5. Summary (End journey): totals for estimated service cost, estimated plan payment and estimated member responsibility across all lines (from `SavedEstimate`), a stage table,
   expandable billing items, the unresolved/excluded/conditional distinctions, assumed deductible and maximum balances, benefit-year allocation, "Payment timing is not included
   in this estimate" when unknown, premiums shown separately, Sources and assumptions, Back to map, Exit. No recommendations.
6. Exit clears the active journey view and returns to the start; it never pretends to close the app.
Rules: controls outside the animated layer; transitions 250–700 ms, transform/opacity only; duplicate taps during movement are ignored without disabling anything;
reduced motion skips the intro and the traveler animation but reaches every state. Update `tools/screenshots.py` with checks for Begin, Next, X, Summary and Exit, keep 44/44 + new ones.
