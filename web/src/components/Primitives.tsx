import type { ReactElement } from "react";
import { BADGE_LABEL } from "../lib/copy";
import type { Evidence, Stitch } from "../lib/types";
import { circled } from "../lib/stitches";

/** Evidence badge: icon + word, never color alone (spec §1.2). */
export function EvidenceBadge({ status }: { status: Evidence }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`} role="img" aria-label={`Evidence: ${BADGE_LABEL[status]}`}>
      <BadgeGlyph status={status} /> {BADGE_LABEL[status]}
    </span>
  );
}

/**
 * The six badge glyphs as small inline SVGs in the ink colour (info-only-11; addendum: "badge icons as inline SVG glyphs instead of
 * emoji, keeping the words"): an emoji page rendered differently on every OS. Decorative: the words carry the meaning.
 */
const GLYPH: Record<Evidence, ReactElement> = {
  DOC: <><path d="M3.5 1.5h6l3 3v10h-9z" /><path d="M9.5 1.5v3h3M5.5 8h5M5.5 10.5h5" /></>,
  USER: <><path d="M3 13l1-3.5 6.5-6.5 2.5 2.5L6.5 12z" /><path d="M9 4.5l2.5 2.5" /></>,
  ASSUMED: <path d="M2 9c1.5-2.5 3-2.5 4.5 0s3 2.5 4.5 0 2.5-1.5 3-1" />,
  AMBIGUOUS: <><path d="M5.5 5.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7" /><path d="M8 12.5v.5" /></>,
  UNKNOWN: <><circle cx="8" cy="8" r="4.5" /><path d="M3 13L13 3" /></>,
  CONFLICT: <><path d="M2.5 5.5h10M10 3l2.5 2.5L10 8" /><path d="M13.5 10.5h-10M6 8l-2.5 2.5L6 13" /></>,
};
export function BadgeGlyph({ status }: { status: Evidence }) {
  return (
    <svg className="badge-glyph" viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {GLYPH[status]}
    </svg>
  );
}

/** Scoped stitch chip: square scope tag + circled number. `prominent` when ≥2 plans are loaded. */
export function StitchChip({ stitch, selected, prominent, onSelect }: { stitch: Stitch; selected?: boolean; prominent?: boolean; onSelect?: (s: Stitch) => void }) {
  return (
    <button
      type="button"
      className={`stitch ${selected ? "stitch-selected" : ""}`}
      aria-pressed={!!selected}
      aria-label={`Stitch ${stitch.n}, ${stitch.topic.replace(/[_:]/g, " ")}, ${stitch.doc} ${stitch.pageNote ?? `page ${stitch.page}`}`}
      onClick={() => onSelect?.(stitch)}
    >
      <span className={`scope ${prominent ? "scope-prominent" : ""}`} aria-hidden="true">{stitch.doc}</span>
      <span className="num" aria-hidden="true">{circled(stitch.n)}</span>
    </button>
  );
}

