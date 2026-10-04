import type { LandmarkId } from "@/lib/copy";
import type { Benefits, PlanFixture, SavedEstimate, Stitch } from "@/lib/types";

/**
 * BenefitsCompass — day-1 STUB (owner: web foundation + map agent; spec §4.6, component plan N11).
 * Contract: the panel titled by the question it answers ("How much of the $1,500.00 maximum remains after the planned work? $162.00"),
 * two Animata GaugeChart dials (deductible remaining, annual maximum remaining; UNKNOWN = dashed track + badge, never 0 %) flanking one
 * RingChart (class percentages), each figure a <Money> with its badge and stitch; the Restrictions list; `compact` renders the one-line
 * strip for the drawer header. Animates once on reveal (Motion Primitives InView), never on scroll.
 */
export interface BenefitsCompassProps {
  plan: PlanFixture;
  benefits: Benefits | null;
  estimate: SavedEstimate | null;
  stitches: Stitch[];
  compact?: boolean;
  onOpenLandmark: (id: LandmarkId) => void;
  onSelectStitch: (s: Stitch) => void;
}

export function BenefitsCompass(_props: BenefitsCompassProps) {
  return null;
}

export default BenefitsCompass;
