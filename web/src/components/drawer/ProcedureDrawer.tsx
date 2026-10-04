import type { Benefits, CoverageRule, IslandVM, PassageVM, PlanFixture, SavedEstimate, Stitch } from "@/lib/types";

/**
 * ProcedureDrawer — day-1 STUB (owner: web foundation + map agent; spec §4.4, component plan N3/N4).
 * Contract: the shell that renders `sections/*` in the fixed order (Procedure … Clause evidence, then `AskSection`), the sticky 48 px
 * header (crumbs `Island {order} of {n} · {place}` + 44 × 44 close "Close details"), the checkpoint strip, and focus management.
 * Desktop ≥ 768 px: Motion Primitives MorphingDialog / `role="region" aria-label="Procedure details"`; phone: `Primitives/Sheet`.
 * On the phone sheet, sections 5–8 and 10 are collapsed by default and "You pay" stays above the fold (addendum B1).
 */
export interface ProcedureDrawerProps {
  island: IslandVM;
  vm: PassageVM;
  plan: PlanFixture;
  rules: CoverageRule[];
  benefits: Benefits | null;
  estimate: SavedEstimate | null;
  stitches: Stitch[];
  selectedCheckpoint?: string;
  onSelectStitch: (s: Stitch) => void;
  onOpenDocuments: () => void;
  onClose: () => void;
  mobile: boolean;
  /** The island button that opened the drawer; focus returns to it on close. */
  returnFocus?: HTMLElement | null;
}

export function ProcedureDrawer(_props: ProcedureDrawerProps) {
  return null;
}

export default ProcedureDrawer;
