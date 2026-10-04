# OralCompass — Component Ecosystem Integration Plan (binding)

Status: binding for every build agent touching `web/`. Written 2026-10-03 from twelve verified scout reports (shadcn/ui, Motion, Magic UI,
Aceternity UI, Motion Primitives, React Bits, Kokonut UI, Animata, 21st.dev, Eldora UI, Hover.dev, Uiverse). Where this plan and a
component's own docs disagree, this plan wins; where this plan and `CLAUDE.md` / `docs/ORALCOMPASS_UI_GUIDE.md` disagree, those win
(information only, evidence on every number, reduced motion leaves every end state intact, 44 px targets, 360 px without horizontal scroll).

Repo facts this plan is built on (read-only check, 2026-10-03): `web/package.json` has react 18.3.1, react-dom 18.3.1, pdfjs-dist, vite 5.4.11,
typescript 5.6.3; no Tailwind, no motion, no shadcn, no `@/` alias; a single `web/tsconfig.json` (no tsconfig.app.json); `web/src/styles.css` is
the token source (`--paper --paper-deep --parchment --ink --ink-soft --muted --water --sage --forest --sand --gold --terracotta --rule --radius
--shadow --serif --sans --mono`, `color-scheme: light`) and already has a `prefers-reduced-motion` block and a `.spinner` that must go;
`web/src/App.tsx` switches four tabs (`journey | plan | compare | documents`); `web/public/art/LICENSE.md` is the provenance file for art.

---

## 0. Decisions in one screen

| Decision | Choice | Why (short) |
|---|---|---|
| Styling | Tailwind CSS v4 via `@tailwindcss/vite`; `web/src/styles.css` stays the single CSS entry and the token source; `@theme inline` bridges tokens into utilities | Every registry component is written against Tailwind v4 utilities; `@theme inline` compiles `bg-background` to `var(--background)` so repointing `:root` recolours everything |
| Primitives | shadcn/ui, **Radix base** (`--base radix`, style `radix-nova`, unified `radix-ui` package) | Third-party registries (Magic UI, Kokonut, Aceternity, prompt-kit) pull `@radix-ui/*`; one primitive family = one portal/focus-trap implementation |
| `cn()` | `clsx` + `tailwind-merge` in `src/lib/utils.ts` (replace the `cn` package shadcn init writes) | Owner's stack; every registry imports `@/lib/utils`, so the swap is invisible |
| Animation engine | **`motion@^12.23.12`**, imported only as `motion/react` (and `motion` for `spring()`) | Every scouted registry imports `motion/react`; React Bits/Magic UI pin `^12.23`; no second engine (no GSAP, no react-spring, no framer-motion declared) |
| Reduced motion | `<MotionConfig reducedMotion="user">` at the root **plus** per-component `useReducedMotion()` guards for motion values, SVG attributes, CSS keyframes | MotionConfig only covers transform/layout; number springs, `pathLength`, shimmer loops and CSS transitions need explicit guards |
| Icons | `lucide-react` (installed by shadcn init). Allowed: `X, Check, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, Paperclip, Compass, Anchor, FileText, Upload, Search, Info, AlertTriangle, ExternalLink, Minus, Plus, Loader2 (only inside StatusMark-style determinate contexts)`. **Forbidden:** `Sparkles, Sparkle, WandSparkles, Wand2, Stars, Bot, Brain, Zap, Rocket, Flame, Lightbulb, MessageCircle` (chatbot/AI iconography) | N8 must not look like a chatbot; AVOID list bans "AI sparkle" iconography |
| Vendored code | Registry items are **owned source** after install (patched, recoloured, committed); product code imports only domain wrappers in `src/components/*.tsx` or shadcn primitives in `src/components/ui/*` | Keeps palette/a11y patches in one place and makes "two animation libraries" impossible to reintroduce silently |

---

## 1. Stack decision — exact steps and commands

Run everything from `/Users/ashrittalluri/Downloads/OralCompass-codeLinc11/web`. Commit after step 1.9 (infrastructure) before installing any component.

### 1.1 Tailwind v4 + path alias

```bash
cd /Users/ashrittalluri/Downloads/OralCompass-codeLinc11/web
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node
```

`web/tsconfig.json` → add to `compilerOptions`:

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

`web/vite.config.ts` (keep the existing `/api` proxy blocks exactly as they are):

```ts
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Registry files carry "use client"; harmless in Vite, noisy in the build log.
        if (warning.code === "MODULE_LEVEL_DIRECTIVE" && /use client/.test(warning.message)) return;
        warn(warning);
      },
    },
  },
  server:  { port: 5173, proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } } },
  preview: { port: 4173, proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } } },
});
```

### 1.2 CSS entry: `web/src/styles.css` stays the source of truth

Make `@import "tailwindcss";` the **first line** of `web/src/styles.css` (the shadcn CLI finds the Tailwind file by this import). Keep the existing
`:root { … }` token block **unchanged** — those variables are the product palette and nothing else may define colours.

Cascade rule you must know: Tailwind v4 puts preflight in `@layer base` and utilities in `@layer utilities`; **unlayered CSS beats both**. The existing
hand-written component CSS (everything after the `:root` block) must therefore be wrapped so utilities can still win on elements that carry both:

```css
@import "tailwindcss";
/* (shadcn init will insert its imports/@theme/:root here — see 1.4) */

:root { /* existing OralCompass tokens — DO NOT MOVE OR RENAME */ }

@layer components {
  /* everything that used to follow :root in styles.css: body, h1–h4, .num, .badge, .island-btn, .detail, keyframes, the
     prefers-reduced-motion block, print rules … unchanged content, now layered so Tailwind utilities on the same element win. */
}
```

Delete `.spinner` and `@keyframes spin` while you are in there (N7 forbids meaningless spinners; the compass loader replaces it). Keep
`.route` (18 s march), `.ripples` (40 s), `.clouds` (90 s), `.beam` (7 s), `.you-are-here` (2.4 s): they are scenery drifts and already loop ≥ 2 s.

### 1.3 shadcn init (Radix base)

```bash
npx shadcn@latest init --base radix --preset nova --yes --css-variables --pointer
```

Expected output: `components.json` with `"style": "radix-nova"`, `"tailwind": { "css": "src/styles.css", "baseColor": "neutral", "cssVariables": true }`,
`"iconLibrary": "lucide"`, aliases `@/components`, `@/components/ui`, `@/lib/utils`, `@/lib`, `@/hooks`; `src/lib/utils.ts`; deps `radix-ui`, `cn`,
`class-variance-authority`, `lucide-react`, `shadcn` (runtime: provides `shadcn/tailwind.css` with the `shimmer-*`, `scroll-fade-*`, `data-open/closed`
variants), `tw-animate-css`, `@fontsource-variable/geist`. (`--preset` takes bare names: `nova`, not `radix-nova`.)

### 1.4 Palette bridge — edit what init wrote (no Geist, no gray, no dark)

In `web/src/styles.css`, directly under `@import "tailwindcss";` the CLI will have written imports and an `@theme inline` block. Apply all of these edits:

1. Delete `@import "@fontsource-variable/geist";` and run `npm rm @fontsource-variable/geist`.
2. Delete `@custom-variant dark (&:is(.dark *));` and the whole `.dark { … }` block (the app declares `color-scheme: light`).
3. In `@theme inline` set fonts and add palette utilities:

