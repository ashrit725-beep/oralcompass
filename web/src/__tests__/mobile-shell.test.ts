import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fieldHidden, isKeyboardOpen, keyboardInset, shouldFocusHeading } from "@/lib/shell";

/** Owner direction 2026-10-04 ("its fully a mobile app"): the phone layout is the only layout. */
const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const sheets = ["../styles.css", ...readdirSync(new URL("../styles/", import.meta.url)).filter((f) => f.endsWith(".css")).map((f) => `../styles/${f}`)];

describe("mobile-only shell: no desktop branch is left", () => {
  it("no stylesheet keeps a desktop or phone-width media query (the phone rules always apply)", () => {
    for (const f of sheets) {
      const queries = [...src(f).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/@media\s+([^{]+)\{/g)].map((m) => m[1].trim());
      // allowed: reduced motion, hover/pointer capability, short landscape, the 400 px narrow-phone step, and the wide-window stage (481 px)
      for (const q of queries) expect(q, `${f}: @media ${q}`).toMatch(/^(\(prefers-reduced-motion: (reduce|no-preference)\)|\(max-height: 500px\) and \(orientation: landscape\)|\(max-width: 400px\)|\(min-width: 481px\)|\(hover: hover\)( and \(pointer: fine\))?)$/);
    }
  });
  it("Tailwind breakpoints are pinned out of reach, so sm:/md: variants never match and max-md: always does", () => {
    const css = src("../styles.css");
    for (const bp of ["sm", "md", "lg", "xl", "2xl"]) expect(css).toMatch(new RegExp(`--breakpoint-${bp}: 100\\drem`));
  });
  it("the app renders the dock at every width and never asks for the window width", () => {
    const app = src("../App.tsx");
    expect(app).not.toMatch(/useMobile|matchMedia|innerWidth/);
    expect(app).toMatch(/<Dock aria-label=\{UI\.viewsLabel\}/);
    expect(app).toMatch(/className="cinema" aria-hidden="true"/);
    for (const tab of ["journey", "plan", "compare", "documents"]) expect(app).toContain(`data-view="${tab}"`);
  });
  it("useMobile is pinned to the phone branch", async () => {
    const { useMobile } = await import("@/hooks/useMobile");
    expect(useMobile()).toBe(true);
  });
  it("the cinema and the column: a fixed painted stage behind a 480 px app column on wide windows, nothing blurred", () => {
    const css = src("../styles.css");
    expect(css).toMatch(/--col: 480px/);
    expect(css).toMatch(/\.app \{[^}]*max-width: var\(--col\)/);
    expect(css).toMatch(/@media \(min-width: 481px\) \{[\s\S]*\.cinema \{[^}]*position: fixed[^}]*journey-backdrop\.webp/);
    expect(css).not.toMatch(/\.cinema[^{]*\{[^}]*(blur|backdrop-filter)/);
    // fixed and portalled layers stay inside the column
    expect(css).toMatch(/\.dock \{[^}]*margin-inline: auto; max-width: var\(--col\)/);
    expect(css).toMatch(/\[data-slot="drawer-content"\]\[data-vaul-drawer-direction="bottom"\] \{ margin-inline: auto; max-width: var\(--col\); \}/);
  });
  it("native-app meta: cover viewport, standalone capable, touch icon, theme colour, no auto-linked numbers", () => {
    const html = src("../../index.html");
    expect(html).toMatch(/viewport-fit=cover/);
    expect(html).toMatch(/apple-mobile-web-app-capable/);
    expect(html).toMatch(/apple-mobile-web-app-status-bar-style/);
    expect(html).toMatch(/apple-touch-icon/);
    expect(html).toMatch(/name="theme-color"/);
    expect(html).toMatch(/format-detection" content="telephone=no/);
    expect(JSON.parse(src("../../public/manifest.webmanifest")).display).toBe("standalone");
  });
});

describe("keyboard inset (the on-screen keyboard never covers a field)", () => {
  it("measures the layout viewport hidden under the keyboard", () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336);
    expect(keyboardInset(844, { height: 508, offsetTop: 20 })).toBe(316);
    expect(keyboardInset(844, null)).toBe(0);
    expect(keyboardInset(800, { height: 820, offsetTop: 0 })).toBe(0);   // never negative
  });
  it("a collapsing toolbar is not a keyboard", () => {
    expect(isKeyboardOpen(80)).toBe(false);
    expect(isKeyboardOpen(300)).toBe(true);
  });
  it("a field under the keyboard (or above the visible area) needs revealing", () => {
    const vv = { height: 500, offsetTop: 0 };
    expect(fieldHidden({ top: 200, bottom: 244 }, vv)).toBe(false);
    expect(fieldHidden({ top: 470, bottom: 514 }, vv)).toBe(true);
    expect(fieldHidden({ top: 4, bottom: 48 }, vv)).toBe(true);
  });
});

describe("tab change focus (orchestrator note 19a)", () => {
  it("a tap on the dock moves focus to the new panel's heading", () => {
    expect(shouldFocusHeading({ viaDockPointer: true, focusLost: false, dialogOpen: false })).toBe(true);
  });
  it("arrow keys in the tab list keep focus on the tabs", () => {
    expect(shouldFocusHeading({ viaDockPointer: false, focusLost: false, dialogOpen: false })).toBe(false);
  });
  it("focus left on nothing (the switching control unmounted) goes to the heading", () => {
    expect(shouldFocusHeading({ viaDockPointer: false, focusLost: true, dialogOpen: false })).toBe(true);
  });
  it("a dialog that opened with the new view keeps its focus", () => {
    expect(shouldFocusHeading({ viaDockPointer: true, focusLost: true, dialogOpen: true })).toBe(false);
  });
});
