# codeLinc 11 — judging criteria (as published; read by every review, docs and presentation agent)

1. **User Interface & Intuitiveness** — cohesive, logical UI/UX; easy for the target user to navigate and administer.
2. **Functional Requirements & Impact** — functionally addresses the challenge; solves a real problem.
3. **Solution Design & Innovation** — innovative or creative approach.
4. **Demonstration and Presentation** — delivered clearly, effectively, positively; demo/screenshots clearly depict the functionality developed.
5. **Does it Work?** — all or part of the application works; would the organization use it? *Significantly more weight on core functionality than on
   supporting items such as login/registration/password reset.*
6. **Technology Platform(s) Employed** — novel platforms, libraries, open source, APIs.
7. **Security Accommodations** — no value in building login/password from scratch; **describe** how the application accommodates user security via
   publicly available mechanisms or other means.
8. **Technical Creativity** — novel approach or innovative solution to the challenge.
9. **Architecture & Methodology** — presentation touches on architecture; storyboarding or other roadmapping was employed.
10. **Complexity** — not more complex than necessary, but not overly simplistic; does not gloss over or omit accommodations for the functionality presented.

## How OralCompass maps to the criteria (keep this current)
| # | Where the evidence lives |
|---|---|
| 1 | The Passage map as the information architecture; Answers log; four-tab navigation; keyboard model (`docs/ORALCOMPASS_DESIGN_SPEC.md` §2, §9) |
| 2 | Real public plan presets with cited clauses; deterministic engine; upload → review → publish; demo numbers in `CLAUDE.md` rule 8 |
| 3 | Procedure islands + insurance checkpoints = the engine's ledger steps; soundings; fog for uncertainty; stitches to clauses |
| 4 | `docs/ORALCOMPASS_DESIGN_SPEC.md` §11 demo script; `tools/screenshots.py` desktop + phone captures; README walkthrough |
| 5 | Engine/API/web test suites; screenshot walk; demo mode with no external dependency |
| 6 | FastAPI + stdlib engine; React 18 + Vite + Tailwind v4 + shadcn (Radix) + Motion + the vendored component ecosystem; OpenRouter (Claude Haiku 4.5) for extraction/explanations; pdf.js; Web Push (VAPID) |
| 7 | Owner-scoped reads with constant 404, ids-only audit, redaction before any model call, document text as data, GET-only presets, dev auth vs Cognito JWT path, secrets in env only; claims limited to what is implemented (`docs/ORALCOMPASS_DATA_MODEL.md` security section, `infra/README.md`) |
| 8 | AI extracts and quotes only; server verifies every quote against the PDF text layer; the assistant can only reference engine amounts; information-only linter at build and run time |
| 9 | Architecture map in `docs/MASTER_BUILD_PROMPT_V2.md` §0; design panel → binding spec → addendum; component plan; roadmap docs; storyboard = demo script |
| 10 | 16 fixed procedure keys, one engine, one animation engine, bundle budget; nothing invented where the document is silent |
