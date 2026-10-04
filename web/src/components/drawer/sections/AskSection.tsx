import type { AssistScope } from "@/lib/types";

/**
 * AskSection — day-1 STUB (owner: web upload-review + assistant agent; spec §4.4 section 13 "Ask about this step").
 * Contract: `<section aria-labelledby>` with an <h3> (serif 17/24) that mounts `AskAboutStep` scoped to
 * `{ plan_ref, estimate_id, treatment_item_id, step_key, checkpoint_key }`. `ProcedureDrawer` (foundation) renders it last.
 */
export interface AskSectionProps {
  scope: AssistScope;
  onOpenStitch?: (stitchId: string) => void;
}

export function AskSection(_props: AskSectionProps) {
  return null;
}

export default AskSection;
