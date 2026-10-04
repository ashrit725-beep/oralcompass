/**
 * Mobile-only shell logic (owner direction 2026-10-04, "its fully a mobile app"), kept pure so vitest can check it without a DOM.
 * The hooks in hooks/useNativeShell.ts wire these to window.visualViewport, focus and the tab state.
 */

/** Fields that raise the on-screen keyboard (a select opens a picker, not the keyboard; check boxes and ranges do neither). */
export const KEYBOARD_FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]';

/** Pixels of the layout viewport hidden under the on-screen keyboard (0 when there is none). */
export function keyboardInset(innerHeight: number, vv: { height: number; offsetTop: number } | null | undefined): number {
  if (!vv) return 0;
  return Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
}

/** A browser toolbar collapsing changes the visual viewport by ~50-100 px; a keyboard takes far more. */
export const KEYBOARD_MIN_PX = 120;
export const isKeyboardOpen = (inset: number) => inset >= KEYBOARD_MIN_PX;

/** Whether a focused field sits (partly) outside the visible area above the keyboard, with a 16 px margin. */
export function fieldHidden(rect: { top: number; bottom: number }, vv: { height: number; offsetTop: number }): boolean {
  const top = vv.offsetTop + 16;
  const bottom = vv.offsetTop + vv.height - 16;
  return rect.bottom > bottom || rect.top < top;
}

/**
 * After a tab change, move focus to the new panel's heading (orchestrator note 19a) only when the change came from a tap on the dock or
 * focus was left on nothing (the control that switched the tab unmounted with the old panel). Arrow keys inside the tab list keep focus
 * on the tabs (Radix roving focus), and a dialog that opened with the new view keeps its own focus.
 */
export function shouldFocusHeading(o: { viaDockPointer: boolean; focusLost: boolean; dialogOpen: boolean }): boolean {
  if (o.dialogOpen) return false;
  return o.viaDockPointer || o.focusLost;
}

/** A pointer press on the dock counts for the tab change that follows it within this window (Radix activates on mousedown). */
export const DOCK_POINTER_WINDOW_MS = 1500;
