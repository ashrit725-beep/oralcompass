import { useEffect, useState, type RefObject } from "react";

export interface ViewportInset {
  /** Pixels of the layout viewport hidden below the visual viewport (the on-screen keyboard), 0 when none. */
  inset: number;
  /** Height of the visual viewport in px (null before the first measure or without the API). */
  height: number | null;
}

/**
 * The on-screen keyboard, measured with `window.visualViewport` (iOS Safari and Android Chrome shrink the VISUAL viewport, not the
 * layout one, so a `position: fixed; bottom: 0` sheet would sit under the keyboard). While `active`, returns how far the keyboard covers
 * the bottom of the layout viewport and the visible height, so a bottom sheet can lift its composer above the keyboard. Updates on the
 * viewport's resize and scroll events (one state update per event, no polling); 0 everywhere without the API.
 */
export function useKeyboardInset(active: boolean): ViewportInset {
  const [state, setState] = useState<ViewportInset>({ inset: 0, height: null });
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) { setState({ inset: 0, height: null }); return; }
    const measure = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const height = Math.round(vv.height);
      // under ~80 px is browser chrome settling (URL bar), not a keyboard
      setState((s) => {
        const next = { inset: inset < 80 ? 0 : inset, height };
        return s.inset === next.inset && s.height === next.height ? s : next;
      });
    };
    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => { vv.removeEventListener("resize", measure); vv.removeEventListener("scroll", measure); };
  }, [active]);
  return state;
}

/** Publishes an element's measured height as a CSS custom property on <html> (`--dock-h`, `--askfield-h`), so fixed layers stack on the
 *  phone dock and the ask field exactly (safe-area padding and landscape sizes included). Removed again when inactive or unmounted. */
export function useMeasuredVar(ref: RefObject<HTMLElement | null>, cssVar: string, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!active || !el) { root.style.removeProperty(cssVar); return; }
    const set = () => root.style.setProperty(cssVar, `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    if (typeof ResizeObserver === "undefined") return () => root.style.removeProperty(cssVar);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty(cssVar); };
  }, [ref, cssVar, active]);
}
