import { BADGE_ICON, BADGE_LABEL, UI } from "../lib/copy";
import type { Evidence, Stitch } from "../lib/types";
import { circled } from "../lib/stitches";

/** Evidence badge: icon + word, never color alone (spec §1.2). */
export function EvidenceBadge({ status }: { status: Evidence }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`} role="img" aria-label={`Evidence: ${BADGE_LABEL[status]}`}>
      <span aria-hidden="true">{BADGE_ICON[status]}</span> {BADGE_LABEL[status]}
    </span>
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

/** Depth dial: three depths rendered inside one card, never a new screen. */
