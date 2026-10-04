/**
 * Pinned to the phone branch (owner direction 2026-10-04, "its fully a mobile app"): the phone layout is the only layout, and a window
 * wider than 480 px shows the same phone app in a centred column (styles.css `.app`), so there is no desktop branch left to choose.
 * The app no longer calls this; it stays (always `true`) so code written against it on other branches keeps compiling and renders the
 * phone markup when merged. New code must not branch on the window width.
 */
export function useMobile(): true {
  return true;
}
