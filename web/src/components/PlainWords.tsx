import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { PLAIN } from "@/lib/copy";
import { EXPLAIN } from "@/lib/copy/explain";
import type { ExplainResponse } from "@/lib/ai-types";
import { explainClause, plainTopic } from "@/lib/explain";
import type { PlanRef, Stitch } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * PlainWords (addendum D.5b): the depth-1 sentence for one clause. Lazy: the request starts when the line scrolls near the viewport and is
 * cached in memory per clause (lib/explain.ts). The sentence always names who wrote it: "Written by the model from this quote" (live),
 * "Demo mode" (the PLAIN template, no model here) or "Plain-words template" (the server's checks rejected the model's sentence, a limit
 * was reached, or the request failed), and the clause it comes from. Until the answer arrives the PLAIN template is shown, so nothing jumps
 * and nothing is blank. Reduced motion: the 160 ms cross-fade is dropped by <MotionConfig reducedMotion="user">; the end state is the same.
 */
export interface PlainWordsProps {
  planRef?: PlanRef | null;
  stitch: Stitch;
  /** Small "Plain words" eyebrow above the sentence (off inside the clause card, whose dial already says "Plain words"). */
  eyebrow?: boolean;
  compact?: boolean;
  className?: string;
}

type State = { status: "waiting" | "done" | "failed"; res?: ExplainResponse };

export function PlainWords({ planRef, stitch, eyebrow = true, compact, className }: PlainWordsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "160px 0px" });
  const [state, setState] = useState<State>({ status: "waiting" });
  const fallback = PLAIN[plainTopic(stitch)] ?? PLAIN.plan;

  useEffect(() => {
    if (!inView || !planRef) return;
    let alive = true;
    setState({ status: "waiting" });
    explainClause(planRef, stitch).then((res) => { if (alive) setState({ status: "done", res }); }).catch(() => { if (alive) setState({ status: "failed" }); });
    return () => { alive = false; };
  }, [inView, planRef, stitch.doc, stitch.page, stitch.quote]);   // eslint-disable-line react-hooks/exhaustive-deps

  const res = state.res;
  const sentence = res?.sentence ?? fallback;
  const label = !planRef || state.status === "failed" ? EXPLAIN.labelTemplate
    : state.status === "waiting" ? EXPLAIN.writing
    : res!.mode === "live" ? EXPLAIN.labelLive : res!.reason ? EXPLAIN.labelTemplate : EXPLAIN.labelDemo;
  const live = res?.mode === "live";
  const where = EXPLAIN.fromClause(`${stitch.doc} ${stitch.pageNote ?? `p.${stitch.page}`}`);

  return (
    <div ref={ref} className={cn("plain-words", compact && "is-compact", live && "is-live", className)} aria-busy={state.status === "waiting" && !!planRef}>
      {eyebrow && <span className="pw-eyebrow">{EXPLAIN.plainWords}</span>}
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={sentence} className="plain pw-sentence" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {sentence}
        </motion.p>
      </AnimatePresence>
      <p className="pw-meta">
        <span className={cn("pw-label", live && "pw-label-live")} role={compact ? undefined : "status"}>{label}</span>
        <span className="pw-where">{where}</span>
      </p>
      {!live && state.status !== "waiting" && !compact && <p className="pw-note">{EXPLAIN.templateNote}</p>}
    </div>
  );
}

export default PlainWords;
