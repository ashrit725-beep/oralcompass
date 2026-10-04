import { motion } from "motion/react";
import { EASE, useReducedMotion } from "@/lib/motion";
import { Suspense, lazy, type ReactNode } from "react";
import { Money } from "@/components/Money";
import { EvidenceBadge, StitchChip } from "@/components/Primitives";
import { Button } from "@/components/ui/button";
import { ASSIST } from "@/lib/copy/assistant";
import { resolveRef, splitPlaceholders, templateLabel, trailingRefs, type AssistBlockX, type AssistData, type Resolved } from "@/lib/assistant";
import type { AssistRef, AssistScope } from "@/lib/types";

// rough-notation stays out of the main chunk (foundation notes §1.1); the fallback renders the children unmarked.
const Highlighter = lazy(() => import("@/components/magicui/highlighter").then((m) => ({ default: m.Highlighter })));

/**
 * AnswerBlocks (spec §8.1/§8.2, component plan N8): parchment note blocks, never bubbles. Every `{{ref:n}}` placeholder becomes the
 * resolved value from the payloads the client holds: cents through <Money> (badge beside), percentages and words with an EvidenceBadge,
 * clauses as StitchChips that open the clause card. Refs the sentence did not inline follow it as chips (step chips scroll the pipeline).
 * One Highlighter mark per answer (the first inlined figure of the first sentence): evidential, not decorative. Template blocks carry
 * their label ("Information, not a choice" / scope). Clarify blocks offer the server's options as 44 px buttons. No amount is ever typed here.
 */
export interface AnswerBlocksProps {
  blocks: AssistBlockX[];
  data: AssistData;
  scope: AssistScope;
  onOpenStitch?: (stitchId: string) => void;
  onOpenStep?: (lineIndex: number, stepIndex: number) => void;
  onClarify?: (patch: Partial<AssistScope>) => void;
  /** The one Highlighter mark per answer (default true). Off under "Show the details": the plain-words lead above is the focus, and a
   *  rough-notation SVG measured inside a scrolled bottom sheet lands in the wrong place. */
  mark?: boolean;
}

export function Inline({ r, onOpenStitch }: { r: Resolved; onOpenStitch?: (id: string) => void }) {
  switch (r.kind) {
    case "money": return <Money cents={r.cents} evidence={r.evidence} calc={r.calc} className="as-money" />;
    case "percent": return <span className="as-inline"><span className="num">{r.pct === null ? ASSIST.notStated : `${r.pct}%`}</span> <EvidenceBadge status={r.evidence} /></span>;
    case "text": return <span className="as-inline"><span>{r.text}</span> <EvidenceBadge status={r.evidence} /></span>;
    case "clause": return r.stitch ? <StitchChip stitch={r.stitch} onSelect={(s) => onOpenStitch?.(s.id)} /> : <span className="as-clause-text">{r.label}</span>;
  }
}

export function Chip({ r, data, scope, onOpenStitch, onOpenStep }: { r: AssistRef; data: AssistData; scope: AssistScope; onOpenStitch?: (id: string) => void; onOpenStep?: (l: number, s: number) => void }) {
  const res = resolveRef(r, data, scope);
  if (res.kind === "clause") return res.stitch ? <StitchChip stitch={res.stitch} onSelect={(s) => onOpenStitch?.(s.id)} /> : <span className="as-chip">{res.label}</span>;
  if (r.kind === "step") {
    const body = <><span className="as-chip-label">{res.label}</span> <Inline r={res} /></>;
    return onOpenStep ? <Button type="button" variant="outline" size="touch" className="as-chip-btn h-auto max-w-full whitespace-normal text-left" onClick={() => onOpenStep(r.line_index, r.step_index)}>{body}</Button> : <span className="as-chip">{body}</span>;
  }
  return <span className="as-chip"><span className="as-chip-label">{res.label}</span> <Inline r={res} onOpenStitch={onOpenStitch} /></span>;
}

/** Answer reveal (motionsites technique 2, adapted): each block rises 4 px and fades in over 500 ms on the soft-landing ease, in reading
 *  order 80 ms apart (capped at four steps), and the citation chips land 120 ms after their sentence. Mount-only; the end state is the
 *  plain layout, and MotionConfig reducedMotion="user" drops the rise. */
const revealMotion = (i: number, extra = 0) => ({
  initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: EASE.land, delay: Math.min(i, 4) * 0.08 + extra },
});

export function AnswerBlocks({ blocks, data, scope, onOpenStitch, onOpenStep, onClarify, mark = true }: AnswerBlocksProps) {
  const reduce = useReducedMotion();
  // reduced motion renders the end state at once (no fade either)
  const reveal = (i: number, extra = 0) => (reduce ? { initial: false as const } : revealMotion(i, extra));
  let marked = !mark;
  return (
    <div className="as-blocks">
      {blocks.map((b, i) => {
        if (b.type === "sentence" || b.type === "simple") {
          const refs = b.refs ?? [];
          const segs = splitPlaceholders(b.text, refs);
          const trailing = trailingRefs(b.text, refs);
          return (
            <motion.div key={i} className="as-sentence" {...reveal(i)}>
              <p className="as-text">
                {segs.map((s, j) => {
                  if (s.type === "text") return <span key={j}>{s.text}</span>;
                  if (!s.ref) return <span key={j} className="as-clause-text">{ASSIST.notLoaded}</span>;
                  const res = resolveRef(s.ref, data, scope);
                  let node: ReactNode = <Inline r={res} onOpenStitch={onOpenStitch} />;
                  if (!marked && res.kind !== "clause") {
                    marked = true;
                    node = <Suspense fallback={node}><Highlighter>{node}</Highlighter></Suspense>;
                  }
                  return <span key={j} className="as-ref">{node}</span>;
                })}
              </p>
              {trailing.length > 0 && (
                <motion.ul className="as-chips" aria-label={ASSIST.toolsUsed} {...reveal(i, 0.12)}>
                  {trailing.map((r, k) => <li key={k}><Chip r={r} data={data} scope={scope} onOpenStitch={onOpenStitch} onOpenStep={onOpenStep} /></li>)}
                </motion.ul>
              )}
            </motion.div>
          );
        }
        if (b.type === "clarify") {
          return (
            <motion.div key={i} className="as-template" data-key="clarify" {...reveal(i)}>
              <span className="as-label">{ASSIST.clarifyLabel}</span>
              {b.text && <p className="as-text">{b.text}</p>}
              <ul className="as-options">
                {b.options.map((o, k) => <li key={k}><Button type="button" variant="outline" size="touch" onClick={() => onClarify?.(o.scope_patch)}>{o.label}</Button></li>)}
              </ul>
            </motion.div>
          );
        }
        return (
          <motion.div key={i} className="as-template" data-key={b.key} {...reveal(i)}>
            <span className="as-label">{templateLabel(b)}</span>
            <p className="as-text">{b.text}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

export default AnswerBlocks;
