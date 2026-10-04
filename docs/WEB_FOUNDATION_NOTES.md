# Web foundation handoff notes (for the four web build agents)

Written 2026-10-03 after merging the web foundation branch (`worktree-wf_5834172d-085-1`, head `d7bf37d`) into `build/journey-v2`, on top of
the already-merged API build. Everything below was verified against the merged code; where this file and the code disagree, the code wins
and this file should be corrected. The build agents read **only this file and the code** (plus the spec documents it cites).

State of the merged tree at the time of writing: `cd web && npm run build` PASS (tsc + vite); `npm test` 5/5; `npm run check:engines` OK-one-engine;
`npm run check:bundle` OK (main 88.2 KB gzip; pdfjs separate); `api` 35 tests PASS; `engine` 21 tests PASS; `tools/advice_lint.py web/src/lib
api/app/templates.py api/app/assistant_templates.py` 0 violations; `tools/screenshots.py` 44/44 (desktop 1366x900, phone 360x780 reduced motion).

---

## 0. Exact commands

All paths relative to the repository root. `web/node_modules` is per checkout (per worktree): run `npm install` in every fresh worktree.

```sh
# one-time per worktree
cd web && npm install
mkdir -p public/fixtures/plans public/fixtures/documents
cp ../fixtures/plans/*.json public/fixtures/plans/ && cp ../fixtures/documents/*.pdf public/fixtures/documents/   # web/public/fixtures is gitignored

# web checks (run all four before you commit)
cd web && npm run build            # tsc --noEmit && vite build
cd web && npm test                 # vitest run
cd web && npm run check:engines    # one animation engine (motion); fails on framer-motion/gsap/react-spring/animejs imports or deps
cd web && npm run check:bundle     # rebuilds; main chunk must stay <= 350 KB gzip and a pdfjs-* chunk must exist
python3 tools/advice_lint.py web/src/lib api/app/templates.py api/app/assistant_templates.py api/app/assistant_glossary.py   # 0 violation(s); lint the DIRECTORY web/src/lib (several copy files)

# python checks
cd api && ORALCOMPASS_DEV_AUTH=1 python3 -m pytest -q tests     # 35 passed
cd engine && python3 -m pytest -q                               # 21 passed

# servers for manual work and for the screenshot walk
cd api && ORALCOMPASS_DEV_AUTH=1 python3 -m uvicorn app.main:app --port 8000          # api/.env (gitignored) is loaded by app/main.py via python-dotenv
cd web && npm run build && npx vite preview --port 4173 --host 127.0.0.1               # --host 127.0.0.1 is REQUIRED: the default binding is IPv6-only (::1) here and screenshots.py targets http://127.0.0.1:4173

# screenshot walk (needs both servers; writes PNGs + checks.json to the given directory; exit 1 on any failed check)
python3 tools/screenshots.py shots/<your-agent-name>
# zero-errors gate (API in demo mode, fresh data dir): clicks every control on every view on desktop / iPhone 13 WebKit / Pixel 7, motion on
# and reduced; exit 1 on any console error/warning, pageerror, unhandled rejection, unexpected >= 400 or React warning, printed with the
# action that triggered it. React warnings only exist in a dev bundle, so also run it against `npx vite` (dev server).
# `--only iphone|pixel|"x900 chromium motion"|"x900 chromium reduced"` runs one device (run them in parallel); `--quick` = desktop + Pixel 7.
python3 tools/error_sweep.py
```

- The vite preview and dev server proxy `/api/*` to `http://127.0.0.1:8000` (rewrite strips `/api`). The web client sends `X-Dev-User: demo-user`
  (`web/src/lib/api.ts`); the API honours it only with `ORALCOMPASS_DEV_AUTH=1`.
- `api/.env` sets `ORALCOMPASS_LLM_PROVIDER` / `ORALCOMPASS_LLM_MODEL` / `OPENROUTER_API_KEY`: with `openrouter` + a key the API is in **live** mode
  (`/health` reports `llm_mode: "live"`, `llm_model: "anthropic/claude-haiku-4.5"` by default). Without them it is **demo** mode. Design against both.
- `shots/` is untracked. Do not commit screenshots.
- `tools/screenshots.py` locates the four nav tabs with `get_by_role("tab", name=...)` (names "My journey", "My plan", "Compare", "Documents");
  the island/landmark buttons by `button[aria-label^='...']`; the plan picker by `label.plan-pick select`; the Map/Overview toggles by
  `get_by_role("button", name="Overview list" | "Map view")`; the depth dial by `get_by_role("radio", name="Exact wording")`; the clause card by
  `get_by_role("dialog")`; the phone close button by `get_by_role("button", name="Close details")`. Keep every one of these selectors working.

---

## 1. What the foundation installed

