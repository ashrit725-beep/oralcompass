import { createElement, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import type { AskAboutStepProps } from "./AskAboutStep";
import type { AskBoxProps } from "./AskBox";

/**
 * The composers load as their own chunk (the answer card, the composer, the ThoughtLine and the AskBox sheet are ~30 KB of code that
 * the first paint does not need), keeping the app chunk under Rollup's 500 kB advisory. `preloadAssistant()` starts the fetch at app
 * start, in parallel with the first API calls; once the module has arrived the wrappers render it directly (no Suspense frame, so the
 * AskBox never flashes in above the map). Until then the fallback reserves the card's height (desktop) or renders nothing.
 */
function preloadable<P extends object>(factory: () => Promise<{ default: ComponentType<P> }>) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const load = () => (pending ??= factory().then((m) => { loaded = m.default; return m; }).catch((e) => { pending = null; throw e; }));
  const Lazy = lazy(load);
  function Preloaded(props: P & { fallback?: ReactNode }) {
    const { fallback = null, ...rest } = props;
    return loaded ? createElement(loaded, rest as P) : createElement(Suspense, { fallback }, createElement(Lazy as unknown as ComponentType<P>, rest as P));
  }
  return { Component: Preloaded, load };
}

const step = preloadable<AskAboutStepProps>(() => import("./AskAboutStep").then((m) => ({ default: m.AskAboutStep })));
const dock = preloadable<AskBoxProps>(() => import("./AskBox").then((m) => ({ default: m.AskDock })));

export const AskAboutStepLazy = step.Component;
export const AskDockLazy = dock.Component;

/** Fetch the composer chunks now (App calls it once at start); failures are retried on first render. */
export function preloadAssistant() {
  for (const p of [step, dock]) p.load().catch(() => undefined);
}