```css
@theme inline {
  --font-sans: var(--sans);
  --font-heading: var(--serif);
  --font-mono: var(--mono);

  /* shadcn semantic colours → OralCompass tokens */
  --color-background: var(--background);  --color-foreground: var(--foreground);
  --color-card: var(--card);              --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);        --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);        --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);    --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted-bg);         --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);          --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);          --color-input: var(--input);  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1); --color-chart-2: var(--chart-2); --color-chart-3: var(--chart-3); --color-chart-4: var(--chart-4); --color-chart-5: var(--chart-5);

  /* palette utilities: bg-paper, text-ink, stroke-sea, border-gold … */
  --color-paper: var(--paper);            --color-paper-deep: var(--paper-deep);  --color-parchment: var(--parchment);
  --color-ink: var(--ink);                --color-ink-soft: var(--ink-soft);
  --color-sea: var(--water);              --color-sea-light: var(--water-light);  --color-sea-ink: var(--water-ink);
  --color-sage: var(--sage);              --color-forest: var(--forest);          --color-sand: var(--sand);
  --color-gold: var(--gold);              --color-gold-soft: var(--gold-soft);    --color-terracotta: var(--terracotta);
  --color-rule: var(--rule);              --color-ok: var(--ok); --color-warn: var(--warn); --color-danger: var(--danger);

  /* radius / shadow / motion tokens */
  --radius-sm: calc(var(--radius) * 0.5);  --radius-md: calc(var(--radius) * 0.75); --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);  --radius-2xl: calc(var(--radius) * 1.8); --radius-4xl: 999px;
  --shadow-paper: var(--shadow);
  --ease-ink: cubic-bezier(.2, .7, .2, 1);            /* existing "rise" easing */
  --ease-settle: linear(0, 0.26 10%, 0.57 20%, 0.8 30%, 0.93 41%, 0.99 53%, 1);  /* spring(0.5) no-bounce, generated with `spring()` from "motion" */
  --duration-micro: 150ms; --duration-ui: 300ms; --duration-journey: 500ms; --duration-drift: 24s;
}
```

   Note the existing token `--muted` is a **text colour** (#7a8390). Do not point `--color-muted` at it; use `--muted-bg` below.

4. Replace the neutral oklch values in the generated `:root` with token pointers (keep this block **above** the OralCompass `:root`, or merge them —
   both are fine, order inside `:root` does not matter):

```css
:root {
  --background: var(--paper);          --foreground: var(--ink);
  --card: var(--paper-deep);           --card-foreground: var(--ink);
  --popover: var(--paper-deep);        --popover-foreground: var(--ink);
  --primary: var(--ink);               --primary-foreground: var(--paper);
  --secondary: var(--parchment);       --secondary-foreground: var(--ink);
  --muted-bg: var(--parchment);        --muted-foreground: var(--ink-soft);
  --accent: var(--sand);               --accent-foreground: var(--ink);
  --destructive: var(--danger);
  --border: var(--rule);               --input: var(--rule);             --ring: var(--terracotta);
  --chart-1: var(--water); --chart-2: var(--sage); --chart-3: var(--gold); --chart-4: var(--forest); --chart-5: var(--terracotta);
  /* --radius already exists (14px) in the OralCompass block */
}
```

5. Fix the `@layer base` block init wrote so it does not fight the hand-written body/heading rules:

```css
@layer base {
  * { @apply border-border outline-ring/50; }
  html { @apply font-sans; scrollbar-gutter: stable; }   /* stable gutter: a scrollbar appearing must not trigger a layout animation */
  body { @apply bg-background text-foreground; }
}
```

6. Add the CSS side of the reduced-motion contract (end states are intact because these utilities only animate enter/exit):

```css
@media (prefers-reduced-motion: reduce) {
  .animate-in, .animate-out { animation: none !important; }
  [data-vaul-drawer], [data-vaul-overlay] { transition-duration: 0s !important; }
  .motion-drift { animation: none !important; }          /* class we put on every scenery loop */
}
```

7. Verify: `grep -n "oklch\|neutral\|zinc\|slate\|gray-" src/styles.css` must return **nothing** after this step.

### 1.5 `cn()` with clsx + tailwind-merge

```bash
npm install clsx tailwind-merge
npm rm cn
```

`web/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

### 1.6 Motion — the one animation engine

```bash
npm install motion@^12.23.12
```

Do this **before** any third-party registry add so the CLI sees `motion` present and does not install another major.

Rules:
- Import only from `"motion/react"` (components, hooks) and `"motion"` (`spring()`, `stagger()`). Never import `"framer-motion"`.
- Never declare `framer-motion` in `package.json`. It appears in `npm ls` **only** as a transitive dependency of `motion` — that is expected.
- Never add a Vite `resolve.alias` from `framer-motion` to `motion/react` (`motion/react` re-exports framer-motion; the alias would cycle).
- A registry file that arrives with `from "framer-motion"` (21st.dev mirrors, older snippets) is fixed at install time:
  `sed -i '' "s#from ['\"]framer-motion['\"]#from \"motion/react\"#g" <file>` and `npm rm framer-motion` if the CLI added it.
- Root policy in `web/src/main.tsx`:

```tsx
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
<MotionConfig reducedMotion="user" transition={{ type: "spring", visualDuration: 0.35, bounce: 0 }}>
  <TooltipProvider delayDuration={300}>
    <App />
  </TooltipProvider>
</MotionConfig>
```

- What MotionConfig does **not** cover, and what every component must do instead (`const reduce = useReducedMotion()`):
  - MotionValue springs (money): `reduce ? mv.jump(v) : mv.set(v)`.
  - SVG attributes (`pathLength`, `strokeDashoffset`, gradient `x1/x2/y1/y2`): `initial={false}` / render final attribute.
  - CSS keyframe loops (shimmer, drift): class `motion-safe:animate-…` or the `.motion-drift` override above.
  - CSS transitions (gauges): `motion-reduce:transition-none`, set the final value synchronously.
  - `height: auto` / `backgroundPosition` / `filter` animations: `transition={{ duration: reduce ? 0 : 0.2 }}` or render static.

### 1.7 shadcn primitives (first-party registry)

```bash
npx shadcn@latest add dialog drawer sheet tabs toggle-group tooltip popover table progress badge button skeleton field textarea checkbox switch hover-card use-mobile --yes
```

(`drawer` brings `vaul ^1.1.2`; `toggle-group` brings `toggle`; `field` brings `label` + `separator`; `hover-card` is only for prompt-kit `Source`.)
Then apply the restyle rules in §2 (Button `size="touch"`, Badge evidence variants, Drawer overlay without backdrop blur, Tabs list `h-11`, etc.).

### 1.8 Third-party registries in `components.json`

```json
"registries": {
  "@aceternity": "https://ui.aceternity.com/registry/{name}.json",
  "@kokonutui":  "https://kokonutui.com/r/{name}.json",
  "@eldoraui":   "https://eldoraui.site/r/{name}.json"
}
```

`@magicui` and `@react-bits` are in shadcn's built-in directory (no entry needed). Motion Primitives (`https://motion-primitives.com/c/<name>.json`),
Animata (`https://animata.design/r/<category>/<slug>.json`) and prompt-kit (`https://prompt-kit.com/c/<name>.json`) install by URL.
**21st.dev** is a discovery surface only: its `/r/` endpoint requires an API key and its mirror metadata still says `framer-motion`; always install
the upstream item it points to. **Hover.dev** and **Uiverse** have no registry: copy-paste into `src/components/vendor/hoverdev/` and
`src/components/vendor/uiverse/` with the source URL and licence in a header comment.

### 1.9 Where files land (fixed)

| Source | Lands in | Imported by product code? |
|---|---|---|
| shadcn/ui | `src/components/ui/<kebab>.tsx` | yes (primitives) |
| Motion Primitives, Aceternity, prompt-kit | `src/components/ui/<kebab>.tsx`, hooks in `src/hooks/` | no — only through a domain wrapper |
| Magic UI | `src/components/magicui/<kebab>.tsx` | no |
| Kokonut UI | `src/components/kokonutui/<kebab>.tsx`, `src/hooks/use-auto-resize-textarea.ts` | no |
| Animata | `src/components/animata/<category>/<slug>.tsx` | no |
| React Bits | `src/components/ui/<PascalCase>.tsx` (registry type `registry:ui`; PascalCase marks the origin) | no |
| Eldora UI | `src/components/eldoraui/<kebab>.tsx` | no |
| Hover.dev / Uiverse (copy-paste) | `src/components/vendor/hoverdev/*.tsx`, `src/components/vendor/uiverse/*.{tsx,css}` | no |
| Domain wrappers (the only public API) | `src/components/*.tsx` — `Money.tsx`, `CostPipeline.tsx`, `ProcedureDrawer.tsx`, `ViewSwitch.tsx`, `CareTimeline.tsx`, `UploadWizard.tsx`, `StageLoader.tsx`, `AskAboutStep.tsx`, `IslandHeading.tsx`, `BenefitsCompass.tsx`, `ComparisonGrid.tsx` (existing), `OceanLayers.tsx`, `DepthDial.tsx`, `EvidenceBadge` (in `Primitives.tsx`) | yes |

Strip the `"use client"` line from every installed file (or rely on the `onwarn` filter). Replace `clsx(...)` imports inside Eldora/Animata files with `cn`.

---

## 2. Need → component mapping (N1–N14)

Format per need: **Primary** (install, file, restyle, reduced motion, a11y, fallback) · **Alternate** · **Not used here**.
"Restyle" always includes: palette tokens only (`text-ink`, `bg-paper-deep`, `stroke-sea`, `border-rule`, `ring-terracotta` …), radius from
`--radius-*`, no gradients unless they are a painted wash (flat sea/parchment tints), no `dark:` classes (delete them), no `drop-shadow`/glow.

### N1 — Animated dollar figures ($1,234.56, tabular ink numerals, evidence badge beside)

**Primary: NumberFlow** (`@number-flow/react`, discovered through 21st.dev `barvian/number-flow`).
- Install: `npm install @number-flow/react`. Wrapper: `src/components/Money.tsx`.
- API: `<Money cents={64000} evidence={ev} />` → `<span className="amt font-sans tabular-nums text-ink"><NumberFlow value={cents/100} locales="en-US" format={{ style: "currency", currency: "USD", minimumFractionDigits: 2 }} /></span><EvidenceBadge status={ev.status} … />`. `evidence` is a **required** prop in TypeScript — a Money without a badge does not compile.
- Restyle: inherits font/colour; set `--number-flow-mask-height: 0.15em` so the digit mask does not read as a gradient on parchment. Never animate colour on change; if a delta needs emphasis, fade a 1 px terracotta underline in (opacity only).
- Reduced motion: built in (`respectMotionPreference` default true) — value snaps, end state exact.
- A11y: NumberFlow exposes the formatted value as text/aria; badge stays a sibling, never inside the animated node.
- Fallback if install fails: **Motion Primitives AnimatedNumber** (`npx shadcn@latest add "https://motion-primitives.com/c/animated-number.json"`) with the formatter replaced by `Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2})`, spring `{stiffness:170,damping:26,mass:0.6}`, and `reduce ? spring.jump(v) : spring.set(v)`.

**Alternate:** Magic UI `number-ticker` (needs currency patch + `jump` guard). **Not used:** React Bits `Counter`/`CountUp`, Animata `Ticker`, Motion Primitives `SlidingNumber`, Hover.dev "Live Users Now" — odometer/slot-machine digits read as gaming on an insurance figure; Animata `Counter` only because NumberFlow already covers currency and reduced motion without patches.

### N2 — Causal flow between pipeline nodes and islands

**Primary A (pipeline nodes): Magic UI AnimatedBeam.**
- Install: `npx shadcn@latest add @magicui/animated-beam` → `src/components/magicui/animated-beam.tsx`; wrapper `src/components/CostPipeline.tsx` (wraps existing `CostTrail.tsx`).
- Restyle (all defaults are neon): `pathColor="var(--ink)" pathOpacity={0.18} pathWidth={1.5} gradientStartColor="var(--water)" gradientStopColor="var(--gold)"`. `repeat={1}` (never `Infinity`); `key` the beam on the recompute id so the pulse fires **once, source → target, in pipeline order** (`delay = i * 0.12`). Container is `relative`.
- Reduced motion: not built in → when `useReducedMotion()` render only the static stroked path at full opacity (the connection is the end state).
- A11y: beams are `aria-hidden`; the order of nodes in the DOM is the causal order.

**Primary B (island routes, timeline spine): Motion `pathLength` drawing** (free, `motion/react`), technique as in Hover.dev "Draw Circle Text".
- In `src/components/atlas/JourneyMap.tsx`: `<motion.path d={route} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: i * 0.12, type: "spring", duration: 0.9, bounce: 0 }} stroke="var(--water)" strokeLinecap="round" vectorEffect="non-scaling-stroke" />`; hand-drawn wobble is baked into `d`, never animated.
- Reduced motion: `initial={false}` → route fully drawn.

**Alternate:** Aceternity **Tracing Beam** (`npx shadcn@latest add @aceternity/tracing-beam`) for the 360 px vertical ledger in `CostPipeline` — restyle stops `#18CCFC/#6344F5/#AE48FF` → sea/forest/gold, base stroke ink 0.16, dot forest/sage, move `-left-4 md:-left-20` to `left-2` inside a 32 px gutter, fix the `border-netural-200` typo; under reduced motion set `y1=0, y2=svgHeight`. **Not used:** Aceternity Background Beams (50 perpetual gradients), Magic UI BorderBeam (loop; only acceptable while a stage is truly running — see N7 alternate), Animata `background/animated-beam` (it is a falling-streak background, not a connector).

### N3 — Island → procedure drawer morph; view transitions

**Primary A (≥ 768 px): Motion Primitives MorphingDialog.**
- Install: `npx shadcn@latest add "https://motion-primitives.com/c/morphing-dialog.json"` → `src/components/ui/morphing-dialog.tsx` + `src/hooks/useClickOutside.tsx`. Wrapper: `src/components/ProcedureDrawer.tsx` (desktop branch; mobile branch is the N4 Drawer, chosen with `useIsMobile()`).
- Island button = `MorphingDialogTrigger` (a real `<button>`); `MorphingDialogTitle` shares the layoutId so the island name travels; `MorphingDialogContent` hosts `DetailPanel`/`LandmarkContent` + clause cards.
- Restyle: content `bg-paper text-ink border border-sand rounded-xl shadow-paper`, container backdrop `bg-ink/40` (no backdrop blur); close hit area 44×44 (`lucide X`); `transition={{ type: "spring", bounce: 0, visualDuration: 0.35 }}`; `style={{ borderRadius: 14 }}` on the morphing surface (Motion scale-corrects radius set via `style`); no CSS `border` on the morphing element (borders stretch — use padding + inner element).
- Reduced motion: MotionConfig disables the layout morph; dialog still opens/closes by opacity; focus/aria unchanged.
- A11y (verified in source): `role=dialog`, `aria-modal`, labelledby/describedby, trigger `aria-expanded`/`aria-haspopup`, Esc, Tab loop, focus return. Keep the trigger's `focus-visible:ring-2 ring-terracotta ring-offset-2`.
- Fallback: shadcn `Dialog` with hoisted `open`, `DialogPrimitive.Content forceMount asChild` inside `AnimatePresence`, `layoutId={"island-"+id}` on island card and panel (Motion ⟷ Radix pattern, https://motion.dev/docs/radix).

**Primary B (view switch My journey / My plan / Compare / Documents; wizard panes): Motion Primitives TransitionPanel.**
- Install: `npx shadcn@latest add "https://motion-primitives.com/c/transition-panel.json"`. Wrapper: `src/components/ViewSwitch.tsx` used by `App.tsx` (replaces the `.view > * { animation: rise }` CSS, which is the banned "everything fades up").
- Variants: `enter {opacity:0, y:8}`, `center {opacity:1, y:0}`, `exit {opacity:0, y:-8}`, `transition {duration:0.2, ease:"easeOut"}`; wizard passes `custom={direction}` with `x: ±12`. One wrapper per view, never per heading or card. Give the container `min-h` so the map does not collapse mid-transition (`popLayout`).
- Reduced motion: transforms dropped, opacity crossfade remains, active panel renders in full.
- Fallback: hand-written `AnimatePresence mode="wait"` with the same variants (49 lines).

**Alternate:** Aceternity `expandable-card-demo-standard` as a **pattern source only** (layoutId scheme + Esc/overflow logic) rendered inside shadcn Dialog; Magic UI `blur-fade` for the drawer body entering (`duration 0.25, offset 4, blur "0px"`). **Not used:** Motion `AnimateView` (needs React ≥ 19.3), Aceternity Animated Modal / Layout Grid (no focus trap, bouncing entrance).

### N4 — Mobile bottom sheet + accessible dialogs (44 px, 360 px)

**Primary: shadcn Drawer (vaul) + Dialog + Sheet + `useIsMobile`.**
- Installed in 1.7. Wrappers: `ProcedureDrawer.tsx` (mobile branch), `ClauseCard.tsx` (evidence sheet), `UploadWizard.tsx` (publish confirmation Dialog), tablet `Sheet side="right"` for the 420 px detail column when the journey grid collapses.
- Drawer restyle: `DrawerContent` `bg-paper-deep rounded-t-xl max-h-[85dvh]`; remove `supports-backdrop-filter:backdrop-blur-xs` from the overlay → `bg-ink/40`; grab handle `bg-sand` inside a 44 px-tall touch area with `aria-label="Close"`; `direction="bottom" snapPoints={[0.45, 1]}` for peek-then-full; `DrawerTitle` is already `font-heading` → serif.
- Reveal order inside the sheet uses the **Kokonut `smooth-drawer` stagger variants** (harvest ~40 lines: `staggerChildren 0.07, delayChildren 0.2`, children `y 8→0` + opacity) so title → cost pipeline → clause evidence appear in causal order. Drop `rotateX` (3D tilt), the gradient CTA, the infinite Fingerprint loop, `next/image`, `next/link`.
- Dialog restyle: replace `zoom-in-95/zoom-out-95` with `fade-in-0 slide-in-from-bottom-2`; overlay `bg-ink/40`; `showCloseButton` with 44 px target.
- Reduced motion: the CSS overrides in 1.4(6); vaul's transform transition is zeroed; open/closed states intact.
- A11y: Radix focus trap, Esc, `aria-modal`, scroll lock; every button `min-h-11`; at 360 px content scrolls inside the sheet, page never scrolls horizontally.
- Fallback: **Motion Primitives Dialog** (`https://motion-primitives.com/c/dialog.json`, native `<dialog>.showModal()`, intercepts `cancel` for the exit animation) styled as a sheet (`fixed inset-x-0 bottom-0 rounded-t-[28px] bg-paper`).

**Alternate:** Credenza (21st `redpangilinan/credenza`, upstream `https://credenza.rdev.pro/r/credenza.json`) — the same Dialog⇄Drawer swap as a single API. **Not used:** Hover.dev Drag Close Drawer (gesture only, no dialog semantics; vaul already drags), Aceternity Animated Modal, Kokonut `smooth-drawer` as a whole (demo content, Next imports).

### N5 — Care-stage timeline and procedure timeline (dated entries + attribution)

**Primary: Aceternity Timeline.**
- Install: `npx shadcn@latest add @aceternity/timeline` → `src/components/ui/timeline.tsx`. Wrapper: `src/components/CareTimeline.tsx` used by the mobile vertical coast in `JourneyMap.tsx` (care stages) and by `DetailPanel.tsx` (procedure history). `data: { title, content }[]` — title = date in serif `text-lg tabular-nums`, content = entry card with the dental team's words, the source label/page, and the `EvidenceBadge`.
- Restyle: delete the hard-coded "Changelog from my journey" heading/intro inside the component; wrapper `bg-white dark:bg-neutral-950 font-sans md:px-10` → `bg-transparent font-serif px-0`; fill `from-purple-500 via-blue-500` → `from-forest via-sea to-transparent` (a painted wash, allowed); track `via-neutral-200` → `bg-ink/15`; dot outer `bg-paper`, inner `bg-sand border-ink/40` (checkpoint marker, reuses the island focus ring); titles `text-xl md:text-5xl font-bold text-neutral-500` → `text-lg text-ink`; `pt-10 md:pt-40` → `pt-6 md:pt-10`. Wrap entries in `<ol>/<li>`, `aria-current="step"` on the current stage.
- Reduced motion: the fill height/opacity are `useTransform` motion values (MotionConfig does nothing) → `if (reduce) style={{ height: "100%", opacity: 1 }}`; entries are static DOM, so every end state holds. Add `scroll-fade-y` (ships in `shadcn/tailwind.css`) on the scroll container.
- Fallback: **Animata AnimatedTimeline** (`npx shadcn@latest add https://animata.design/r/progress/animatedtimeline.json`, pure CSS, takes hex via `timelineStyles`: line `#e3cf9f`, active line `#7fa9a6`, dot `#f6f0e3`, active dot `#c59a3c`, title `#23303d`); add a controlled `activeIndex` prop and `<ol>/<li>` semantics; `transitionDuration: 0` under reduced motion.

**Alternate:** Motion Primitives `InView` (opacity-only, `once`) to reveal entries as they scroll in — timeline and compass only. **Not used:** Eldora `logo-timeline` (a marquee), Aceternity Sticky Scroll Reveal (scroll-jacking), 21st `preetsuthar17/timeline` (licence unknown).

### N6 — Upload wizard: upload → redaction preview → extraction (real stages) → review table → publish

**Primary (shell): React Bits Stepper.**
- Install: `npx shadcn@latest add @react-bits/Stepper-TS-TW` → `src/components/ui/Stepper.tsx`. Wrapper: `src/components/UploadWizard.tsx` (replaces the upload part of `DocumentsView.tsx`).
- Patches (mandatory): add a controlled `step` prop so the real API stage from `src/lib/api.ts` gates `Continue` (disabled until the stage resolves); `renderStepIndicator` returns a real `<button aria-current="step" className="min-h-11 min-w-11">`; remove the demo `sm:aspect-[4/3] md:aspect-[2/1]` wrapper; indicators sand (inactive) / gold (active) / forest (complete), connector fills gold; `#5227FF`, `#222`, `#a3a3a3`, `#120F17`, `bg-green-500`, `rounded-4xl shadow-xl` all go; slide distance `x ±100%` → `±24px`, duration 0.3; panes transition through the N3 `TransitionPanel` (`custom={direction}`).
- Reduced motion: MotionConfig drops the x slide and height spring; final layout identical.

**Pieces inside the wizard:**
- Drop zone: **Kokonut `file-upload`** (`npx shadcn@latest add @kokonutui/file-upload` → `src/components/kokonutui/file-upload.tsx`). Replace `simulateUpload` with real XHR progress + the redaction-preview hand-off; delete the 14-ring rainbow `UploadingAnimation` and `UploadIllustration` blue strokes (use a single sea arc on a sand track); `role="complementary"` → `<section aria-labelledby>`; `acceptedFileTypes={["application/pdf"]}`; error message persistent (no 3 s auto-dismiss); drag ring `border-sage border-dashed`.
- Stage rows (extraction step): **React Bits `StatusMark`** (`npx shadcn@latest add @react-bits/StatusMark-TS-TW`), one row per real stage ("Redacting page 3 of 12", "Extracting clauses", "Confidence pass") with determinate `progress`; `doneColor` forest, `errorColor` terracotta, `strike={false}`. Handles reduced motion internally (jumps to final arc).
- Linear progress: shadcn `Progress` (`h-2`, track `bg-sand`, indicator `bg-sea` → `bg-forest` at 100 %, `getValueLabel={(v) => \`Stage ${i} of ${n} — ${name}\`}`).
- Review table: shadcn `Table` (sticky header, `data-confidence="high|medium|low"` row styling: sage/sand/terracotta left rule) + `Badge` confidence variants + `Field`/`Checkbox` for approve/skip; placeholders are shadcn `Skeleton` (`bg-parchment motion-reduce:animate-none`) shaped like the final rows.
- Publish: **React Bits `HoldButton`** (`npx shadcn@latest add @react-bits/HoldButton-TS-TW`): `backgroundColor` sand, `fillColor` forest, `textColor` ink, `fillTextColor` paper, `size="lg"`, `wave={false} glow={false}`, `holdTime 900`, `onTap` shows "Hold to publish"; keyboard hold supported; verify a visible `focus-visible` ring after restyle. Publish confirmation = shadcn `Dialog`.
- Fallback (shell): build the stepper from shadcn `Tabs` (`activationMode="manual"`, triggers disabled until reachable) + `Progress` + `Field` — the Questionnaire block is React 19-only and off the table.

**Alternate:** Origin UI Stepper via 21st.dev (`originui/stepper`, needs an API key; confirm `aria-current` after install); Animata AnimatedTimeline as a vertical stage rail at 360 px; Kokonut `hold-button` (needs keyboard + completion-callback patches). **Not used:** Aceternity Multi Step Loader (timer-driven fake progress, full-screen backdrop-blur), Aceternity File Upload (hidden input, 451-div GridPattern, no `accept`), Eldora `terminal` (timer-driven), Animata SplitReveal (full-screen preloader; see N7 alternate).

### N7 — Loading tied to real stages (shimmer stage line, progress, compass-rose loader)

**Primary A (compass-rose loader): Uiverse `Nawsome/ancient-yak-42`.**
- Source: https://uiverse.io/Nawsome/ancient-yak-42 (archive `loaders/Nawsome_ancient-yak-42.html`). Copy into `src/components/vendor/uiverse/CompassLoader.tsx` + `compass-loader.css` with the `/* From Uiverse.io by Nawsome — MIT */` header. Wrapper: `src/components/StageLoader.tsx` = compass + stage label + shadcn `Progress`; **never rendered without a real stage label**.
- Restyle: SVG attributes → CSS vars: ring `var(--water)` over `var(--sand)` track, ticks `var(--ink)`, north needle `var(--terracotta)`, south `var(--paper)`; size 3–4 em; prefix the internal `grad`/`mask1`/`mask2` ids with `useId()` so two instances do not collide; `role="img" aria-label={stageText}`.
- Make it determinate where the stage is measurable: drive the needle `rotate` with a `useSpring` from `stageIndex / stages * 360` (Motion), so the compass turns **once per stage** instead of spinning; keep the Uiverse 2 s ring sweep only for the brief indeterminate "uploading…" phase.
- Reduced motion: `@media (prefers-reduced-motion: reduce) { .pl__arrows, .pl__ring-rotate, .pl__ring-stroke, .pl__tick { animation: none } }` → static compass pointing north, ring fully drawn; the label carries the meaning.

**Primary B (stage line shimmer): shadcn `shimmer` utility** (ships with `shadcn/tailwind.css`).
- One line at a time: `<p className="shimmer shimmer-color-gold/60 shimmer-duration-1800 text-ink-soft">Redacting personal details…</p>`; `shimmer-once` on "Extraction complete". Never on headings, numbers or body copy. Built-in reduced-motion handling (animation none, `-webkit-text-fill-color: currentColor`).
- Fallback: **Kokonut `ai-text-loading`** (`npx shadcn@latest add @kokonutui/ai-text-loading`) with the `setInterval` driver replaced by a controlled `index` prop bound to the real stage, gradient ink → sand → ink, `motion-safe:` gate; or **Motion Primitives TextShimmer** with `[--base-color:var(--ink)] [--base-gradient-color:var(--gold)]`.

**Primary C:** shadcn `Progress` + `Skeleton` as in N6. Delete `.spinner` from `styles.css`; `grep -rn "spinner" src` must be empty.

**Alternate:** **Animata SplitReveal** (`npx shadcn@latest add https://animata.design/r/preloader/split-reveal.json`, 18 files, zero npm deps, real `Task`/`progress` model, built-in reduced motion) for the single "first open of an uploaded plan" moment: two parchment halves part ("unrolling the chart") while parse/redact/extract tasks report `loaded/total`; `backgroundColor '#f6f0e3' foregroundColor '#23303d' revealDuration ≤ 600`; change `use(Context)` → `useContext` (React 18). Magic UI `BorderBeam` (gold → sea, 4 s) **only** as an "in progress" ring on the wizard card while a stage runs, removed on completion, static 1.5 px gold ring under reduced motion. React Bits `LatticeLoader` for a labelled stage row with stopwatch. **Not used:** shadcn Spinner, Kokonut `loader`/`ai-loading`, Animata `progress/spinner`, Magic UI Ripple/OrbitingCircles, Hover.dev Bar Loader, Uiverse rainbow loaders — indeterminate decoration.

### N8 — "Ask about this step" composer + answer with clause citations (not a chatbot sidebar)

**Primary (composer scaffold): Kokonut `ai-prompt`.**
- Install: `npx shadcn@latest add @kokonutui/ai-prompt` → `src/components/kokonutui/ai-prompt.tsx` + `src/hooks/use-auto-resize-textarea.ts` (+ `icons/anthropic*.tsx`, delete these). Wrapper: `src/components/AskAboutStep.tsx`, rendered **inline at the foot of the step** inside `ProcedureDrawer`/`DetailPanel`; anchored in a shadcn `Popover` to the checkpoint on desktop, inside the N4 `Drawer` on mobile. Never a right-hand column.
- Patches: delete the promo header row and all vendor logo SVGs (brand marks = "AI sparkle"); repurpose the `DropdownMenu` as a **scope selector** ("This step" / "This island" / "Whole plan"); surfaces `bg-black/5` → `bg-paper-deep`, ring `ring-rule`, focus `ring-sea`, `text-blue-500` → `text-forest`; remove fixed `w-4/6` and the hard-coded `id="ai-input-15"` (use `useId`); flat `DropdownMenuContent` on `bg-paper-deep`; all icon buttons `min-h-11 min-w-11`; placeholder "Ask about this step…" in serif; send button `aria-label="Ask"` with lucide `Compass` (never `Sparkles`); Enter submits, Shift+Enter newline (kept).
- Answer rendering (no bubbles): a parchment note card on `bg-paper-deep` with a serif heading, the answer text, and a footer of `EvidenceBadge`s; each citation is a **prompt-kit `Source`** (`npx shadcn@latest add https://prompt-kit.com/c/source.json`, discovered via 21st.dev, builds on shadcn `hover-card`) whose trigger is the badge and whose content is the clause quote + document label + page. The quoted fragment inside the answer gets one **Magic UI `Highlighter`** mark (`npx shadcn@latest add @magicui/highlighter`, rough-notation `underline`, color `var(--terracotta)`, `strokeWidth 1.2`, `iterations 1`, wrapper patched from `inline-block` to `inline`; `animate: !reduce`) — one annotation per answer, evidential not decorative. Lazy-load `Highlighter` (rough-notation) with `React.lazy`.
- While retrieving: **React Bits `ThoughtLine`** (`npx shadcn@latest add @react-bits/ThoughtLine-TS-TW`) header with `glyph={<CompassGlyph/>}` (never `'sparkle'`), `shimmer={false}`, `label` = the real retrieval stage ("Reading clause 4.2"), `steps` = real stages, `doneLabel="Read 3 clauses in"`; remove the unused `SparklesIcon` import; swap `@hugeicons` chevron/tick for lucide to avoid a second icon set. Reduced motion handled internally.
- Reduced motion: composer has one 150 ms opacity swap (fine); answer card uses `animate={{ height: "auto" }}` with `transition={{ duration: reduce ? 0 : 0.2 }}`.
- A11y: real `<textarea>` with `aria-describedby` pointing at "Answers quote your plan document; this is information, not advice" (copy must lint clean via `tools/advice_lint.py`); composer heading is `h3`; answer region `aria-live="polite"`.
- Fallback: prompt-kit **Prompt Input** (`https://prompt-kit.com/c/prompt-input.json`, no motion, builds on shadcn textarea + tooltip).

**Alternate:** Kokonut `ai-input-search` (fix the nested `role="textbox"`), Motion Primitives `MorphingPopover` (pill → composer morph; remove `aria-modal`, not inside the overflow-auto grid). **Pattern reference (not installed):** Eldora `github-inline-comments` — clause-anchored threads in the Documents view (drop add/del diff semantics; anchored clause tinted sand). **Not used:** React Bits `PromptBar` (model picker, mic, spark particles), Aceternity Placeholders-and-Vanish Input, Vercel AI Elements / 21st Agent Elements / prompt-kit chat-container (chat-sidebar genre), Kokonut `ai-voice`.

### N9 — Text reveals for island names and headings (≤ 500 ms, no per-letter effects)

**Primary: Magic UI `TextAnimate`.**
- Install: `npx shadcn@latest add @magicui/text-animate` → `src/components/magicui/text-animate.tsx`. Wrapper: `src/components/IslandHeading.tsx` (`as="h2"`, `by="word"`, `animation="fadeIn"`, `duration={0.2}`, `accessible`, `startOnView` off for drawer titles, on for map labels with `once`). Total ≈ 0.2 s stagger + 0.3 s item ≤ 500 ms. Headings only — island names in the drawer header and the four view titles; never body copy, clause quotes or numbers.
- Forbidden props: `by="character"`, `scaleUp/scaleDown`, `blurInUp/Down` on anything but a single page title.
- Reduced motion: not built in → `initial={false} animate="show"` when `useReducedMotion()`; the sr-only full string is always present.
- Selected-island accent: the **Hover.dev "Draw Circle Text"** technique (https://www.hover.dev/components/text → Draw Circle Text, copied to `src/components/vendor/hoverdev/InkLoop.tsx`): one `motion.path` with `pathLength 0→1`, `≤ 0.45 s`, stroke `var(--gold)` 2 px round caps, authored per label, `aria-hidden`, `viewport={{ once: true }}`; `initial={false}` under reduced motion.
- Fallback: **Motion Primitives `TextEffect`** (`per="word" preset="fade" speedReveal={1.5} as="h2"`; the preset key is `'blur'`, not the docs' `'blur-sm'`).

**Alternate:** React Bits `BlurText` (words, `delay 40, stepDuration 0.18`, add an `as` prop), Animata `WaveReveal` (`mode="word" duration="400ms"`, CSS-only; registry injects its keyframes). **Not used:** Eldora `fade-text`/`blur-in-text`/`word-pull-up-text` — duplicate TextAnimate with a hard-coded `<h1>`, `drop-shadow-sm` and `clsx`; Aceternity Text Generate (blur-in AI tell), every per-letter item (SplitText with GSAP, HyperText, letter-pull-up, TextScramble, TypingAnimation…), Motion+ `splitText` (paid).

### N10 — Hover / focus / selected states (calm, focus rings preserved)

**Primary: Motion gesture variants + Hover.dev Draw Outline Button + Eldora selection ripple.**
- Island buttons (`JourneyMap.tsx`): `<motion.button variants={island} whileHover="hover" whileFocus="focus" whileTap="press" animate={selected ? "selected" : "idle"}>` with a child `<motion.path variants={flag}/>`; hover `scale 1.02` + fill sea → forest; focus = same colour shift (the CSS `outline`/`focus-visible:ring-2 ring-terracotta ring-offset-2 ring-offset-paper` **stays** — motion adds to the ring, never replaces it); press `scale 0.98`; selected = gold flag. `bounce: 0`, scale never above 1.03, no tilt. Every variant changes a colour or opacity too, so the state is legible under reduced motion and on touch (Motion filters hover on touch).
- Checkpoint markers, secondary actions, the "Ask about this step" trigger: **Hover.dev Draw Outline Button** (https://www.hover.dev/components/buttons → Draw Outline Button, pure Tailwind; copied to `src/components/vendor/hoverdev/DrawOutlineButton.tsx`): four 2 px spans draw an ink frame in sequence (100 ms × 4 = 400 ms). Patches: `bg-indigo-300` → `bg-ink`, hover text → `text-ink`; duplicate every `group-hover:` as `group-focus-visible:`; `data-[state=selected]:` keeps the frame drawn for the active checkpoint; spans `aria-hidden`; `min-h-11`; `motion-reduce:transition-none motion-reduce:delay-0`.
- Selection ripple: **Eldora `svg-ripple-effect`** (`npx shadcn@latest add @eldoraui/svg-ripple-effect` → `src/components/eldoraui/svg-ripple-effect.tsx`) behind the island marker that **becomes** selected: reduce the loop to 5 rings, `transition={{ duration: 0.45, repeat: 0 }}`, stroke `stroke-sea` at 0.35 opacity, `aria-hidden`; the selected state lives on the button, so under reduced motion the ripple simply does not render.
- Stitch chips (`lib/stitches.ts` → `Primitives.tsx`): shadcn `ToggleGroup type="multiple"` items with `toggleVariants` edited: `border-rule`, `data-[state=on]:bg-parchment data-[state=on]:border-gold`, `hover:bg-paper-deep`, `min-h-11`, 3 px ring kept.
- Base: shadcn `Button` with an added `size: "touch": "min-h-11 px-4 text-base"`; `transition-all` → `motion-reduce:transition-none`.
- Fallback: CSS only — 2 px ink ring, 3 px gold `focus-visible` ring, selected = sand fill + terracotta tick, 150 ms.

**Alternate:** Magic UI `ShineBorder` (`shineColor={['#c59a3c','#e3cf9f']} duration 16`) on the **one** pinned plan column in Compare — handled by `motion-safe:` natively; Hover.dev Clip Path Links (direction-aware sea wash) for Compare cell hover, with `onFocus` triggering the "bottom" keyframes; Animata `UnderlineHoverText` (centre-out gold stroke, add `group-focus-visible:`). **Not used (AVOID):** Aceternity Hover Border Gradient / Card Spotlight (three.js) / Moving Border, Magic UI MagicCard / InteractiveHoverButton, Motion Primitives Spotlight / Tilt / Magnetic / BorderTrail, React Bits SpotlightCard / Magnet, Kokonut spotlight-cards / mouse-effect-card, Eldora card-flip-hover / holographic-card, Hover.dev Encrypt / Spotlight buttons.

### N11 — Benefits compass: radial gauges (SVG, animate once on reveal)

**Primary: Animata `GaugeChart` (dials) + `RingChart`/`DonutChart` (class percentages).**
- Install: `npx shadcn@latest add https://animata.design/r/graphs/gauge-chart.json` and `npx shadcn@latest add https://animata.design/r/graphs/ring-chart.json` (pulls `donut-chart`) → `src/components/animata/graphs/*.tsx`. Wrapper: `src/components/BenefitsCompass.tsx` (used by `PlanAtlas.tsx` / `LedgerView.tsx`).
- Layout: two open-arc `GaugeChart`s (deductible remaining, annual maximum remaining; `gap` opens at the bottom so each reads as a compass dial; add a `<g>` of 8 compass ticks in `stroke-ink/30`) flanking one `RingChart` (preventive / basic / major as concentric rings in `text-sea / text-sage / text-gold`). `children` slot holds `<Money>` + `EvidenceBadge` (`showValue={false}`); a legend lists each ring with its badge.
- Restyle: colours are `currentColor` via className → `progressClassName="text-sea" trackClassName="text-ink/10"`; `size 160`, widths 10, `rounded`; delete `RingChart`'s hard-coded `rounded-3xl bg-zinc-950` wrapper; fix the `@/animata/graphs/donut-chart` import path to the installed location.
- Animate once on reveal: mount inside Motion Primitives `InView` (`once`, `margin "0px 0px -20% 0px"`) or `useInView`; the component's 250 ms delay + `duration-500` transition then sweeps once. Never re-run on scroll.
- Reduced motion: add `motion-reduce:transition-none` on both circles and skip the 250 ms `shouldUseValue` delay when `reduce` — the dashoffset derives from props, so the end state is exact.
- A11y: `role="meter" aria-valuemin aria-valuemax aria-valuenow aria-label` on each gauge; UNKNOWN values render a dashed track and the UNKNOWN badge — never a 0 % arc (CLAUDE.md rule 2).
- Fallback: **Magic UI `AnimatedCircularProgressBar`** (`@magicui/animated-circular-progress-bar`, zero deps; `gaugePrimaryColor="var(--water)" gaugeSecondaryColor="var(--sand)"`; mount with `value=min` and set the real value in an effect; `motion-reduce:[--transition-length:0s]`).

**Alternate:** **React Bits `SloshGauge`** as a nautical "tide gauge" for annual maximum remaining (zero deps, `role=meter`, `liquidColor` sea, `viscosity 0.3 tilt 0.15 splash 0`, `showValue={false}`) — only if a side-by-side with the dial reads as one instrument; Kokonut `apple-activity-card` (concentric motion rings; lift `activities` to a prop, flat strokes, `initial={false}` under reduced motion); Uiverse `Nawsome/tall-monkey-16` draw-once ring technique (`pathLength="100"`). **Not used:** shadcn Chart / recharts radial blocks (recharts 3.8 is large, animates with no reduced-motion awareness, dashboard-corporate look).

### N12 — Comparison grid: sticky headers, equal columns, cell → paired clause card

**Primary: shadcn `Table` + `Popover` + Motion `layoutId` + Magic UI `Highlighter`.**
- `src/components/ComparisonGrid.tsx` (existing) rebuilt on `Table`: `table-fixed` + `<colgroup>` for equal widths; `TableHead className="sticky top-0 z-10 bg-paper-deep"`; container `max-h-[70dvh] overflow-auto scroll-fade-x` (utility ships in `shadcn/tailwind.css`; edit the installed `table.tsx` to accept `containerClassName` — it is your source); amounts `tabular-nums text-right` via `<Money>`; row hover `bg-parchment/60`; columns in the **user's order, no sort, no winner**, eligibility quote under every column (CLAUDE.md rule 6).
- Cell → clause: each cell is a `PopoverTrigger` (`min-h-11`); `PopoverContent` is the paired `ClauseCard` (`w-[min(92vw,22rem)] bg-paper-deep border-rule`, serif heading, `EvidenceBadge`s). Give the cell value and the card's figure `layoutId={"clause-"+clauseId}` inside a `LayoutGroup` so the number hops to its card (MotionConfig disables the hop under reduced motion). The quoted clause fragment carries one `Highlighter` `underline` in terracotta. At 360 px the card opens in the N4 `Drawer` instead.
- Reduced motion: colour transitions only + the popover CSS override; focus behaviour unchanged.
- Fallback: existing `ComparisonGrid` markup + `position: sticky` CSS + shadcn `Tooltip`/`Popover`.

**Alternate:** Eldora `grid` frame (`role="grid"` + per-cell borders) as a chart-paper backdrop under the compass — not needed for the table, which already has semantics; Hover.dev Clip Path Links wash on hover (see N10). **Not used:** Aceternity Compare (image slider; undeclared sparkles dependency breaks the build), 21st Hirael comparison (pricing grid), `@tanstack/react-table` (add only if sorting/filtering is ever allowed — it is not).

### N13 — Painted ocean movement and fog/parallax (CSS/SVG only)

**Primary: existing painted layers + Uiverse seigaiha texture + React Bits `GradualBlur` + Motion `useScroll` parallax.**
- Wrapper: `src/components/OceanLayers.tsx` used by `atlas/Paper.tsx` / `PlanAtlas.tsx`. Layer stack (bottom → top, max 4 composited layers):
  1. `journey-backdrop.webp` (static painting; SVG scene fallback as today).
  2. **Uiverse `marcelodolza/kind-panther-75`** overlapping-arc wave pattern (https://uiverse.io/marcelodolza/kind-panther-75, CSS only) as `::before` on the water mask: `--c1: var(--water) --c2: var(--paper) --s: 160px`, `#0008` shadow stop → `rgba(35,48,61,.06)`, `opacity .07`, `mix-blend-mode: multiply`; drifts with the existing `.ripples`-style `translateX` keyframe at **40 s** (class `motion-drift`).
  3. `fog-layer-1.webp` / `fog-layer-2.webp` (already in `web/public/art`) as `<motion.div style={{ y: fogY }}>` with `const { scrollY } = useScroll({ container: mapRef }); const fogY = useTransform(scrollY, [0, 1], [0, -0.15], { clamp: false })` (ratios ≤ 0.2, opacity ≤ 35 %, `will-change: transform`).
  4. **React Bits `GradualBlur`** (`npx shadcn@latest add @react-bits/GradualBlur-TS-TW`, zero deps) as the horizon fog band: `position="top" height="24%" strength={1.2} divCount={3} curve="ease-out" target="parent" zIndex={2}` + a sibling `bg-gradient-to-b from-paper/70 to-transparent` tint so it reads as warm fog, not glass. **Desktop only** (`@media (min-width: 768px) and (hover: hover)`), and never over text columns.
- Reduced motion: `style={{ y: reduce ? 0 : fogY }}`; `.motion-drift` is zeroed by the CSS override; layers rest at their final offsets. Parallax is also off for `pointer: coarse` (no scroll-linked motion on phones, matching the UI guide's 2–4 px rule).
- Performance: profile on a mid-range Android; if frame time suffers, drop layer 4 first, then layer 2's drift.
- Fallback: pure CSS mask gradient for the fog band; the SVG ripples already in `Paper.tsx`.

**Alternate:** **Animata `MovingGradient`** (`https://animata.design/r/background/moving-gradient.json`) clipped to the water as a 24 s single-hue sea drift (`gradientClassName="from-sea via-sage to-sea"` at 12 %, retime `--animate-bg-position` to `24s ease-in-out infinite alternate`, `animated={!reduce}`); Magic UI `ProgressiveBlur` / Motion Primitives `ProgressiveBlur` (same idea as GradualBlur but 8 backdrop layers by default — cap at 4); Animata Grid/Dot/DiagonalLines (graticule at 8 %, shoal hatching under not-covered regions in terracotta/15 %). **Not used:** Magic UI `NoiseTexture` (`paper-texture.webp` already provides grain; a 6-octave full-viewport feTurbulence is expensive on mobile), React Bits `Waves` (canvas rAF loop; recognisably "React Bits"), Aceternity Wavy Background / Background Beams, all WebGL/ogl/three items (Aurora, Topography, MicroSlats, Globe, Particles, Meteors, Kokonut `background-paths`/`beams-background`/`flow-field`, Eldora photon-beam/novatrix).

### N14 — Tabs / toggle group (depth dial), tooltips, popovers, badges, tables, progress

**Primary: shadcn set + React Bits `RubberSegment` as the depth dial.**
- Top-level nav (`App.tsx`): shadcn `Tabs` `variant="line"`, list `h-11`, `after:bg-gold` underline, `data-active:bg-paper`, `text-ink-soft`; the moving underline is a `motion.span layoutId="nav-underline"` inside the active trigger (snaps under reduced motion). Panels switch through the N3 `ViewSwitch`.
- Depth dial (Glance / Plan / Clause): **React Bits `RubberSegment`** (`npx shadcn@latest add @react-bits/RubberSegment-TS-TW` → `src/components/ui/RubberSegment.tsx`; wrapper `src/components/DepthDial.tsx`). Verified a11y: `role=radiogroup/radio`, `aria-checked`, roving tabindex, arrow/Home/End keys, visible `focus-visible` outline. Props only: `size="lg"` (44 px), `trackColor` sand, `thumbColor` ink, `textColor` ink, `activeTextColor` paper, `draggable={false}`, `stretch 25`, `squash 1` (a brass dial click, not rubber), `className="font-serif"`. Handles reduced motion internally (thumb jumps).
- Stitch chips / plan selector: shadcn `ToggleGroup` (N10 restyle).
- Tooltips: shadcn `Tooltip` (`bg-ink text-paper`, arrow ink, drop `zoom-in-95`, provider `delayDuration={300}`) for pointer/keyboard hints on evidence badges and checkpoints — **every fact a tooltip shows must also be reachable by Popover/Drawer** (touch has no hover).
- Popovers: shadcn `Popover` (`w-[min(92vw,22rem)] bg-paper-deep border-rule`, `origin-(--radix-popover-content-transform-origin)`, fade or 98→100 scale only).
- Badges: shadcn `Badge` extended with the six evidence variants — `doc: "bg-sage/30 text-ink border-forest/40"`, `user: "bg-paper-deep border-ink/30"`, `assumed: "bg-sand/60 border-gold"`, `ambiguous: "bg-gold-soft/50 border-gold text-ink"`, `unknown: "border-terracotta text-terracotta bg-transparent"`, `conflict: "border-danger text-danger bg-transparent"` — each **icon + word, never colour alone** (keep the existing `role="img" aria-label="Evidence: …"` from `Primitives.tsx`); `rounded-md` (stitched ribbon, not pill); `tabular-nums` on numeric badges; `asChild` → `<button>` opens the clause Popover. `.ribbon`/`.pill` CSS retire in favour of `badgeVariants`.
- Tables / progress: as N6/N12.
- Fallback for the dial: shadcn `ToggleGroup type="single" variant="outline" spacing={0}` with a `motion.span layoutId="depth-indicator"` in a `LayoutGroup id="depth"`.

**Alternate:** Motion Primitives `AnimatedBackground` (sliding sand highlight behind Radix tab triggers; add `role=tab`/`aria-selected` or wrap Radix triggers), Animata `FluidTabs` (WAI-ARIA correct; change `use(Context)` → `useContext`, `<nav>` → `<div>`), Hover.dev Chip Tabs (add tab semantics + arrow keys), Kokonut `smooth-tab` (pattern only — keyboard broken as shipped), React Bits `WarmTooltip` (manual copy; do not run next to Radix Tooltip). **Not used:** Aceternity Tabs (declares Radix, never uses it, no roles), Aceternity Animated Tooltip (avatars, hover-only), Uiverse tooltips (hover-only), Eldora `animated-badge` (infinite orbit + ping on every badge).

### Library coverage ledger (every owner-named library)

| Library | Concrete use | Alternate / pattern | Explicitly not used because… |
|---|---|---|---|
| shadcn/ui | Dialog, Drawer, Sheet, Tabs, ToggleGroup, Tooltip, Popover, Table, Progress, Badge, Button, Skeleton, Field, Textarea, Checkbox, Switch, HoverCard, `shimmer`, `scroll-fade-*`, `use-mobile` | Chart radial (N11) | Spinner, Questionnaire/message-scroller (React 19), Sidebar/Command/Carousel (no need) |
| Motion | engine; MotionConfig; `pathLength`; `layoutId`; gestures; `useScroll` parallax; `useSpring` compass needle | AnimatePresence hand-rolled | Motion+ / Motion UI (paid), AnimateView (React 19.3), Reorder (no keyboard) |
| Magic UI | AnimatedBeam (N2), TextAnimate (N9), Highlighter (N8/N12) | AnimatedCircularProgressBar (N11), BlurFade (N3), ShineBorder (N10), BorderBeam (N7), ProgressiveBlur (N13) | NumberTicker (NumberFlow covers), NoiseTexture (paper-texture.webp exists), all particles/neon/text gimmicks |
| Aceternity UI | Timeline (N5) | Tracing Beam (N2 mobile), Expandable Card pattern (N3), Text Generate (N9), Multi Step Loader & File Upload (N6, heavy patches) | Hover Border Gradient, Card Spotlight (three.js), Compare (sparkles dep), Background Beams, Animated Modal/Tooltip/Tabs (a11y) |
| Motion Primitives | MorphingDialog (N3), TransitionPanel (N3), InView (N11 reveal) | AnimatedNumber (N1 fallback), Dialog (N4 fallback), TextEffect (N9 fallback), TextShimmer (N7), AnimatedBackground (N14), MorphingPopover (N8), Disclosure (N6 rows) | SlidingNumber, Spotlight/GlowEffect/Tilt/Magnetic/BorderTrail, text gimmicks, ScrollProgress |
| Animata | GaugeChart + RingChart/DonutChart (N11) | AnimatedTimeline (N5), SplitReveal (N7), MovingGradient / Grid / Dot / DiagonalLines (N13), WaveReveal (N9), FluidTabs (N14), UnderlineHoverText (N10) | Counter/Ticker (N1 covered), backgrounds with canvas/particles, cards (3D), per-letter text, spinner |
| Kokonut UI | ai-prompt (N8 scaffold), file-upload (N6), smooth-drawer stagger variants (N4) | ai-text-loading / shimmer-text (N7), apple-activity-card (N11), hold-button (N6), smooth-tab (pattern), ai-input-search (N8) | ai-loading/loader (spinners), liquid-glass-card (glass), spotlight/mouse-effect/particle/attract buttons, text gimmicks, Next-only pieces |
| 21st.dev | discovery + MCP: NumberFlow (N1), prompt-kit Source (N8), Credenza (N4 alt), Origin UI Stepper (N6 alt) — all installed from upstream | — | its `/r/` install path (API key, daily quota, stale `framer-motion` metadata); items with "License: unknown" |
| React Bits | Stepper, StatusMark, HoldButton (N6), RubberSegment (N14), GradualBlur (N13), ThoughtLine (N8) | SloshGauge (N11), LatticeLoader (N7), BlurText (N9), WarmTooltip (N14), Counter (N1) | SplitText (GSAP = second engine), PromptBar (chatbot), Dock/Magnet/SpotlightCard, WebGL backgrounds, AnimatedList (global Tab hijack) |
| Eldora UI | svg-ripple-effect as the one-shot selection ripple (N10) | github-inline-comments as a pattern reference for clause-anchored threads (N8); grid frame (N12) | text items (hard-coded h1 + drop-shadow; TextAnimate covers), animated-badge (infinite orbit), terminal (timer), logo-timeline (marquee), card-flip (3D), WebGL backgrounds |
| Hover.dev | Draw Outline Button (N10), Draw Circle Text technique (N9/N2) | Drag Close Drawer gesture (N4), Clip Path Links (N10/N12), Chip Tabs / Slider Toggle (N14), Staggered Dropdown (N14 menus) | Spring Modal (bounce + glass), Encrypt/Spotlight buttons, Reveal Links (per-letter), loaders, Fuzzy Overlay (its PNGs are Hover.dev-copyrighted); all Pro items |
| Uiverse | Compass-rose loader `Nawsome/ancient-yak-42` (N7), seigaiha wave pattern `marcelodolza/kind-panther-75` (N13) | draw-once ring `Nawsome/tall-monkey-16` technique (N11/N6), water-fill text `mrhyddenn/witty-deer-83` (N7, progress-bound), switch/checkbox focus-ring recipes (`adamgiebl/grumpy-moth-36`, `cbolson/calm-wasp-75`) | tooltips (hover-only), cards (neumorphic/brutalist), rainbow loaders, 3D switches; the Export→React styled-components output |

---

## 3. Install order, dependency table, bundle budget, engine check

### 3.1 Install order (each step must leave `npm run build` green)

1. §1.1–1.2 Tailwind, alias, CSS entry wrap → `npm run build`.
2. §1.3–1.5 shadcn init, palette bridge, `cn` swap → `npm run build`; `grep -c oklch src/styles.css` = 0.
3. §1.6 `npm i motion@^12.23.12`; MotionConfig + TooltipProvider in `main.tsx`.
4. §1.7 shadcn primitives; Badge/Button/Drawer/Tabs restyles; retire `.spinner`, `.ribbon`, `.pill`, `.view > *` rise. **Commit: "web: tailwind v4 + shadcn (radix) + motion foundation".**
5. N1 NumberFlow + `Money.tsx`; replace every `.amt`/`.total` render → `tsc` proves every number has a badge.
6. N14 (`RubberSegment`, Tabs underline, Badge variants) and N10 (island variants, DrawOutlineButton, ripple).
7. N3 + N4 (`MorphingDialog`, `TransitionPanel`, Drawer branch, Kokonut stagger) → `ProcedureDrawer.tsx`, `ViewSwitch.tsx`.
8. N2 (`AnimatedBeam`, `pathLength` routes) → `CostPipeline.tsx`.
9. N5 (`Timeline`) → `CareTimeline.tsx`; N9 (`TextAnimate`, `InkLoop`).
10. N11 (`GaugeChart`, `RingChart`, `InView`) → `BenefitsCompass.tsx`; N12 `ComparisonGrid` rebuild.
11. N6 + N7 (`Stepper`, `file-upload`, `StatusMark`, `HoldButton`, `CompassLoader`, shimmer) → `UploadWizard.tsx`, `StageLoader.tsx`; lazy-load pdf.js.
12. N8 (`ai-prompt`, `Source`, `Highlighter`, `ThoughtLine`) → `AskAboutStep.tsx`.
13. N13 (`OceanLayers`: seigaiha, fog parallax, `GradualBlur`).
14. Licences (§5), `python3 tools/screenshots.py shots/`, Lighthouse sanity (§6). **Commit per need group.**

After every third-party add: `grep -rn "framer-motion\|next/\|clsx(" src/components | grep -v "lib/utils"` must be empty (fix imports, delete `next/*`), delete `"use client"`, strip `dark:` classes, run the restyle checklist for that component.

### 3.2 Dependency table

| Package | Constraint | Why | Gzip est. (main chunk impact) |
|---|---|---|---|
| `tailwindcss`, `@tailwindcss/vite` | `^4.1` | utilities for every registry component; CSS-first `@theme` | CSS only (purged) |
| `@types/node` (dev) | `^22` | `path` in `vite.config.ts` | 0 |
| `shadcn` (runtime) | `^4.21` | `shadcn/tailwind.css`: `shimmer-*`, `scroll-fade-*`, `data-open/closed` variants | CSS only |
| `radix-ui` | `^1.6` | Dialog, Tooltip, Popover, Tabs, ToggleGroup, Progress, Slot, HoverCard (tree-shaken) | ≈ 25–35 KB |
| `vaul` | `^1.1.2` | bottom sheet (React 16.8–19) | ≈ 6 KB |
| `class-variance-authority` | `^0.7` | `buttonVariants`, `badgeVariants` | < 1 KB |
| `clsx`, `tailwind-merge` | `^2`, `^3` | `cn()` | ≈ 7 KB |
| `tw-animate-css` | `^1.4` | enter/exit utilities used by shadcn | CSS only |
| `lucide-react` | `^1.51` (whatever init pins) | allowed icon list only (tree-shaken per icon) | < 2 KB |
| `motion` | `^12.23.12` | the single animation engine | ≈ 35 KB (full `motion` component incl. layout + drag; `LazyMotion` saving is marginal because layoutId/drag need `domMax`) |
| `@number-flow/react` | `^0.6` | N1 currency transitions, built-in reduced motion | ≈ 8 KB |
| `rough-notation` | `0.5.1` (via Highlighter) | N8/N12 hand-drawn underline | ≈ 4 KB, **lazy chunk** |
| `pdfjs-dist` | existing `^4.10` | PDF rendering | **lazy chunk**, never in main |
| **Must not appear** | `framer-motion` (declared), `gsap`, `@gsap/react`, `react-spring`, `animejs`, `three`, `@react-three/fiber`, `ogl`, `@tsparticles/*`, `recharts`, `next`, `next-themes`, `styled-components`, `@tabler/icons-react`, `react-icons`, `@hugeicons/*` (swap to lucide), `react-dropzone`, `@base-ui/react`, `@shadcn/react`, `motion-plus` | | |

Budget: **main chunk ≤ 350 KB gzip**, CSS ≤ 60 KB gzip. Expected after this plan: react-dom ≈ 45 KB + motion ≈ 35 KB + radix ≈ 30 KB + app code ≈ 60–90 KB + NumberFlow/vaul/cva/clsx ≈ 25 KB ≈ 200–230 KB. Headroom is for app code, not for more libraries.

Lazy-loading rules (`React.lazy` + `<Suspense fallback={<StageLoader …/>}>` with a real label): `DocumentsView`/`UploadWizard` (pulls pdf.js and `file-upload`), `AskAboutStep` (ai-prompt + ThoughtLine + Highlighter/rough-notation), `BenefitsCompass` gauges below the fold, `CompareView`. `vite.config.ts` → `build.rollupOptions.output.manualChunks: { pdfjs: ["pdfjs-dist"], motion: ["motion"] }` so the motion chunk is cached across routes.

### 3.3 Verifying one animation engine and the budget

Add to `web/package.json` scripts:

```json
"check:engines": "node scripts/check-engines.mjs",
"check:bundle": "vite build && node scripts/check-bundle.mjs"
```

`web/scripts/check-engines.mjs` (ESM, no deps):

```js
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const banned = /from\s+["'](framer-motion|gsap|@gsap\/react|react-spring|@react-spring\/web|animejs)["']/;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(t|j)sx?$/.test(f) ? [p] : []; });
const hits = walk("src").filter((p) => banned.test(readFileSync(p, "utf8")));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const declared = ["framer-motion", "gsap", "@gsap/react", "react-spring", "@react-spring/web", "animejs", "motion-plus"]
  .filter((n) => (pkg.dependencies ?? {})[n] || (pkg.devDependencies ?? {})[n]);
if (hits.length || declared.length) { console.error("second animation engine:", { hits, declared }); process.exit(1); }
if (!(pkg.dependencies ?? {}).motion) { console.error("motion is not declared"); process.exit(1); }
console.log("OK-one-engine");
```

`web/scripts/check-bundle.mjs`:

```js
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
let main = 0;
for (const f of readdirSync("dist/assets")) {
  if (!f.endsWith(".js")) continue;
  const gz = gzipSync(readFileSync(`dist/assets/${f}`)).length;
  console.log(`${f}  ${(gz / 1024).toFixed(1)} KB gzip`);
  if (f.startsWith("index-")) main = gz;
}
if (main > 350 * 1024) { console.error("main chunk over 350 KB gzip"); process.exit(1); }
```

Rules of evidence: `npm ls motion` shows exactly one `motion@12.x`; `framer-motion` may appear **only** indented under it; `grep -rn "framer-motion" src` is empty; `npx vite build` prints no `MODULE_LEVEL_DIRECTIVE` warnings (stripped) and no chunk-size warnings for the main chunk; `dist/assets/index-*.js` ≤ 350 KB gzip and `pdfjs-*.js` is a separate chunk.

---

## 4. Anti-slop usage rules for build agents

1. **One engine, one tempo.** All Motion transitions inherit `{ type: "spring", visualDuration: 0.35, bounce: 0 }`. UI motion ≤ 500 ms, micro 150 ms, standard 300 ms, journey (route/gauge/beam) ≤ 900 ms once. Scenery drifts (ripples, clouds, seigaiha, fog) ≥ 18 s. **Nothing loops faster than 2 s**; the only loops allowed are scenery drifts (class `motion-drift`) and the shimmer/compass sweep **while a real stage is running**.
2. **Causality, not decoration.** A beam, route or timeline fill draws from cause to effect in pipeline order, once per recompute (`key` on the recompute id). No idle beams, no `repeat: Infinity` on anything that is not scenery.
3. **Reveals.** `TextAnimate`/`InkLoop` on headings and island names only, by word, ≤ 500 ms. One `TransitionPanel` per view; no `InView`/`BlurFade` on cards, rows or headings ("every-heading-fades-up" is banned). Timeline entries and the compass may reveal once.
4. **Palette-only recolouring.** Colours come from `styles.css` tokens through `@theme inline` utilities (`text-ink`, `bg-paper-deep`, `stroke-sea`…) or `var(--…)` props. No hex literals in components, no Tailwind grays/zinc/neutral/indigo/blue, no `dark:` variants. Gradients only as flat painted washes between palette tints (timeline fill forest→sea, fog tint paper→transparent). No gradient text, no neon, no glow filters, no `drop-shadow`.
5. **No glass, no 3D, no particles.** `backdrop-filter` is allowed only in `GradualBlur` (≤ 3 layers, desktop only, never over text). No `rotateX/Y`, `perspective`, tilt, flip, confetti, sparkles, meteors, orbits, canvas/WebGL decorative effects. Overlays are `bg-ink/40`, never blurred.
6. **Component-specific limits.** `ShineBorder`/`BorderBeam`: at most one on screen, ≥ 14 s / only while processing. `Highlighter`: one mark per answer/card. `AnimatedBeam`: `repeat ≤ 2`. `svg-ripple-effect`: ≤ 6 rings, `repeat 0`. `TextAnimate`: never `by="character"`. `RubberSegment`: `draggable={false}`. `ThoughtLine`: never `glyph="sparkle"`, never `shimmer`. `CompassLoader`: never without a stage label.
7. **Focus and touch.** Every interactive element keeps its CSS `focus-visible` ring (terracotta 3 px, offset on paper); motion variants add to it. Every `group-hover:` effect has a `group-focus-visible:` twin. Targets ≥ 44 px (`size="touch"`, `min-h-11`). Every tooltip fact is also reachable by Popover/Drawer.
8. **Numbers.** Rendered only through `<Money>` (badge required by the type system), `tabular-nums`, ink, body face; never animated in colour; UNKNOWN is a dashed track + badge, never 0.
9. **Copy.** Component defaults ("Thinking…", "Hold me", "Add to cart", "Changelog from my journey", "Loading") are never shipped; all strings go through `src/lib/copy.ts` and must pass `tools/advice_lint.py`.
10. **Reduced motion is a feature, not a fallback.** Every component lists its guard (MotionConfig / `useReducedMotion` / `motion-reduce:` / `@media`) in a header comment; `python3 tools/screenshots.py` runs the phone pass with reduced motion and every end state (drawn route, filled gauge, visible heading, selected state, final dollar) must be present.
11. **Vendored = owned.** After install, a component is project source: patched, recoloured, documented in `web/THIRD_PARTY_NOTICES.md`. Re-running `shadcn add` on an existing file is forbidden without a diff review (`--diff` first).

---

## 5. Licences and attribution

| Library | Licence | Attribution required? | Notes for shipping OralCompass |
|---|---|---|---|
| shadcn/ui (+ radix-ui, vaul, tw-animate-css, cva, clsx, tailwind-merge) | MIT (cva Apache-2.0, lucide ISC) | No | keep `LICENSE` texts in `node_modules`; list in notices |
| Motion (`motion`, framer-motion, motion-dom) | MIT | No | Motion+ / Motion UI are paid — never install `motion-plus` |
| Magic UI (+ rough-notation) | MIT | No | — |
| Aceternity UI | **Custom "Aceternity License"** (not MIT, not OSI) | No | unlimited end products; **no redistribution of the components as a library/template/marketplace item**; do not publish `timeline.tsx`/`tracing-beam.tsx` as a reusable kit; flag if the hackathon requires OSI-only deps |
| Motion Primitives | MIT | No | beta — pin the installed sources in-repo |
| Animata | MIT | No | — |
| Kokonut UI (free registry) | MIT | No | Pro not used |
| React Bits | **MIT + Commons Clause** | No | free to use inside an application, including commercially; may **not** sell/redistribute the components themselves |
| 21st.dev | platform MIT; components per author (all chosen items MIT upstream) | per upstream | installed from upstream, so upstream licences apply (NumberFlow MIT, prompt-kit MIT, Credenza MIT) |
| `@number-flow/react` | MIT | No | — |
| Eldora UI | MIT | No | — |
| Hover.dev (free items) | **Custom proprietary Hover Dev, LLC licence** | No | unlimited commercial projects; **may not be compiled into a competing component library**; never vendor Hover.dev's own assets (`/noise.png` etc.) |
| Uiverse (per element) | MIT | No (requested) | keep `/* From Uiverse.io by <author> */` header in each copied CSS |
| OralCompass art (`web/public/art`) | project licence (owner-generated, see `web/public/art/LICENSE.md`) | n/a | unchanged |

**Required files:**
- `web/THIRD_PARTY_NOTICES.md` — one row per vendored component: component, origin URL (registry JSON or page), author, licence, install date, patches applied (palette, a11y, reduced motion), file path. Created in step 4 of §3.1 and updated on every add.
- `web/public/art/LICENSE.md` — append a section **"Third-party UI component sources"**: "Hand-written and generated art above is owner-created. Interface components vendored from third-party registries (shadcn/ui, Magic UI, Aceternity UI, Motion Primitives, Animata, Kokonut UI, React Bits, Eldora UI, Hover.dev, Uiverse) are listed with their licences in `web/THIRD_PARTY_NOTICES.md`; Aceternity UI and Hover.dev items are licensed for use in this end product only and are not redistributable as a component kit."
- `web/public/art/README.md` and the root `README.md` — one line pointing at `web/THIRD_PARTY_NOTICES.md`, plus the Tailwind v4 browser floor (Safari 16.4+, Chrome 111+, Firefox 128+).

---

## 6. Acceptance checks (all must pass before a `web/` commit)

1. `cd web && npm run build` — `tsc --noEmit` clean, `vite build` clean, no `MODULE_LEVEL_DIRECTIVE` or chunk-size warnings; `npm run check:engines` prints `OK-one-engine`; `npm run check:bundle` passes (main chunk ≤ 350 KB gzip, `pdfjs-*` separate).
2. `grep -rn "framer-motion\|from \"gsap\|next/" web/src` → empty. `grep -rn "oklch\|zinc-\|neutral-\|slate-\|indigo-\|blue-5\|#[0-9a-fA-F]\{6\}" web/src/components --include=*.tsx | grep -v THIRD_PARTY` → empty (hex allowed only in `styles.css` tokens and vendor CSS vars that point at tokens).
3. `grep -rn "spinner\|Sparkles\|WandSparkles\|sparkle" web/src` → empty.
4. Console: `npm run dev`, open every view, open an island, run the wizard with a fixture PDF, ask one question — zero console errors/warnings (including Radix "Missing `Description`" and React key warnings).
5. Reduced motion (`prefers-reduced-motion: reduce` emulated): island route fully drawn, beams static at full opacity, gauges at final arc, headings visible, `TransitionPanel` crossfades only, drawer/dialog open instantly, `RubberSegment` thumb on the selected slot, compass loader static with label, every `<Money>` at its final value — captured by `python3 tools/screenshots.py shots/` phone pass.
6. 360 × 780: no horizontal scroll (`document.documentElement.scrollWidth === 360` on every view, with the comparison grid scrolling inside its `scroll-fade-x` container), all targets ≥ 44 px (audit with the screenshot tool's checks), drawer `max-h-[85dvh]` with internal scroll.
7. Keyboard: Tab reaches every island, checkpoint, chip, dial stop, tab, badge; Esc closes dialog/drawer/popover and returns focus; arrow keys move the depth dial and nav tabs; visible focus ring on every stop (no `outline: none` anywhere: `grep -rn "outline-none\|outline: none" web/src` must only hit elements that also declare `focus-visible:ring`).
8. Evidence: `tsc` enforces `evidence` on `<Money>`; a manual sweep of every view confirms a badge beside every figure; UNKNOWN never renders as 0 or a filled arc.
9. Copy lint: `python3 ../tools/advice_lint.py src/lib/copy.ts` → 0 violations (all vendored default strings replaced).
10. Lighthouse-style sanity (Chrome DevTools, mobile preset, dev server): Performance ≥ 85, Accessibility ≥ 95, no "avoid non-composited animations" audit failures (only transform/opacity/clip-path animate), CLS < 0.1 (`scrollbar-gutter: stable`, `min-h` on `TransitionPanel`), LCP image is `journey-backdrop.webp` with `fetchpriority="high"`.
11. `python3 tools/screenshots.py shots/` — all 44 checks pass on desktop (1366×900) and phone (360×780, reduced motion).
12. `web/THIRD_PARTY_NOTICES.md` lists every file under `src/components/{ui,magicui,kokonutui,animata,eldoraui,vendor}` that did not exist before this plan.
