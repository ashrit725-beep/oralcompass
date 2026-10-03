# ORALCOMPASS — MASTER BUILD PROMPT (v2, received 2026-10-03)

This is the product owner's build brief for turning the existing repository into the strongest possible OralCompass. It is the
governing specification for the current build. Where it conflicts with older docs, this prompt wins; where it conflicts with the
non-negotiable rules in `CLAUDE.md` (information only, evidence on every number, deterministic money, fixed identifiers,
published ≠ personal, nothing transfers between plans, security as architecture, one set of demo numbers, synthetic people only),
the stricter rule wins.

Roles: principal product engineer, UI/UX director, data architect, security engineer, product researcher. The job is NOT a quick
hackathon prototype. The finished product should feel like a real venture-backed consumer healthcare/insurance product that happens
to have an unusually beautiful visual identity.

## 0. Absolute first rule
Do not start coding before inspecting the entire repository: every relevant file, all markdown, research, prompts/specifications,
frontend, backend, schema, package.json, config (without exposing secrets), APIs, insurance data, procedure data, calculations,
tests, current UI, reusable components; search for TODOs, placeholders, mocked data, hardcoded assumptions, incomplete routes.

Architecture map:
```
USER → Dental Plan / Uploaded Plan → Plan Extraction + Structured Benefits → Procedure / Treatment Plan → Coverage Rules Engine
→ Cost Calculation Engine → Explanation / Evidence Engine → OralCompass Journey → Informational UI
```
Do not rewrite working systems unnecessarily. Preserve good existing functionality. Improve weak systems deliberately.

## 1. The product
OralCompass helps a patient understand how their dental insurance plan applies to their dentist's treatment plan. Dental insurance
documents contain deductibles, annual maximums, coinsurance, waiting periods, frequency limits, exclusions, downgrades, alternate
benefits, network rules, procedure classifications, coverage percentages, age restrictions, benefit-year rules, replacement rules,
missing-tooth clauses, coordination rules, legal language. Patients cannot determine how those rules affect a specific procedure.
OralCompass turns this complexity into a visual, source-backed journey that answers: "What parts of my dental plan affect this
procedure, and how did those rules lead to this estimated cost?" It must NOT answer "Should I get this procedure?" It is an
insurance-understanding and cost-explanation tool, not a medical decision-making system.

## 2. Core differentiator — THE ORALCOMPASS JOURNEY
Not a generic AI insurance chatbot, not a PDF summarizer, not a boring benefits dashboard. Imagine a hand-painted nautical map.
Each treatment/procedure becomes an island or destination. The patient's treatment plan becomes a journey across the map.
Important insurance rules become checkpoints along the route:
```
START → Procedure Island → Allowed Amount Reef → Deductible Crossing → Coinsurance Strait → Downgrade Point → Annual Maximum Gate → Estimated Patient Cost
```
Every point must correspond to REAL structured data. The map is not decorative. The map is the actual information architecture.

## 3. Treatment journey
Each procedure has its own island (e.g., Exam Cove, Cleaning Bay, Filling Island, Crown Cliffs, Root Canal Caverns, Extraction
Harbor, Implant Isle, Recovery Lighthouse — names can be improved; not childish). Visual tone: painterly, sophisticated, warm,
elegant, exploratory, tactile, premium, calm. Museum-quality illustrated map × modern fintech product × healthcare clarity.
NOT a pirate game, NOT a children's app, NOT Disney imitation, NOT generic fantasy UI.

## 4. Procedure checkpoints
Each procedure journey exposes the relevant insurance checkpoints:
- **Procedure**: name, identifier/code, tooth/surface, proposed date, dentist-entered price, category.
- **Plan allowance**: dentist fee, plan-recognized/allowed amount if known, network impact, fee limitation.
- **Deductible**: amount, already satisfied, remaining, whether this procedure/category is subject to it.
- **Coverage share**: plan percentage, estimated patient share, classification.
- **Annual maximum**: total, used, remaining, amount potentially consumed by this procedure.
- **Frequency limit**: the rule ("Your plan lists this service as eligible once every 24 months."). Never "You should wait."
- **Waiting period**: the contract rule only.
- **Downgrade / alternate benefit**: the language, how it changes the calculation, evidence/source.
- **Exclusions**: relevant exclusions.
- **Final cost**: estimated patient responsibility, expandable "How was this calculated?" showing each mathematical step.

## 5. The dollar pipeline
A dedicated visual calculation system: Dentist fee → Plan-recognized amount → Deductible → Eligible amount → Plan share →
Estimated insurance payment → Estimated patient responsibility. Example figures are examples only; never hardcoded. The pipeline
reflects the rules that truly apply; every change is traceable to structured plan data, procedure data, the applicable rule, and
the original source clause where available.

