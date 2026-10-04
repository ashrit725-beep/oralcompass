/**
 * Page geometry for components/PageView.tsx (pure; tested in lib/pageview.test.ts).
 * - `quoteItemRange`: which pdf.js text items a quote covers. The quote is matched on whitespace-collapsed, lower-cased text and the match is
 *   mapped back to raw offsets, so only the items of the quoted line are highlighted (layout-25: the old window pulled in the preceding item
 *   and the highlight spanned two lines).
 * - `clusterPins`: stitch pins whose lines sit closer than `gap` px share one grouped pin (layout-4: 16 pins on a fee schedule stacked 26 px
 *   apart over the text).
 */

/** Whitespace-collapsed, trimmed, lower-cased text plus, for every output character, the raw offset it came from. */
export function normalizeWithMap(raw: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (/\s/.test(c)) { if (text.length && pendingSpace < 0) pendingSpace = i; continue; }
    if (pendingSpace >= 0) { text += " "; map.push(pendingSpace); pendingSpace = -1; }
    const lower = c.toLowerCase();
    for (let k = 0; k < lower.length; k++) { text += lower[k]; map.push(i); }
  }
  return { text, map };
}

/** Index range [first, last] of the text items the quote covers, or null when the quote is not on the page. */
export function quoteItemRange(items: string[], quote: string): [number, number] | null {
  let joined = "";
  const spans: [number, number][] = [];
  for (const s of items) { const start = joined.length; joined += s; spans.push([start, joined.length]); joined += " "; }
  const { text, map } = normalizeWithMap(joined);
  const q = normalizeWithMap(quote).text;
  if (!q) return null;
  const at = text.indexOf(q);
  if (at < 0) return null;
  const rawStart = map[at];
  const rawEnd = map[at + q.length - 1] + 1;
  let first = -1, last = -1;
  spans.forEach(([a, b], i) => {
    if (b > a && a < rawEnd && b > rawStart) { if (first < 0) first = i; last = i; }
  });
  return first < 0 ? null : [first, last];
}

/** Chain pin positions (sorted by top): a pin closer than `gap` px to the previous one joins its group (a run of schedule lines becomes
 *  one grouped pin). Returns groups of input indexes; consecutive groups' first pins are always at least `gap` px apart. */
export function clusterPins(tops: number[], gap: number): number[][] {
  const order = tops.map((t, i) => [t, i] as const).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const groups: number[][] = [];
  let prev = -Infinity;
  for (const [t, i] of order) {
    if (groups.length && t - prev < gap) groups[groups.length - 1].push(i);
    else groups.push([i]);
    prev = t;
  }
  return groups;
}
