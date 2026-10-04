import { useId } from "react";
import { AskAboutStepLazy as AskAboutStep } from "@/components/assistant/lazy";
import { ASSIST } from "@/lib/copy/assistant";
import type { AssistScope } from "@/lib/types";
import type { AssistData } from "@/lib/assistant";

/**
 * AskSection (owner: web upload-review + assistant agent; spec §4.4 section 13 "Ask about this step"). Replaces the day-1 stub IN PLACE.
 * `<section aria-labelledby>` with an <h3> (serif 17/24) that mounts `AskAboutStep` scoped to `{ plan_ref, estimate_id, treatment_item_id,
 * step_key, checkpoint_key }`. `ProcedureDrawer` (foundation) renders it last. Additive prop `data`: the drawer's payloads for ref
 * resolution (otherwise the AssistDataProvider or a lazy fetch supplies them).
 */
export interface AskSectionProps {
  scope: AssistScope;
  onOpenStitch?: (stitchId: string) => void;
  onOpenStep?: (lineIndex: number, stepIndex: number) => void;
  data?: Partial<AssistData>;
}

export function AskSection({ scope, onOpenStitch, onOpenStep, data }: AskSectionProps) {
  const id = useId();
  return (
    <section className="drawer-section as-section" aria-labelledby={id}>
      <h3 id={id} className="as-h3">{scope.stitch ? ASSIST.clauseHeading : ASSIST.heading}</h3>
      <AskAboutStep scope={scope} onOpenStitch={onOpenStitch} onOpenStep={onOpenStep} data={data} heading={false} />
    </section>
  );
}

export default AskSection;
