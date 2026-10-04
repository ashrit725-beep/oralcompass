import { COMPASS } from "@/lib/copy/compass";
import type { RestrictionsVM } from "@/lib/compass-model";
import type { LandmarkId } from "@/lib/copy";

/**
 * RestrictionsList (spec §4.6 "Restrictions" quadrant): four short lines counted from the plan document (frequency limits, exclusions,
 * waiting periods, alternate benefit) plus the rules the engine quotes but does not apply. Each line is a real button that opens the
 * Coverage landmark (the cove) at depth 3, where the exact wording lives. Counts are counts of clauses in the pages read, never a
 * judgement of the plan.
 */
export interface RestrictionsListProps {
  restrictions: RestrictionsVM;
  onOpen: (id: LandmarkId) => void;
}

export function RestrictionsList({ restrictions: r, onOpen }: RestrictionsListProps) {
  const waiting = r.waiting.kind === "none" ? COMPASS.waitingNone
    : r.waiting.kind === "stated" ? COMPASS.waitingFor(r.waiting.months ?? 0, r.waiting.what ?? "")
    : r.waiting.kind === "ambiguous" ? COMPASS.waitingAmbiguous : COMPASS.waitingNotStated;
  const lines = [
    COMPASS.frequency(r.frequency),
    COMPASS.exclusions(r.exclusions),
    waiting,
    r.alternate === "present" ? COMPASS.altPresent : COMPASS.altNotStated,
    ...(r.unsupported > 0 ? [COMPASS.unsupported(r.unsupported)] : []),
  ];
  return (
    <ul className="cmp-restrictions">
      {lines.map((line) => (
        <li key={line}>
          <button type="button" className="linklike cmp-restriction" onClick={() => onOpen("cove")} aria-label={`${line}, ${COMPASS.opensCove}`}>{line}</button>
        </li>
      ))}
    </ul>
  );
}

export default RestrictionsList;
