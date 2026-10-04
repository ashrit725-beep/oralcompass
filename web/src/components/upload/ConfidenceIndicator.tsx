import { EvidenceBadge } from "@/components/Primitives";
import { UPLOAD } from "@/lib/copy/upload";
import type { Evidence, ExtractedField } from "@/lib/types";

/**
 * ConfidenceIndicator (spec §7.3 step 4, §7.4): the confidence word + glyph (`Confirmed ✓` / `Likely ◐` / `Needs review ?` / `Not found ∅`)
 * next to the evidence badge the row carries into the plan version. Never colour alone: glyph, word and badge each state the status.
 */
export interface ConfidenceIndicatorProps {
  confidence: ExtractedField["confidence"];
  evidence: Evidence;
  reviewStatus?: ExtractedField["review_status"];
}

export function ConfidenceIndicator({ confidence, evidence, reviewStatus }: ConfidenceIndicatorProps) {
  const word = UPLOAD.confidence[confidence] ?? confidence;
  const note = reviewStatus === "user_confirmed" ? UPLOAD.userConfirmed : reviewStatus === "needs_review" ? UPLOAD.quoteNearby : null;
  return (
    <span className="up-confidence" data-confidence={confidence}>
      <span className="up-confidence-word"><span aria-hidden="true">{UPLOAD.confidenceGlyph[confidence]}</span> {word}</span>
      <EvidenceBadge status={evidence} />
      {note && <span className="up-confidence-note">{note}</span>}
    </span>
  );
}

export default ConfidenceIndicator;