## 6. Evidence-first explanations
Every important interpretation has: Plain English ("Your plan covers this category at 50% after the deductible."), Impact ("This
rule contributes approximately $___ to your estimated cost."), Source ("View plan language" → the original clause). Never hide
uncertainty: "This rule could not be determined from the available plan information." / "The plan language appears ambiguous.
The estimate below excludes this rule." Never fabricate insurance terms. Never silently guess.

## 7. Real data, not fake demo data
Study the existing data and identifiers (what they represent, taxonomy, source, schema, completeness, normalization, relationship
to benefits). Do not replace real data with mock data. For missing reference information, research authoritative sources (official
insurer plan documentation, government/regulatory sources, recognized dental coding/documentation, carrier documentation,
professional sources — not random blogs). Document provenance. Never pretend a plan rule applies universally.

## 8. Two plan input modes
- **Mode A — preset/structured plan**: user selects an available plan (carrier → plan → state/market → plan year, based on real data).
- **Mode B — user plan**: user provides plan documentation; the system extracts structured benefit information; the user inspects
  what was extracted. Never silently transform uncertain document text into definitive facts. Confidence states:
  `Confirmed · Likely · Needs Review · Not Found`.

## 9. Plan data model (minimum)
Plan, Carrier, Plan Version, Effective Period, Network, Deductible (individual/family), Annual Maximum, Preventive/Basic/Major/
Orthodontic Coverage, Waiting Period, Frequency Limit, Age Limit, Downgrade Rule, Alternate Benefit, Exclusion, Network Rule,
Procedure Rule, Benefit Category, Source Clause, Source Document, Confidence. Use the existing architecture where it is better.

## 10. Procedure data model
procedure_id, procedure_code, name, category, description, tooth, surface, estimated_fee, provider_fee, allowed_amount,
proposed_date, benefit_category, rule_matches, calculation, sources. Use the project's actual IDs and schemas; do not invent
replacement IDs.

## 11. Calculation engine
Deterministic, testable, inspectable, modular, explainable. Not buried in React components. Returns numbers AND reasoning:
dentistFee, allowedAmount, deductibleApplied, eligibleAmount, planPercentage, insuranceEstimate, patientEstimate,
annualMaximumImpact, appliedRules, warnings, evidence (reflecting the existing architecture).

## 12. AI must not control the math
AI may parse documents, classify clauses, explain legal wording, translate terminology, identify relevant clauses. AI must NOT
invent numerical outputs. AI → structured interpretation; deterministic rules engine → calculation. This separation is essential.

## 13. Informational, not medical advice
Never: "You should get…", "You don't need…", "Choose procedure A.", "Skip B.", "Wait to receive treatment.", "The best treatment
is…". Allowed: "Your plan document indicates…", "Under the information currently available…", "The estimated patient
responsibility is…", "This procedure appears in the plan's major-services category.", "Coverage may depend on…".

## 14. Visual design system — what NOT to build
No white background + purple gradient + huge centered heading + three cards + AI sparkle icon. No generic AI SaaS design,
startup-template slop, unnecessary gradients, excessive glassmorphism, random floating cards, oversized empty hero, meaningless
animated particles, emoji-based final UI, repetitive pill components, excessive rounded rectangles, generic "AI assistant" sidebar
unless genuinely useful.

## 15. Art direction
Palette: parchment, aged ivory, muted sea blue, ink, warm sand, weathered green, occasional muted gold, dark brown/charcoal
typography. Not everything brown. Excellent contrast and accessibility. Typography: expressive display typeface sparingly; body
highly readable; hierarchy over decorative boxes. Textures extremely subtle. Still modern.

## 16. Map interaction
Procedural islands, routes, checkpoint markers, progress markers, subtle painted ocean movement, hover/focus states, selected
procedure state, cost indicators, contextual explanations, route animation, accessible non-map fallback. Clicking an island opens
the procedure breakdown. Desktop expansive; mobile transforms intelligently rather than shrinking the map.

## 17. Dashboard structure (candidate, not mandatory)
Journey · Treatment Plan · My Coverage · Benefits · Plan Explorer · Cost Breakdown · Documents. Test what produces the simplest
mental model. The home screen answers immediately: Where am I in my treatment journey? What procedures are included? What will each
likely cost? Which insurance rules affect those costs? Where did those rules come from?

## 18. Benefits compass
A visually distinct summary of the user's benefits (deductible, deductible remaining, annual maximum, remaining maximum, coverage
category percentages, major restrictions). Do not sacrifice usability for metaphor.

