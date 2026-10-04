import { useEffect, useLayoutEffect, useRef } from "react";
import { DOCK_POINTER_WINDOW_MS, KEYBOARD_FIELD, fieldHidden, isKeyboardOpen, keyboardInset, shouldFocusHeading } from "@/lib/shell";

/**
 * The keyboard never covers a field (mobile-only direction, native-app feel). window.visualViewport shrinks while the on-screen keyboard
 * is up: the hidden height is published as `--kb-inset` on <html> and `html[data-keyboard]` is set (styles.css hides the dock then), and
 * a focused text field that ended up under the keyboard is scrolled into the visible area once the keyboard has settled. Fields inside a
 * vaul sheet are left to vaul (`repositionInputs`), which moves the sheet itself.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;
    let reveal = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inset = keyboardInset(window.innerHeight, vv);
        root.style.setProperty("--kb-inset", `${inset}px`);
        root.toggleAttribute("data-keyboard", isKeyboardOpen(inset));
      });
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.matches?.(KEYBOARD_FIELD) || el.closest("[data-vaul-drawer]")) return;
      window.clearTimeout(reveal);
      // the keyboard animates in over ~250-300 ms; measure after it settles
      reveal = window.setTimeout(() => {
        if (document.activeElement !== el) return;
        if (fieldHidden(el.getBoundingClientRect(), vv)) el.scrollIntoView({ block: "center", inline: "nearest" });
      }, 320);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocusIn);
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(reveal);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocusIn);
      root.style.removeProperty("--kb-inset");
      root.removeAttribute("data-keyboard");
    };
  }, []);
}

/**
 * Tab changes behave like a native tab bar (orchestrator note 19a): the new view opens at the top (instant, before paint, so the old
 * offset never shows; children's own effects may still scroll to a target afterwards), and a tap on the dock moves focus to the new
 * panel's heading so a screen reader announces where the person landed. Returns a pointer-down handler for the dock.
 */
export function useTabChangeReset(tab: string) {
  const first = useRef(true);
  const dockPointerAt = useRef(-Infinity);

  useLayoutEffect(() => {
    if (first.current) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [tab]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const viaDockPointer = performance.now() - dockPointerAt.current < DOCK_POINTER_WINDOW_MS;
    dockPointerAt.current = -Infinity;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      const focusLost = !active || active === document.body || !active.isConnected;
      const dialogOpen = !!document.querySelector('[role="dialog"][aria-modal="true"]');
      if (!shouldFocusHeading({ viaDockPointer, focusLost, dialogOpen })) return;
      const panel = document.querySelector<HTMLElement>(`[data-view="${tab}"]`);
      const heading = panel?.querySelector<HTMLElement>("h1, h2") ?? document.getElementById("main");
      if (!heading) return;
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab]);

  return { onDockPointerDown: () => { dockPointerAt.current = performance.now(); } };
}
