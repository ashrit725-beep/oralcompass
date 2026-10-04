import type { AssistScope } from "@/lib/types";

/**
 * AskAboutStep — day-1 STUB (owner: web upload-review + assistant agent; spec §8, component plan N8).
 * Contract: the Kokonut ai-prompt composer (scope selector, Compass send button) rendered INLINE at the foot of a step inside the
 * drawer/DetailPanel, three suggested questions as 44 px buttons, the answer list (parchment note cards with EvidenceBadge footers and
 * prompt-kit Source citations, one Highlighter mark per answer), the demo-mode label, and the ThoughtLine retrieval header.
 * Strings come from `ASSIST` in lib/copy/assistant.ts. Never a right-hand column, never chat bubbles.
 */
export interface AskAboutStepProps {
  scope: AssistScope;
  /** Open the clause card for a stitch id (`"ML26#7"`). */
  onOpenStitch?: (stitchId: string) => void;
  /** Scroll to / select a pipeline step. */
  onOpenStep?: (lineIndex: number, stepIndex: number) => void;
  className?: string;
}

export function AskAboutStep(_props: AskAboutStepProps) {
  return null;
}

export default AskAboutStep;
