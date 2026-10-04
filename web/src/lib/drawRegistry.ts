/**
 * Draw registry (delight pass mo-01 A): which one-time reveals already ran in this session, keyed by what they show
 * (`${planRef}:${island ids}` for chart-draw). The views remount inside TransitionPanel on every tab return; without this the route
 * would redraw for 2 s each time. A plan switch makes a new key, so that beat still draws; an estimate recompute keeps the key, so the
 * route stays drawn and only the numbers re-measure (addendum B1). Module state on purpose: it lives exactly as long as the page.
 */
const drawn = new Set<string>();

export function hasDrawn(key: string): boolean { return drawn.has(key); }
export function markDrawn(key: string): void { drawn.add(key); }