Stack added to `web/`: Tailwind CSS v4 (`@tailwindcss/vite`), shadcn (radix-nova style via the `radix-ui` meta package), `motion@12` as the only
animation engine, `vaul`, `rough-notation`, `@number-flow/react`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`,
`tw-animate-css`, `vitest@3` (dev). `cn, @fontsource-variable/geist, @hugeicons/*` were removed again after the CLI added them. See `web/package.json`.
Browser floor introduced by Tailwind v4: Safari 16.4+, Chrome 111+, Firefox 128+.

**Install failures: none.** Every component in the plan landed. Three things were written by hand instead of installed because no registry
offers them (Hover.dev techniques, Uiverse CSS): `components/vendor/*` below.

Every vendored file carries a header comment (origin, author, licence, install date, patches, reduced-motion guard) and a row in
`web/THIRD_PARTY_NOTICES.md`. **Add a row there for anything new you vendor.** Aceternity (timeline, tracing-beam) and the Hover.dev
techniques are end-product-only licences; this is flagged in `web/public/art/LICENSE.md`.

### 1.1 Component inventory (landing path under `web/src/`, export names, patched props)

shadcn primitives (`components/ui/*`, all named exports):

| File | Exports | Patches that change the API |
|---|---|---|
| `ui/badge.tsx` | `Badge, badgeVariants, evidenceVariant` | variants `doc, user, assumed, ambiguous, unknown, conflict, numeric` in addition to shadcn's; `evidenceVariant` maps `DOC->doc, USER->user, ASSUMED->assumed, AMBIGUOUS->ambiguous, UNKNOWN->unknown, CONFLICT->conflict`. Always render icon + word. |
| `ui/button.tsx` | `Button, buttonVariants` | `size="touch"` (min-h-11 px-4 text-base) and `size="icon-touch"` (44x44) added |
| `ui/checkbox.tsx` | `Checkbox` | generic only |
| `ui/dialog.tsx` | `Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger` | `DialogContent` prop `closeLabel` (default "Close"), 44x44 close; `DialogFooter` prop `closeLabel` renders an outline touch button; overlay `bg-ink/40`, fade + slide-in-from-bottom-2 |
| `ui/drawer.tsx` (vaul 1.1.2) | `Drawer, DrawerPortal, DrawerOverlay, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription` | `DrawerContent` prop `handleLabel` (default "Close"): the grab handle is a 44 px `<button>`; content `bg-paper-deep max-h-[85dvh]`; overlay `bg-ink/40` |
| `ui/dropdown-menu.tsx` | `DropdownMenu, DropdownMenuPortal, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent` | generic only (used by the ai-prompt scope selector) |
| `ui/field.tsx`, `ui/label.tsx`, `ui/separator.tsx` | `Field, FieldLabel, FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSeparator, FieldSet, FieldContent, FieldTitle`; `Label`; `Separator` | generic only |
| `ui/hover-card.tsx` | `HoverCard, HoverCardTrigger, HoverCardContent` | generic only (used by prompt-kit Source) |
| `ui/popover.tsx` | `Popover, PopoverAnchor, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger` | `w-[min(92vw,22rem)] bg-paper-deep`; `PopoverTitle` is an `<h3>` |
| `ui/progress.tsx` | `Progress` | `indicatorClassName` prop; h-2 sand track, sea indicator turning forest at 100 |
| `ui/sheet.tsx` | `Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription` | overlay `bg-ink/40` only. NOTE: this is shadcn's side sheet; the app's phone bottom sheet is `components/Primitives/Sheet.tsx` (section 2.8) |
| `ui/skeleton.tsx`, `ui/switch.tsx`, `ui/textarea.tsx` | `Skeleton`; `Switch`; `Textarea` | generic only |
| `ui/table.tsx` | `Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption` | `Table` prop `containerClassName` |
| `ui/tabs.tsx` | `Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants` | `variant="line"` list h-11 with a gold `after:` underline (App.tsx hides it with `after:hidden` and draws its own `motion.span layoutId="nav-underline"`) |
| `ui/toggle.tsx`, `ui/toggle-group.tsx` | `Toggle, toggleVariants`; `ToggleGroup, ToggleGroupItem` | generic only |
| `ui/tooltip.tsx` | `Tooltip, TooltipContent, TooltipProvider, TooltipTrigger` | ink/paper, fade only; `TooltipProvider delayDuration={300}` is mounted once in `main.tsx` |
| `hooks/use-mobile.ts` | `useIsMobile` | shadcn's 768 px hook, for vendored code only. Product code uses `hooks/useMobile.ts` `useMobile()` (760 px, matches styles.css) |

z-index contract: overlays/drawer/dialog `z-40`, popover/tooltip `z-50`; the legacy `ClauseCard` is z-20 and `.detail.sheet` z-15 in CSS.

Magic UI (`components/magicui/*`):

| File | Exports | Patches |
|---|---|---|
| `magicui/animated-beam.tsx` | `AnimatedBeam` (named), `AnimatedBeamProps` | defaults: ink path, sea -> gold gradient, `repeat` 1, duration 0.9; `aria-hidden`; renders only the static path under reduced motion |
| `magicui/text-animate.tsx` | `TextAnimate` (named) | generic only; never use `by="character"` |
| `magicui/highlighter.tsx` (rough-notation 0.5.1) | `Highlighter` (named) | defaults underline / terracotta / 1.2 px / 1 iteration, `animate: !reduce`. **Not imported anywhere yet; import it with `React.lazy` so rough-notation stays out of the main chunk.** |
| `magicui/animated-circular-progress-bar.tsx` | `AnimatedCircularProgressBar` (named) | generic only; pass `gaugePrimaryColor="var(--water)" gaugeSecondaryColor="var(--sand)"` |
| `magicui/blur-fade.tsx` | `BlurFade` (named) | generic only |

Aceternity (`components/ui/*`, end-product licence):

| File | Exports | Patches |
|---|---|---|
| `ui/timeline.tsx` | `Timeline` (named) | props `{ data: {title, content}[], current?, ariaLabel? }`; renders `<ol>/<li aria-current="step">`; demo heading removed; reduced motion -> fill 100 % |
| `ui/tracing-beam.tsx` | `TracingBeam` (named) | sea/forest/gold stops; `aria-hidden`; reduced motion -> y1 0 / y2 height |

Motion Primitives:

| File | Exports | Patches |
|---|---|---|
| `ui/morphing-dialog.tsx` (+ `hooks/useClickOutside.tsx`, default export) | `MorphingDialog, MorphingDialogTrigger, MorphingDialogContent, MorphingDialogContainer, MorphingDialogTitle, MorphingDialogSubtitle, MorphingDialogDescription, MorphingDialogImage, MorphingDialogClose` and their `*Props` types | overlay `bg-ink/40` |
| `ui/transition-panel.tsx` | `TransitionPanel`, `TransitionPanelProps` | generic only; wrapped by `components/ViewSwitch.tsx` |
| `ui/in-view.tsx` | `InView`, `InViewProps` | generic only |
| `ui/animated-number.tsx` | `AnimatedNumber`, `AnimatedNumberProps` | generic only (fallback for Money; prefer `components/Money.tsx`) |
| `ui/text-effect.tsx` | `TextEffect`, `PresetType`, `PerType`, `TextEffectProps` | generic only (preset key is `blur`) |
| `motion-primitives/dialog.tsx` (+ `motion-primitives/usePreventScroll.tsx`) | `Dialog, DialogTrigger, DialogPortal, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose` (native `<dialog>`) | lives OUTSIDE `ui/` because the registry file name collides with the shadcn `dialog.tsx`; import from `@/components/motion-primitives/dialog`; `DialogClose` takes `aria-label`; 44x44 close |

React Bits (`components/ui/*`, PascalCase, MIT + Commons Clause, default exports):

| File | Exports | Patched props |
|---|---|---|
| `ui/Stepper.tsx` | default `Stepper`, named `Step` | controlled `step` (1-based) + `onStepChange`, `onFinalStepCompleted`, `stepLabel(n)` (accessible names for indicators), `backButtonText / nextButtonText / completeButtonText` with NO defaults (the buttons render only when text is passed), `backButtonProps / nextButtonProps`, `disableStepIndicators`, `renderStepIndicator`; default indicators are `<button aria-current="step">` 44 px; connectors are `<li aria-hidden>` |
| `ui/StatusMark.tsx` | default `StatusMark`, `StatusMarkProps`, `StatusMarkStatus` (`pending | running | done | failed | cancelled`) | defaults `doneColor` forest, `errorColor` terracotta, `strike` false |
| `ui/HoldButton.tsx` | default `HoldButton`, `HoldButtonProps` | defaults sand/forest/ink/paper, `holdTime` 900, `wave`/`glow` false; `children` and `doneLabel` default to '' (pass copy); `onHold`, `onTap`; carries `.unstyled` |
| `ui/RubberSegment.tsx` | default `RubberSegment`, `RubberSegmentProps`, `RubberSegmentItem`, `RubberSegmentSize` | defaults sand/ink/paper, `draggable` false, `aria-label` has no default (pass one); `items, value, defaultValue, onChange(value, index)`; `.unstyled` |
| `ui/ThoughtLine.tsx` | default `ThoughtLine`, `ThoughtLineProps`, `ThoughtLineGlyph` | `glyph` is `'dot' | 'none' | ReactNode` (no AI glyph), lucide icons, `shimmer` false, `label`/`doneLabel` default '' (pass ASSIST copy); `working`, `steps`, `onSettle` |
| `ui/GradualBlur.tsx` | default `GradualBlurMemo` | generic only; desktop-only, <= 3 layers at the call site |
| `ui/BlurText.tsx` | default `BlurText` | generic only |

Kokonut UI (`components/kokonutui/*`, default exports, substantially rewritten; read the header comments):

| File | Exports | Props (as patched) |
|---|---|---|
| `kokonutui/ai-prompt.tsx` (+ `hooks/use-auto-resize-textarea.ts` `useAutoResizeTextarea`) | default `AI_Prompt`, `AIPromptScope {value, label}` | `{ scopes?, scope?, onScopeChange?, placeholder?, sendLabel (REQUIRED), scopeLabel?, describedBy?, disabled?, onSubmit?(value, scope), className? }`. Model picker, vendor logos and header are gone (logo files deleted); send icon is lucide `Compass` |
| `kokonutui/file-upload.tsx` | default `FileUpload`, `formatBytes`, `FileStatus`, `FileError`, `FileUploadLabels` | controlled: `{ onFileSelected(file), status?: 'idle' | 'uploading', progress?: 0..100, currentFile?, onCancel?, labels: {title, hint, choose, cancel, limits?, tooLarge?(max), wrongType?} (REQUIRED), acceptedFileTypes default ['application/pdf'], maxFileSize default 32 MB }`. Validation errors are persistent until the next file |
| `kokonutui/ai-text-loading.tsx` | default `AITextLoading` | `{ texts: string[], index: number, className? }` controlled, no interval |

Animata (`components/animata/<category>/*`, default exports):

| File | Exports | Patches |
|---|---|---|
| `animata/graphs/gauge-chart.tsx` | default | defaults `text-sea` / `text-ink/10`; reduced motion skips the 250 ms delay |
| `animata/graphs/ring-chart.tsx`, `animata/graphs/donut-chart.tsx` | default each | same reduced-motion patch; sea/sage/gold samples |
| `animata/progress/animatedtimeline.tsx` | default and named `AnimatedTimeline`, `TimelineEvent {id, title, description?, date?}` | controlled `activeIndex`, `aria-label`; `<ol>/<li aria-current>` |

Eldora UI, prompt-kit, npm:

| File | Exports | Patches |
|---|---|---|
| `eldoraui/svg-ripple-effect.tsx` | default | `{ rings <= 6, transition {duration .45, repeat 0}, fade?, whileHover?, className }` one-shot, `aria-hidden`, `stroke-sea` |
| `ui/source.tsx` (prompt-kit) | `Source, SourceTrigger, SourceContent` + `*Props` | generic only (builds on hover-card) |
| `@number-flow/react@0.6.2` | npm | wrapped by `components/Money.tsx`; never render a dollar figure with NumberFlow directly |

Hand-written vendor copies (`components/vendor/*`, named + default exports):

| File | Exports | API |
|---|---|---|
| `vendor/hoverdev/DrawOutlineButton.tsx` | `DrawOutlineButton` | `{ selected?, ...ButtonHTMLAttributes }`; `.unstyled`, 44 px, `group-focus-visible:` twins, `data-state=selected` |
| `vendor/hoverdev/InkLoop.tsx` | `InkLoop` | `{ children, active?, d?, stroke?, strokeWidth?, duration?, className? }` draws a gold `pathLength` loop once in view (`viewport once`; `initial={false}` under reduced motion) |
| `vendor/uiverse/CompassLoader.tsx` (+ `compass-loader.css`) | `CompassLoader` | `{ progress?: 0..1, label (REQUIRED), size?, className? }`: `progress` turns the needle once per stage via a Motion spring; indeterminate mode runs the 2 s ring sweep; static under reduced motion |
| `vendor/uiverse/seigaiha.css` | CSS only | `.oc-seigaiha` with `--c1/--c2/--s`; `.oc-seigaiha-layer.motion-drift` (40 s drift, off under reduced motion) |

Utility: `lib/utils.ts` exports `cn` (clsx + tailwind-merge). `components.json` registers `@aceternity`, `@kokonutui`, `@eldoraui`, `@magicui`,
`@react-bits` registries. **Vendored = owned**: never re-run `shadcn add` on an existing file without `--diff` (see the CLI caveat in section 5).

---

## 2. Frozen contracts

Frozen means: build agents build against these without changing their shape. Additive extensions (new optional props, new type members, new
copy keys in your own namespace) are allowed; renames and removals are not. Files not listed here that pre-date the foundation
(`components/Primitives.tsx`, `ClauseCard.tsx`, `atlas/*`, `CostTrail.tsx`, `DocumentsView.tsx`, ...) are owner-written and editable by the
agent that owns their view, within the spec.

### 2.1 `web/src/hooks/useAppData.ts`

`useAppData()` returns exactly these keys (type `AppData = ReturnType<typeof useAppData>`):

```
planRef: PlanRef                      // "" until loaded; a preset code ("ML26") or "upload:<document_id>"
selectPlan(ref: PlanRef): void
reestimate(): void                    // bumps a tick that re-runs the plan/rules/evidence/estimate effect
estimate: SavedEstimate | null        // POST /me/estimates for planRef when any item is planned/scheduled; else null
plan: PlanFixture | null              // the plan MODEL (GET /plans/{code} or /me/plans/{id} -> .model)
rules: CoverageRule[]
evidence: PlanEvidence | null
stitches: Stitch[]                    // stitchesFromClauses(evidence.clauses)
benefits: Benefits[]                  // the WHOLE list from GET /me/benefits; look up per plan at the call site: benefits.find(b => b.plan_code === planRef)
items: TreatmentItem[]
journeys: JourneyView[] | null        // null until loaded; [] means a new user
view: JourneyView | null              // the active journey
setView(v: JourneyView | null): void  // also follows v.journey.plan_ref
samples: { id, label, plan_ref }[]    // GET /journeys/samples
procedures: Procedure[]               // GET /procedures (new fetch)
loading: string | null                // the label for StageLoader ("Connecting…", UI.processing)
error: string | null
busy: boolean
startJourney(from: string): Promise<JourneyView | null>
patch(cpId, body): Promise<void>      // PATCH /journeys/{view.id}/checkpoints/{cpId}
instructions(stageId, text, source, givenOn?): Promise<void>
loadBase(): Promise<void>
plans: PlanSummary[]                  // GET /plans catalog (deviation from the spec's list; needed for every plan picker). The summary of the
                                      // current plan is plans.find(p => p.plan_code === planRef); for an upload ref it is NOT in this list
                                      // until the owner adds GET /me/plans items (api.myPlans()) to the picker.
```

Behaviour: `loadBase()` loads plans + journeys + samples and selects the first journey (its plan_ref, else the first non-fictional preset).
Records (`items`, `benefits`) reload when `view.id` changes. The plan effect re-runs on `planRef`, `items`, or `reestimate()`. `planByRef /
rulesByRef / evidenceByRef` route `upload:` refs to `/me/plans/{id}...`. After a publish, call `selectPlan(summary.plan_code)` then `reestimate()`.

### 2.2 `web/src/hooks/useJourneySelection.ts` and `useMobile.ts`

`useJourneySelection(view)` returns `{ selection: { stage?: StageSelection; island?: MapSelection }, selectStage(sel | null, fromEl?),
selectIsland(sel | null, fromEl?), clear() /* restores focus to fromEl */, returnFocusRef }` (type `JourneySelectionApi`). One of stage/island is
open at a time. When `view.id` changes it selects the current care stage. `useMobile()` is the 760 px breakpoint (matches `@media (max-width: 760px)`).

### 2.3 `web/src/lib/types.ts` additions (bottom of the file) and `lib/upload-types.ts`

`PlanRef` (string), `isUpload(ref)`, `uploadId(ref)`, `UploadedPlanSummary extends PlanSummary { document_id, version_label, published_at }`,
`LedgerLine.treatment_item_id? / procedure_key?`, `ProcedureCategory`, `IslandKind`, `IslandState`, `CheckpointRule`, `InsuranceCheckpointVM`,
`IslandVM`, `Claim`, `PassageVM`, `MapSelection { islandId, checkpointKey? }`, `StageSelection { stageId, cpId? }`, `JourneySelection`,
`AssistScope { plan_ref, estimate_id?, treatment_item_id?, line_index?, step_key?, checkpoint_key?, stitch?, journey_id? }`, `AssistRef`
(`step | line_total | field | clause`), `AssistBlock` (`sentence | clarify | template`), `AssistResponse`, `UploadResponse`, `ReviewDecision`, and a
re-export of `ExtractedField` / `ExtractionStatus` from `lib/upload-types.ts` (spec section 7.5 verbatim: statuses `queued | reading_text | redacting |
identifying_fields | matching_rules | verifying_quotes | ready | failed | demo_no_model`; field `confidence`, `evidence_status`, `review_status`,
`candidates`, `required`, `decision`).

**Additive gaps versus the API (the owner of the assistant/upload work extends these types, append-only):** the API's assistant response also carries
`ribbon: string | null`, template blocks also come with `key: "out_of_scope"`, and the advice template block carries `label` (section 3.1). The API's
extraction status carries more than `ExtractionStatus` lists (`ribbon`, `notes_for_review`, `undecided_required`, `structure`, `counts`,
`demo_fixture_match`, `notes`, `notes_dropped`; section 3.2). `api.health()` types `llm_model?: string`; the API sends `null` in demo mode.

### 2.4 `web/src/lib/api.ts` additions

`ApiError { status, path, body }` (`body` is the parsed JSON error, e.g. `{ error: "undecided_fields", fields: [...] }`). `BenefitsIn` (body of
`PUT /me/benefits/{plan_ref}`). New methods: `health()` (with `llm_mode`), `planByRef(ref)`, `rulesByRef(ref, keys?)`, `evidenceByRef(ref)`, `myPlans()`,
`putBenefits(ref, body)` (URL-encodes the ref; `upload:` colons are safe), `uploadDocument(file, sha256, pages, textPreview)` (multipart; no JSON
Content-Type), `redaction(id, extra_terms)`, `extract(id)`, `extraction(id)`, `review(id, decisions)`, `publish(id)`, `ask({ message, scope })`.
Pre-existing: `plans, plan, rules, evidence, procedures, procedureCodes, benchmarks, sources, dataReport, journeys, journeySamples, createJourney,
journey, patchCheckpoint, putInstructions, benefits, benefitsFor, treatmentItems, patchItem, addItem, estimateFromRecords, savedEstimates,
myDocuments, exportMe, deleteMe, audit, estimate, comparison, fixturePlan`. Add new endpoints here, not as ad-hoc `fetch` calls.

### 2.5 Stub files (props frozen; bodies are yours)

Each stub currently returns `null` and documents its contract in its header comment.

| File | Owner | Props |
|---|---|---|
| `components/upload/UploadWizard.tsx` (`UploadWizard`, default too) | upload-review + assistant agent | `{ planRef: PlanRef; onPublished?(summary: UploadedPlanSummary, planRef: PlanRef); open?; onOpenChange?(open); trigger?: ReactNode }` |
| `components/assistant/AskAboutStep.tsx` (`AskAboutStep`) | upload-review + assistant agent | `{ scope: AssistScope; onOpenStitch?(stitchId: string); onOpenStep?(lineIndex, stepIndex); className? }` |
| `components/drawer/sections/AskSection.tsx` (`AskSection`) | upload-review + assistant agent | `{ scope: AssistScope; onOpenStitch?(stitchId) }` |
| `components/compass/BenefitsCompass.tsx` (`BenefitsCompass`) | foundation + map agent | `{ plan: PlanFixture; benefits: Benefits | null; estimate: SavedEstimate | null; stitches: Stitch[]; compact?; onOpenLandmark(id: LandmarkId); onSelectStitch(s: Stitch) }` |
| `components/drawer/ProcedureDrawer.tsx` (`ProcedureDrawer`) | foundation + map agent | `{ island: IslandVM; vm: PassageVM; plan: PlanFixture; rules: CoverageRule[]; benefits: Benefits | null; estimate: SavedEstimate | null; stitches: Stitch[]; selectedCheckpoint?: string; onSelectStitch(s); onOpenDocuments(); onClose(); mobile: boolean; returnFocus?: HTMLElement | null }` |

Hook points already wired for you: `DocumentsView` prop `uploadSlot?: ReactNode` (rendered inside "Your documents", above the stored-document
list); `ClauseCard` prop `askSlot?: ReactNode` (footer, before "Open in Documents"). `PlanView`'s plan picker is still the legacy
`label.plan-pick select` (keep that selector working; PlanSelector composes next to it). `App.tsx` does not yet pass `uploadSlot`/`askSlot`:
the integrating agent adds them.

### 2.6 View shells

`App.tsx` (shell) renders `<Tabs value onValueChange className="app">` with the `TabsList` inside `<nav class="topnav">` and ONE
`<TabsContent value={tab} forceMount asChild><main class="view view-<tab>">` wrapping a `ViewSwitch` of four children; it holds `tab`, `landmark`,
`stitch` state and the `ClauseCard`. `main.tsx` wraps everything in `<MotionConfig reducedMotion="user" transition={{ type: "spring",
visualDuration: 0.35, bounce: 0 }}>` and `<TooltipProvider delayDuration={300}>`.
`views/JourneyView.tsx` props `{ data: AppData; selection: JourneySelectionApi; mobile: boolean; onOpenLandmark(id: LandmarkId); onOpenDocuments() }`
(the Map view / Overview list toggle is local state here). `views/PlanView.tsx` props `{ data: AppData; mobile; landmark: LandmarkId | null;
onLandmark(id | null); stitch: Stitch | undefined; onStitch(s | undefined); onOpenDocuments() }`.

### 2.7 Copy namespaces

All user-facing strings live under `web/src/lib/` and are linted by `python3 tools/advice_lint.py web/src/lib`. `lib/copy.ts` holds `FOOTER,
TAGLINE, BADGE_LABEL, BADGE_ICON, PLAIN, NAV, LANDMARKS/LandmarkId, STATUS_LABEL, ATTRIBUTION, UI, TRAIL` and re-exports the namespaces.
One namespace file per owner, each currently an empty `{} as const satisfies Record<string, string | ((...a) => string)>`; append keys only:

- `lib/copy/passage.ts`: `PASSAGE`, `DRAWER`, `COMPASS` (foundation + map agent)
- `lib/copy/plan.ts`: `PLAN` (foundation + map agent)
- `lib/copy/upload.ts`: `UPLOAD` (upload-review + assistant agent)
- `lib/copy/assistant.ts`: `ASSIST` (upload-review + assistant agent)

Rules: state what the documents say, what the records say and what the arithmetic yields; never tell the user what to do; no em dashes in the
namespace files. Vendored components ship NO default strings: pass copy from your namespace. `UI.renderingDocument` was added for the lazy PageView.

### 2.8 Stylesheets

`web/src/styles.css` is the single colour source (`:root` tokens, spec section 5.1 aliases, shadcn variables mapped to tokens, `@theme inline`
bridge, `@layer base`, `@layer components`, the reduced-motion contract). Its imports, in order:

```
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./styles/journey.css"   layer(components);   /* foundation + map agent: passage map, drawer sections, pipeline, care rail */
@import "./styles/plan.css"      layer(components);   /* foundation + map agent: plan selector, benefits compass, benefit statement form, importer */
@import "./styles/upload.css"    layer(components);   /* upload-review agent: wizard, redaction preview, extraction progress, review table, publish */
@import "./styles/assistant.css" layer(components);   /* assistant agent: composer, answer card, citations */
```

Write your CSS in your own file; no hex and no new colours there (use `var(--token)` or the palette utilities). Cascade: theme < base < components
< utilities, so a Tailwind utility on the element beats anything in these files. Reduced motion: `[data-vaul-drawer]` transitions zeroed,
`.animate-in/.animate-out` and `.motion-drift` disabled, plus the legacy `.you-are-here, .route, .beam, .ripples, .clouds, .map, .detail` block;
put the class `motion-drift` on every scenery loop.

### 2.9 Foundation wrappers

- `components/Money.tsx`: `<Money cents={number | null | undefined} evidence={Evidence} badge? signed? className? id? />`. `evidence` is REQUIRED by
  the type (a tsc test asserts `<Money cents={1} />` fails). Renders NumberFlow (USD, tabular ink) with an `EvidenceBadge` sibling; `badge={false}`
  keeps an sr-only "Evidence: X"; `null` renders an em-dash with `aria-label="no amount"` (never $0.00 for a missing input).
- `components/StageLoader.tsx`: `<StageLoader label={string} stageIndex? stages? valueLabel?(i, n) size?="sm"|"md" className? />`. `label` REQUIRED.
  With `stageIndex`+`stages` it is determinate (compass turns per stage, Progress bar); without, indeterminate sweep. `role="status" aria-live="polite"`.
  It replaced the old `.spinner`; `App.tsx` renders it inside `.processing` while `loading` is set. Use it as the `Suspense` fallback for every lazy chunk.
- `components/ViewSwitch.tsx`: `<ViewSwitch index={n} direction? className?>{children[]}</ViewSwitch>`: one Motion Primitives TransitionPanel with
  `min-h-[40vh]`; vertical wash-in by default; pass `direction` (+1/-1) for wizard panes (12 px horizontal slide).
- `components/atlas/ArtPlate.tsx`: `<ArtPlate slot x y w h fallback opacity? preserveAspectRatio? className? onFallback? />` inside an SVG: tries
  `/art/<slot>.webp`, then `.png`, then renders `fallback`; `fog-layer-1`, `fog-layer-2`, `benefits-chest` load lazily. `ArtSlot` lists the known slots.
- `components/Primitives/Sheet.tsx`: `<Sheet open onOpenChange title description? originRect? returnFocus? className? closeLabel="Close details">`:
  the phone bottom sheet built on the shadcn Drawer (vaul over Radix Dialog): max-h 72vh (85dvh), radius 18 18 0 0, 44 px handle, 44x44 close with
  `aria-label={closeLabel}`, sticky 48 px title bar, scrollable body; focus returns to `returnFocus` on close.
- `components/Primitives.tsx` (pre-existing): `EvidenceBadge { status }`, `StitchChip { stitch, selected?, prominent?, onSelect? }`, `DepthDial { depth, onChange }`.
- `lib/motion.ts`: `DUR {micro .12, standard .24, journey .7, fogLift .9, page .42}`, `DUR_MS`, `EASE {standard, inOut, land, exit}`, `exitOf(enter)`
  (= 0.7x), `SHEET_SPRING`, `UI_SPRING`, `MONEY_SPRING`, `transitions {washIn, tabGlide, drawerRise, drawerExit, chartDraw, focusIsland, soundingRoll,
  fogLift, threadPull}`, `viewVariants`, `viewTransition`, and a re-export of `useReducedMotion` from `motion/react`. Import animation helpers from
  `motion/react` only (`check:engines` fails on anything else).
- `lib/stitches.ts`: `stitchesFromClauses, buildStitches, stitchForStep, stitchForLabel, stitchForCite, formatStitch, circled, money, signed`.
  `lib/journey.ts`: `layoutIslands, routePath, stageProgress, statusLabel, attributionLabel, dateLabel, nextCheckpoint, currentStageId, MAP_W, MAP_H`.
  `lib/trail.ts`: `buildTrail(line): Trail` (tested in `src/__tests__/trail.test.ts`).

### 2.10 Build configuration (frozen)

`vite.config.ts` (`@` alias, `/api` proxy on dev :5173 and preview :4173, `manualChunks`: `pdfjs` for pdfjs-dist, `motion` for motion/framer-motion/
motion-dom/motion-utils), `tsconfig.json` (`@/*` -> `src/*`, strict), `components.json`, `scripts/check-engines.mjs`, `scripts/check-bundle.mjs`,
`package.json` scripts (`build, test, check:engines, check:bundle, lint:copy, dev, preview`). Budget headroom: main 88.2 of 350 KB gzip; motion chunk
~45 KB (cached across views); CSS 24.5 of 60 KB. Keep pdf.js, rough-notation, the upload wizard and the assistant behind `React.lazy` with a
`StageLoader` fallback that has a real label.

---

## 3. API facts the web must respect

Source: `api/app/{main,records,uploads,extraction,assistant,assistant_templates,templates,notifications,auth,store}.py` and `api/tests/*.py`.
General: every private resource is owner-scoped; a foreign or unknown id is a constant `404 {"error": "not_found"}`; missing auth is
`401 {"error": "unauthenticated"}`; money is integer cents everywhere; the API never steers (all its sentences pass the same advice linter).
Plan references are a preset code (`"ML26"`, upper-cased by the API) or `"upload:<document_id>"` everywhere a `plan_ref`/`plan_code` is accepted
(`/me/benefits/{plan_ref}`, `POST /me/estimates`, `POST /estimates`, `POST /comparisons`, the assistant scope).

### 3.1 Assistant: `POST /me/assistant`

Body: `{ message: string (<= 400 chars), scope: AssistScope }` where `scope.plan_ref` is required (1..80 chars) and `line_index >= 0`.
Rate limit: 30 requests per 10 minutes per user -> `429 {"error": "rate_limited"}` (no text in the body; the web shows its own ASSIST string.
`ASSIST_RATE_LIMITED` in `api/app/templates.py` is a lint-clean wording to mirror: "Too many questions in a short time; the composer opens again in a moment.").

Response (every field always present unless noted):

```
mode: "demo" | "live"
model?: string                 // only when mode === "live" (e.g. "anthropic/claude-haiku-4.5")
intent: "explain_step" | "explain_clause" | "where_from" | "what_if_requested" | "advice_request" | "out_of_scope" | "clarify"
blocks: AssistBlock[]
suggested: string[]            // three follow-up questions keyed to the step rule (D, CO, M, ...) or the clause
guard: { dropped: number; grounding_failures: number }
tools_used: string[]
ribbon: string | null          // ADDITIVE: see below
```

Block shapes:
- `{ type: "sentence", text, refs: AssistRef[] }`: the grounded answer; every ref was checked against the scope's allowed set.
- `{ type: "clarify", text, options: [{ label, scope_patch: Partial<AssistScope> }] }`: the question could name more than one line on the route;
  re-ask with `{ ...scope, ...scope_patch }`.
- `{ type: "template", key: "advice_question", label: "Information, not a choice", text }`: an advice-shaped question ("should I", "worth", "best",
  "which plan", ...) always gets this fixed information template built from engine fields (no amounts in the text; the client shows the
  estimate's figures with their badges). `label` is ADDITIVE (not yet in `AssistBlock`).
- `{ type: "template", key: "out_of_scope", text }`: clinical or off-topic questions, or nothing survived the guard. Text is `OUT_OF_SCOPE` in
  `assistant_templates.py`. `key: "out_of_scope"` is ADDITIVE (not yet in `AssistBlock`).

Ribbon rules (`templates.py`): `ASSIST_RIBBON_DEMO` = "Demo mode: template answers assembled from the engine's fields, not a live model." when
`mode === "demo"` by configuration (and also for advice_request / out_of_scope / clarify answers even on a live server, since those are templates);
`ASSIST_RIBBON_LIVE_FALLBACK` = "The model did not answer in time; a template answer is shown." when the live call failed or nothing it said
survived the guard (`model` is then absent); `null` when `mode === "live"` and sentences survived. Show the ribbon text as the demo-mode label
of the answer card; `BUILD_FOLLOWUPS.md` item 3 asks the card to say "fixed template" rather than "demo environment" when `intent` is
`advice_request`/`out_of_scope` on a live server (derive it from `intent`).

`tools_used` strings are ids only (no amounts; the tests assert no run of 3+ digits): `get_estimate_line(line {i})`, `explain_step(line {i}, step {j})`,
`get_plan_rules({procedure_key})`, `get_clause({stitch_label})` (e.g. `get_clause(ML26#p25)`), `get_benefits({plan_code})`, `resolve_procedure`.
Facts are always gathered deterministically first, in both modes. Known gap (`BUILD_FOLLOWUPS.md` item 1): the assistant and reminders resolve
`PLANS[code]` only, so an `upload:` scope does not yet answer with UPn stitches.

### 3.2 Uploads: `api/app/uploads.py`

1. `POST /me/documents/upload` (multipart: `file`, `sha256`, `pages`, `text_preview` optional) -> `201 { id, sha256, pages, filename,
   extraction_status: "uploaded", redaction_preview: { text (<= 4000 chars), removed: string[], note }, demo_fixture_match: boolean, mode: "demo" | "live" }`.
   Errors: `413 { error: "file_too_large", max_bytes: 33554432 }`, `415 { error: "not_a_pdf" | "unreadable_pdf" }`, `422 { error: "too_many_pages",
   max_pages: 100 } | { error: "text_preview_too_large", max_chars: 400000 } | { error: "sha256_mismatch" }`. The client computes the SHA-256 and
   page count (pdf.js) before uploading. The stored PDF is readable only through `GET /me/documents/{id}/file` (`Cache-Control: private, no-store`).
2. `PUT /me/documents/{id}/redaction` `{ extra_terms: string[] (<= 20, each <= 64 chars) }` -> `{ redaction_preview }`; `422 { error: "term_too_long", max_chars: 64 }`.
3. `POST /me/documents/{id}/extract` -> `202 { status, mode, model? }`. **`status` is the real current status**: in demo mode the pipeline runs
   synchronously and the response already says `"ready"`, `"demo_no_model"` or `"failed"`; in live mode it says `"queued"` and the client polls.
   `409 { error: "extraction_in_progress", status }` when a run is in a non-terminal state; `409 { error: "not_an_upload" }` for a non-upload document.
4. `GET /me/documents/{id}/extraction` -> `409 { error: "not_extracted" }` **before extract was ever called**; afterwards the status dict:
   `{ status, stage_index, stages: [{ key, label, done }] (7 keys: queued, reading_text, redacting, identifying_fields, matching_rules, verifying_quotes,
   ready), pages, pages_done, quotes_total, quotes_verified, fields: ExtractedField[], reason: string | null, mode, model: string | null,
   structure: { classes, carrier_text, catalog, ignored_wording: [{ page, quote }], unmatched_wording: [{ wording, context }], wording_matches,
   deductible_waived_classes, annual_max_exempt_classes, annual_max_unlimited, ... }, counts: { confirmed, likely, needs_review, not_found } | null,
   demo_fixture_match, notes: string[], notes_dropped, ribbon: string, notes_for_review: { paraphrase, publish, ignored_wording, unmatched_wording },
   undecided_required: string[] }`. Terminal statuses: `ready`, `failed`, `demo_no_model`. Stage labels are the server's `EXTRACTION_STAGE_LABELS`
   (web may show its own UPLOAD copy, but `stages[i].label` is lint-clean and usable). `ribbon` is one of `DEMO_EXTRACTION_RIBBON` (fixture
   checksum matched), `DEMO_NO_MODEL_NOTE` (demo, unknown PDF: fields are `not_found`, hand entry is the path) or `LIVE_EXTRACTION_RIBBON`.
   `structure.ignored_wording` lists sentences addressed to automated readers that were removed from every quote; `structure.unmatched_wording`
   lists wording that matched none of the 16 procedure identifiers. Both must be shown, never acted on.
5. `PUT /me/documents/{id}/review` `{ decisions: ReviewDecision[] (1..400) }` -> `{ fields, counts, undecided_required }`. Requires a terminal status
   (`409 { error: "extraction_not_finished" }`). Per-row 422 errors carry `field_path`: `unknown_field`, `nothing_to_confirm` (confirm needs
   confidence confirmed/likely and a proposed_value), `source_required` (edited rows need a non-empty `source`), `invalid_value` (+ `unit`),
   `unknown_class` (class_of value must be one of `structure.classes[].name`), `candidate_index_out_of_range`. Confirming a `likely` row sets
   `review_status: "user_confirmed"` (never `quote_verified_in_text`); an edited row becomes `USER`; `not_in_document` becomes `UNKNOWN`;
   a `candidate` is re-verified against the page text and becomes `DOC` or stays `AMBIGUOUS`.
6. `POST /me/documents/{id}/publish` -> `201 { plan_ref: "upload:<id>", version_label: "UP1" | "UP2" | ..., published_at, sha256, summary:
   UploadedPlanSummary }`. `409 { error: "extraction_not_finished" }`; **`409 { error: "undecided_fields", fields: string[] }`** listing every
   required row without a decision: `benefit_year_start_month, deductible_individual, annual_max, oon_rule, waiting_months, alternate_benefit`,
   every `classes[i].plan_share_bp_in`, and the group name **`"class_of"`** when no `class_of.*` row has a decision (the class rows are a group:
   at least one must be decided). `422 { error: "plan_invalid", type }` if the engine rejects the built plan. Versions are immutable and
   numbered per owner across all documents (`UP1`, `UP2`, ...); publishing again creates the next label; stored estimates keep their version.
   The `summary` (and every `GET /me/plans` item) has `plan_code: "upload:<id>"`, `document_id`, `version_label`, `published_at`, `has_stored_pdf: true`,
   `versions: ["UP1", ...]`, `banner` (= `UPLOAD_PLAN_BANNER`), `is_fictional` (true when the matched fixture is fictional; keep the ribbon honest).
7. `GET /me/plans` -> `{ items: UploadedPlanSummary[], banner, version_note }` (only documents with a published version).
   `GET /me/plans/{id}?version=UPn` -> `{ summary, model }` (`409 { error: "document_not_published" }` with no version yet; unknown `version` -> 404).
   `GET /me/plans/{id}/versions` -> `{ document_id, items: [{ version_label, published_at, sha256, summary }], note }`.
   `GET /me/plans/{id}/rules?procedure_keys=a,b&version=UPn` -> `{ plan_code, version_label, rules }`.
   `GET /me/plans/{id}/evidence?version=UPn` -> `{ plan_code, version_label, documents, clauses, conflicts, ignored_wording, unmatched_wording,
   notes: { ignored_wording, unmatched_wording } }` (the Documents view shows the two wording lists for uploaded plans).
   `GET /me/plans/{id}/documents?version=UPn` -> `{ plan_code, version_label, documents }`.
   Stitch labels for uploads read `UP1#p6`; `version_label` on an upload's `source_document` is the `UPn` label and `path` is `null`.
8. Benefits and estimates with upload refs: `PUT/GET /me/benefits/upload:<id>` (the client URL-encodes the ref) return `Benefits` with
   `plan_version_label`; `POST /me/estimates { plan_code: "upload:<id>" }` returns `plan_ref`, `plan_version_label`, `plan_version_sha256`, and every
   ledger line carries `treatment_item_id` and `procedure_key`. Nothing transfers between a preset and an upload.
9. Reminders: `GET /me/reminders?as_of=YYYY-MM-DD` -> `{ as_of, items: [{ kind, text, date, cite, source, ... }], note }`; uploaded documents with
   `extraction_status` in `uploaded | ready | demo_no_model | pending_extraction` produce a `document_awaiting_decision` item.

### 3.3 `GET /health`

`{ ok: true, presets: string[], real_presets: string[], fictional_presets: string[], llm_mode: "demo" | "live", llm_model: string | null }`.
`llm_model` is the model id only (never the key) and is `null` in demo mode. Use `llm_mode` to pre-label the upload wizard and the assistant
before the first call; the per-response `mode`/`ribbon` remain authoritative.

### 3.4 Other shapes worth knowing

- `GET /procedures` -> `{ items: Procedure[], note, codes_policy }` (loaded into `useAppData().procedures`).
- `GET /journeys/samples` -> `{ items: [{ id, label, plan_ref, user_ref, stages }], note }`; `POST /journeys { from: "empty" | <sample id> }` seeds the
  fictional sample's records into the caller's space and returns a `JourneyView` with `seeded_records`.
- `Benefits` from `/me/benefits*` is derived: `remaining_deductible_cents` / `remaining_max_cents` are computed from the plan document and the
  entered figures (`derivation` carries the arithmetic sentences), `annual_max_unlimited`, optional `remaining_*_out_cents`, and `conflict`
  when itemized claims disagree with `benefits_used_cents` (show both, choose neither). `BenefitsIn` on the server also accepts
  `coverage_end`, `network_default`, `deductible_met_out_cents`, `benefits_used_out_cents`, `last_updated`, `claims[]`.
- `FOOTER` (information, not advice) and `PRESET_BANNER` / `COMPARISON_BANNER` texts are identical between `api/app/templates.py` and `lib/copy.ts`.

---

## 4. Notes from the foundation agent (verbatim)

- ENVIRONMENT: `cd web && npm install` (node_modules is per worktree). `web/public/fixtures/` is gitignored; copy fixtures before running screenshots: `cp ../fixtures/plans/*.json public/fixtures/plans/ && cp ../fixtures/documents/*.pdf public/fixtures/documents/`. Run the preview as `npx vite preview --port 4173 --host 127.0.0.1` (default binding is IPv6-only here and screenshots.py targets 127.0.0.1). API from the worktree: `cd api && ORALCOMPASS_DEV_AUTH=1 python3 -m uvicorn app.main:app --port 8000`.
- DO NOT run `npx shadcn add --overwrite` casually: the CLI (v4.21) rewrites src/lib/utils.ts to `export { cn } from "cn"`, re-adds the `cn` npm package, and overwrote button.tsx/textarea.tsx/hover-card.tsx during this run; it also downgraded lucide-react to 0.475 and added @hugeicons/*. After any add: restore utils.ts, `npm rm cn`, check lucide-react is ^1.51, re-run the generic patch sweep, run `npm run check:engines`.
- CASCADE: Tailwind layers order is theme < base < components < utilities; all hand-written CSS is inside `@layer components`, so utilities on the same element win. A UA-restoration block at the top of @layer components re-enables paragraph/list margins, list markers, link underlines and inline SVG that preflight resets. The legacy global pill rule `button:not(...)` now also excludes `[data-slot]` (every shadcn primitive) and `.unstyled` — give any vendored/hand-written <button> the class `unstyled` or it will be painted ink with a 999px radius.
- TOKENS: the :root block in styles.css is the only colour source. Spec §5.1 semantic aliases are added (--bg, --surface, --text, --border, --accent=gold, --select, --you-pay, --plan-pays, --basis, --nobody, --owner-*, --fog, --focus, --s-*, --r-*, --shadow-1..3, --dur-*, --ease-*). Two naming conflicts resolved: existing `--muted` is a TEXT colour, shadcn's muted surface is `--muted-bg` (=parchment); spec reserves `--accent` for gold, so shadcn's hover/accent surface is `--accent-surface` (=sand) and `bg-accent` compiles to sand, `text-accent`-style gold must use `text-gold`. Palette utilities available: bg/text/border/stroke/fill-{paper,paper-deep,parchment,ink,ink-soft,ink-muted,sea,sea-light,sea-ink,sage,sage-light,forest,sand,gold,gold-soft,terracotta,wood,rule,ok,warn,danger,you-pay,plan-pays,basis,nobody}; radius tokens radius-sm/md/lg/xl/2xl/3xl/4xl; shadows shadow-paper, shadow-1/2/3; `font-serif`/`font-heading` = --serif, `font-sans` = --sans.
- GREP CAVEAT: the plan's acceptance pattern `slate-` matches Tailwind `translate-*` utilities; verify with `\<slate-`. Header comments must not spell out old class names (`dark:`, `neutral-950`, `sparkle`) or naive greps hit them.
- RESTYLED PRIMITIVES: Button has `size="touch"` (min-h-11 px-4 text-base) and `size="icon-touch"` (44x44). Badge exports `evidenceVariant` (DOC->doc, USER->user, ASSUMED->assumed, AMBIGUOUS->ambiguous, UNKNOWN->unknown, CONFLICT->conflict) plus `numeric`; always render icon + word. Drawer: overlay bg-ink/40 (no blur), content bg-paper-deep max-h-[85dvh], the grab handle is a 44 px <button> with `handleLabel` prop. Dialog: `closeLabel` prop, 44x44 close, fade + slide-in-from-bottom-2, DialogFooter `closeLabel`. Tabs: line variant list h-11, gold after-underline; App.tsx hides it (`after:hidden`) and renders the moving `motion.span layoutId="nav-underline"`. Tooltip: ink/paper, delay 300. Popover: w-[min(92vw,22rem)] bg-paper-deep, PopoverTitle is an h3. Progress: h-2 sand track, sea -> forest at 100, `indicatorClassName`. Table: `containerClassName` prop. z-index: overlays/drawer/dialog z-40, popover/tooltip z-50 (ClauseCard is z-20, .detail.sheet z-15 in CSS).
- VENDORED PATCHES THAT CHANGE PROPS: Stepper has a controlled `step` prop, `stepLabel(n)`, `backButtonText/nextButtonText/completeButtonText` with NO defaults (buttons render only when text is passed), default indicators are <button aria-current="step"> 44 px, connectors are <li aria-hidden>. StatusMark defaults doneColor forest / errorColor terracotta / strike false. HoldButton defaults sand/forest/ink/paper, holdTime 900, wave/glow false, children and doneLabel default to '' (pass copy). RubberSegment defaults sand/ink/paper, draggable false, `aria-label` has no default (pass one). ThoughtLine: glyph type is 'dot' | 'none' | ReactNode (no AI glyph), lucide icons, shimmer false, label/doneLabel default '' (pass ASSIST copy). ai-prompt (default export AI_Prompt): props { scopes, scope, onScopeChange, placeholder, sendLabel (required), scopeLabel, describedBy, disabled, onSubmit(value, scope) } — model picker/logos/header gone, send icon is lucide Compass. file-upload (default export FileUpload): the upload is controlled — { onFileSelected(file), status: 'idle'|'uploading', progress, currentFile, onCancel, labels: {title, hint, choose, cancel, limits?, tooLarge?, wrongType?} (required), acceptedFileTypes default ['application/pdf'], maxFileSize default 32 MB }; validation errors are persistent; exports formatBytes. ai-text-loading: { texts, index } controlled, no interval. Timeline (Aceternity): { data, current?, ariaLabel? } renders <ol>/<li aria-current="step">; demo heading removed. Animated timeline (Animata): `activeIndex` controlled prop, `aria-label`, <ol>/<li>. svg-ripple-effect: { rings<=6, transition {duration .45, repeat 0}, className } one-shot, aria-hidden. animated-beam defaults ink path / sea->gold / repeat 1 / duration .9 and renders only the static path under reduced motion. highlighter defaults underline / terracotta / 1.2 / 1 iteration, `animate: !reduce`; it is NOT imported anywhere yet — import it with React.lazy so rough-notation stays out of the main chunk. gauge/donut/ring charts: defaults text-sea / text-ink/10, reduced motion skips the 250 ms delay. tracing-beam: y1=0/y2=height under reduced motion. Motion Primitives Dialog lives at '@/components/motion-primitives/dialog' (DialogClose takes aria-label).
- HAND-WRITTEN VENDOR: DrawOutlineButton { selected, ...button props } (`.unstyled`, 44 px, focus-visible twins); InkLoop { active, d, stroke, strokeWidth, duration } draws a gold pathLength loop once in view; CompassLoader { progress?: 0..1, label (required), size } — progress turns the needle once per stage via a Motion spring, indeterminate mode runs the 2 s ring sweep; seigaiha.css exposes `.oc-seigaiha` with --c1/--c2/--s and `.oc-seigaiha-layer.motion-drift`.
- FOUNDATION WRAPPERS: <Money cents evidence(required) badge? signed? /> renders NumberFlow (currency, tabular ink, built-in reduced motion) + EvidenceBadge sibling; null -> '—'. <StageLoader label(required) stageIndex? stages? size? /> = CompassLoader + label + Progress; it replaced the `.spinner` in App.tsx (the `.processing` paragraph now wraps it). <ViewSwitch index direction?>{children[]}</ViewSwitch> wraps Motion Primitives TransitionPanel with min-h-[40vh] (vertical wash-in by default; pass `direction` for wizard panes, ±12 px). <ArtPlate slot x y w h fallback /> is an SVG <image> webp -> png -> fallback; fog/chest slots are lazy. <Sheet open onOpenChange title originRect? returnFocus? closeLabel='Close details'> is the vaul-based phone bottom sheet (72vh / 85dvh, 44 px handle, 44x44 close, sticky 48 px title bar); the spec said Radix Dialog, the task said vaul — built on vaul (which is Radix Dialog underneath). `useMobile()` (hooks/useMobile.ts) uses the app's 760 px breakpoint; shadcn's `useIsMobile()` (hooks/use-mobile.ts) uses 768 and is only for vendored code.
- useAppData RETURN SHAPE (deviation): exactly the listed keys PLUS `plans: PlanSummary[]` — PlanView/CompareView/DocumentsView/PlanSelector cannot render a plan picker without the catalog, and the spec's PlanSelector takes `plans`. `plan` is the PlanFixture (model); the matching summary is `plans.find(p => p.plan_code === planRef)`; `benefits` is the whole Benefits[] (per-plan lookup at the call site); `setView(v)` also follows the journey's plan_ref; `reestimate()` bumps a tick that re-runs the plan/rules/evidence/estimate effect; `procedures` is loaded from GET /procedures (new fetch, previously absent). useJourneySelection(view) returns { selection: {stage?, island?}, selectStage(sel, fromEl?), selectIsland(sel, fromEl?), clear() (restores focus), returnFocusRef }; it selects the current care stage whenever view.id changes (the previous App behaviour). App.tsx (74 lines) keeps tab, landmark and stitch state; the Map-view/Overview-list toggle is now local to JourneyView (it resets when you leave the tab; previously it persisted). Journey view props: { data, selection, mobile, onOpenLandmark, onOpenDocuments }; Plan view props: { data, mobile, landmark, onLandmark, stitch, onStitch, onOpenDocuments }.
- NAV: App renders <Tabs value onValueChange className="app"> with the TabsList inside <nav class="topnav"> and ONE <TabsContent value={tab} forceMount asChild><main class="view ..."> wrapping the ViewSwitch so a matching tabpanel always exists. Triggers are role=tab (Radix roving tabindex: only the active tab is in the Tab order), keep the names 'My journey' / 'My plan' / 'Compare' / 'Documents' and carry aria-current="page" when active. The `.topnav button {...!important}` CSS and the `.view > * { animation: rise }` rule are gone; `rise` keyframes remain for `.detail`.
- API CONTRACT: planByRef/rulesByRef/evidenceByRef route upload refs to /me/plans/{id}[/rules|/evidence]; the API in this worktree is unchanged (those routes, /me/documents/upload, /me/assistant and health.llm_mode come from the API branch being merged) — preset refs behave exactly as before. `ApiError` now exposes `.body` (e.g. the 409 undecided_fields payload). BenefitsIn is declared in api.ts.
- COPY: all vendored default strings were removed or made props; every new string must live in lib/copy.ts or the owner's namespace file (lib/copy/{passage,plan,upload,assistant}.ts) and pass `python3 ../tools/advice_lint.py src/lib` (lint the directory, it now has several files). One new UI string was added: UI.renderingDocument (StageLoader label for the lazy PageView).
- LICENCES: every vendored file has a header comment (origin, author, licence, install date, patches, reduced-motion guard) and a row in web/THIRD_PARTY_NOTICES.md; add a row for anything new. Aceternity (timeline, tracing-beam) and Hover.dev techniques are end-product-only licences (not redistributable as a kit) — flagged in web/public/art/LICENSE.md.
- BUNDLE: `npm run check:bundle` also fails if no pdfjs-* chunk exists. Budget headroom: main 88.2 KB of 350 KB gzip; motion chunk 46 KB; CSS 24.5 KB of 60 KB. Keep pdf.js, rough-notation, the upload wizard and the assistant behind React.lazy with a StageLoader fallback that has a real label.

(The merge note in "API CONTRACT" is now resolved: the API routes it refers to are in this tree.)

---

## 5. Open issues carried from the foundation (and from the merge)

1. `useAppData` returns one extra key (`plans`) beyond the spec's "exactly" list; everything else matches the specified names.
2. Motion Primitives `dialog` is at `components/motion-primitives/dialog.tsx` (+ `usePreventScroll.tsx`), not `components/ui/`, because of the
   name collision with the shadcn `dialog.tsx`.
3. `Primitives/Sheet.tsx` is built on the shadcn Drawer (vaul); the design spec section 6 describes a Radix Dialog wrapper. vaul wraps Radix Dialog,
   so role/aria/focus semantics match, but the snap/drag behaviour is vaul's.
4. The Map view / Overview list toggle moved into `JourneyView` and resets when the tab changes (previously App state). Restore to App state if
   persistence is wanted; all 44 checks pass either way.
5. The plan's acceptance grep `slate-` false-positives on Tailwind `translate-*` (dialog, button, switch, tooltip); use `\<slate-`.
6. `tools/screenshots.py` was edited (4 lines): nav clicks use `get_by_role('tab', ...)`. Any other script that located the nav via role=button must do the same.
7. vitest is pinned to `^3` (vitest 5 requires vite >= 6; the project is on vite 5.4). Upgrading vite is a separate decision.
8. `web/public/fixtures/` is gitignored and populated locally; `shots/*` output is untracked.
9. `styles.css` still lists `.view > *` in the prefers-reduced-motion selector list (harmless; the rule it referenced is gone).
10. Kokonut `file-upload` and `ai-prompt` were substantially rewritten (controlled upload, scope selector, no logos); their props differ from the
    upstream docs. Read the header comments before using them.
11. Type gaps versus the API (additive; section 2.3): `AssistResponse.ribbon`, `AssistBlock` template `key: "out_of_scope"` and `label`,
    the wider extraction status, `health().llm_model` nullable, `api.extract()` returning `{ status, mode, model? }`.
12. `App.tsx` does not yet pass `uploadSlot` to `DocumentsView` or `askSlot` to `ClauseCard`; the integrating agent wires the stubs in.
13. API follow-ups that affect web behaviour are tracked in `docs/BUILD_FOLLOWUPS.md` (upload refs in the assistant and reminders; the
    "fixed template" label in live mode; `/me/export` and push subscriptions).