## 19. Notifications (lowest priority)
Benefit year approaching reset, known plan deadline, frequency restriction reaching eligibility, submitted document needing
attention, estimate changed. Informational only ("Your current benefit year ends December 31. Your plan information indicates
that unused annual benefits may not carry forward."), never "Use your benefits before you lose them!".

## 20. Privacy & security
Treat plan documents and treatment information as sensitive. Audit authentication, authorization, database policies, row-level
isolation, API access, file storage, document upload, logs, analytics, error reporting, secret handling, caching, client-side
persistence. Secure defaults: encryption in transit, secure storage, least privilege, user-level authorization, secure file URLs,
private storage, input validation, upload validation, rate limiting, CSRF/XSS protections, dependency auditing, secret isolation,
no sensitive data in analytics or console logs. Never claim certifications ("HIPAA certified", "SOC 2 certified") — describe
actual technical protections.

## 21. Accessibility
Keyboard navigation, visible focus, contrast, semantic HTML, accessible forms, reduced motion, screen-reader labels, accessible
alternatives to graphical routes, mobile touch targets. The map cannot be the only way to access information.

## 22. Mobile
A dedicated interaction model (journey overview → illustrated route → procedure card → checkpoint timeline → cost breakdown),
not desktop squeezed to 390 px. Preserve the identity.

## 23. Images / art assets required (reusable environmental art, no UI screenshots)
1. **Primary world map** — large painterly nautical map backdrop: aged parchment, hand-painted coastline, subtle ocean, elegant
   cartography, open regions for React islands and UI, no labels/text/procedure names/UI cards/logos, minimal clutter, 16:9 or wider.
2. **General procedure island** — reusable painted island, transparent background, no text.
3. **Major procedure / mountain island** — dramatic (cliffs, elevated terrain, subtle structures), medically neutral, transparent.
4. **Recovery / lighthouse island** — calm final destination (lighthouse or harbor), no text.
5. **OralCompass emblem** — compass/navigation idea + extremely subtle dental reference; no cartoon teeth, no clip-art compass;
   works as app mark, favicon, loading indicator, map marker; SVG-like simplicity.
6. **Benefits chest / vault** — small painterly object (antique navigational case / secure benefits chest, not pirate treasure), transparent.
7. (optional) **Cloud / fog layers** — translucent painted atmosphere for depth/parallax.
8. (optional) **Parchment / ink texture** — seamless, subtle, must not hurt readability.

## 24. Keep these as code (never baked into artwork)
Procedure names, percentages, costs, route lines, checkpoints, deductible values, annual maximum, buttons, labels, tooltips,
progress, charts, benefit values, navigation, alerts.

## 25–34. Tooling
Everything Claude Code (ECC) is installed; use relevant capabilities. Before any third-party install: verify the repository, read
install docs, check ownership, compatibility, avoid duplicates, no blind scripts. Anti-slop: `Leonxlnx/taste-skill`, unslop,
no-ai-slop, stop-slop principles → run a dedicated slop audit after the interface is built (Does it look generated? Repetitive
sections? Cards overused? Decorative gradients? Generic animations? Weak typography? Intentional whitespace? Does every element
support the concept? Could the screen belong to 100 other SaaS products? If yes, redesign). 21st.dev as a discovery registry (fit
over impressiveness). shadcn as accessible primitives where appropriate, heavily customized (never stock). Aceternity / Magic UI /
React Bits / Kokonut / Animata: only components whose behavior improves map exploration, storytelling, transitions, treatment
progression, hierarchy — no flashy landing page, no showcase. Motion (motiondivision) and MotionSpec: motion must communicate
causality (route progresses deductible → coverage → annual maximum; selected island comes into focus; numbers animate as the
pipeline changes). Bad: random particles, bouncing cards, every heading fading upward.

## 35. Library rule
"Use everything" means use the ecosystem as a design and engineering resource, not one component from every library. A perfect UI
may use shadcn primitives, custom components, one Aceternity interaction, one Magic UI interaction, Motion for transitions, custom
map components. Coherence beats component count.

## 36. Design system first
Tokens: background, surface, parchment, ink, sea, sand, accent, success, warning, danger, muted, border. Typography: display,
heading, body, label, numeric, caption. Spacing scale. Radius (not everything 24 px). Shadows subtle and purposeful. Motion
durations/easings defined centrally: micro, standard, journey, page.

## 37. Reusable domain components (naming is the builder's choice; no 1,500-line monoliths)
OralCompassMap, JourneyRoute, JourneyIsland, ProcedureIsland, InsuranceCheckpoint, CostPipeline, PlanClause, ClauseEvidence,
BenefitsCompass, CoverageMeter, AnnualMaximumGauge, DeductibleTracker, ProcedureDrawer, ProcedureTimeline, SourceBadge,
ConfidenceIndicator, PlanDocumentViewer, PlanSelector, PlanUpload, TreatmentPlanImporter, CostSummary, CalculationExplanation.

## 38–40. States
Loading: stages that correspond to real processing ("Reading plan… Identifying benefit categories… Matching procedure rules…
Building your coverage map…"); subtle cartographic drawing; reduced motion gets static progress. Empty states for: no plan, no
treatment, no documents, rule unavailable, unsupported procedure, incomplete extraction, calculation unavailable, network status
unknown — never silently `$0`. Errors are actionable (affected calculation, what is missing, inspect source, enter/correct the
field when appropriate).

## 41. Research mode
Distinguish verified external reference data, plan-specific data, inferred data, user-provided data, demo/test data. Document
sources. Do not contaminate production data with invented examples.

## 42. Testing
Rules engine: deductible applies / does not apply, annual maximum reached / partially remaining, percentage coverage, waiting
period, frequency limit, exclusion, downgrade, unknown rule, conflicting information. Cost engine arithmetic across combinations.
Security: authorization boundaries. UI critical flows: select plan, upload plan, add procedure, view journey, open island, view
calculation, view clause evidence.

## 43. Demo mode
Flawless without unpredictable external systems; seeded demo from clearly identified fixtures; under five minutes: meet the patient
+ treatment plan → confusing document → OralCompass structures the plan → map appears → open island → follow the dollar pipeline
→ hidden clause/checkpoint → source evidence → overall benefit impact → complete journey.

## 44. Performance
Bundle size, image loading, client components, animation libraries, re-renders, map rendering, mobile. Optimize artwork (modern
formats, lazy-load secondary art). Never sacrifice performance for decorative motion.

## 45. Quality bar — four tests per page
Comprehension (understood within five seconds) · Trust (source visible) · Differentiation (uniquely OralCompass) · Restraint
(nothing added just because a library offered it).

## 46. Build order
1 repository study · 2 gap analysis · 3 data model · 4 rules engine · 5 core flow (plan → procedure → rules → estimate) · 6 design
system · 7 OralCompass map · 8 supporting pages · 9 animation · 10 security pass · 11 accessibility pass · 12 anti-slop pass ·
13 testing (lint, type check, unit, integration, build) · 14 demo pass.

## 47–48. Do not stop at "it builds"
Navigate every screen: clipping, overflow, ugly responsive states, strange loading, inconsistent spacing, broken routes, empty
components, missing states, fake data, placeholder copy, inconsistent colors, inaccessible controls, gimmicky animations,
incorrect calculations, unexplained numbers. Final audit against 100 teams: recognizable identity without the logo; the map helps
comprehension; claims verifiable; nothing generic-AI-SaaS; nothing impressive-but-useless; technical depth exposed; feels complete.

## 49. Priority order when forced to choose
1 Correctness · 2 Understandability · 3 Real plan/procedure data · 4 Explainable calculations · 5 User trust · 6 Privacy/security ·
7 Distinctive UX · 8 Accessibility · 9 Visual polish · 10 Animation · 11 Notifications.

## 50. Definition of done
A user can: select/enter their plan; enter/import their treatment plan; see procedures as a journey; open each procedure;
understand exactly which plan rules apply; see a projected cost; see exactly how it was calculated; inspect source plan language;
understand deductible/annual-maximum impact; distinguish known information from uncertainty; navigate easily on desktop and
mobile; use the core application accessibly; trust that the product explains information rather than giving medical advice.
A judge remembers "the dental-insurance app with the interactive treatment map", not "another AI insurance summarizer".

## Final instruction
Take ownership. Study deeply, research uncertainties, protect what works, fix weak architecture, build the real calculation/data
foundation, then an exceptional interface on top. Not allowed: invent plan data, invent calculations, hide uncertainty, give
medical advice, claim security certifications, replace real functionality with mockups, degrade accessibility for aesthetics,
leave the product looking like generic AI-generated UI. Build as if going to production after the hackathon.

## Addendum (owner, 2026-10-03): model provider
Live AI calls (document extraction, grounded explanations) go through OpenRouter with a fast model — default
`anthropic/claude-haiku-4.5` — configured only by environment variables (`api/.env`, gitignored; `api/.env.example` documents the
keys). The product must run fully in demo mode with no key. Everything Claude Code tooling and the installed skills (anti-slop, UI/UX,
motion, component libraries) are to be used as a design and engineering resource during the build.
