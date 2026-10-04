import { useId, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ASSIST } from "@/lib/copy/assistant";
import { lookupLabels, resolveRef as resolveFor, ribbonFor, splitAnswer, splitPlaceholders, trailingRefs, type AssistData, type SimpleBlock } from "@/lib/assistant";
import { EASE, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { AssistScope } from "@/lib/types";
import type { AskAnswer } from "@/hooks/useAsk";
import type { ServerMode } from "./AssistData";
import { AnswerBlocks, Chip, Inline } from "./AnswerBlocks";

/**
 * AnswerCard (the simple-terms contract, spec §8 answer card): one parchment note per question, never a bubble.
 * Order: the question asked → "In simple terms" (1–2 everyday sentences; every figure a resolved ref through <Money> with its badge) →
 * the "Even simpler" sentence once asked → two quiet actions, "Say it more simply" (re-asks with style "simpler") and the "Show the
 * details" disclosure (a real button, aria-expanded, closed by default) holding the existing step / clause / where-from blocks →
 * the foot (demo or live label, the guard's counts, what was looked up). An answer without a simple block (an older API) renders its
 * blocks directly, as before. Motion: the simple block lands once (500 ms soft landing, 4 px rise); the details fade in on open;
 * reduced motion renders end states.
 */
export interface AnswerCardProps {
  answer: AskAnswer;
  data: AssistData;
  mode: ServerMode | null;
  loading?: boolean;
  /** Another request is in flight: the plainer-words button waits. */
  busy?: boolean;
  /** This answer's plainer version is in flight. */
  simplifying?: boolean;
  onSimpler?: (answerId: number) => void;
  onOpenStitch?: (stitchId: string) => void;
  onOpenStep?: (lineIndex: number, stepIndex: number) => void;
  onClarify?: (question: string, patch: Partial<AssistScope>) => void;
  /** Copy for the "nothing survived" caption (step composer vs AskBox). */
  nothingSurvived?: string;
}

const INFORMATIONAL = new Set(["explain_step", "explain_clause", "where_from"]);

/** One plain-words sentence: refs inline (cents through <Money> with the badge), refs the sentence did not inline follow as chips. */
export function PlainSentence({ block, data, scope, className, onOpenStitch }: { block: SimpleBlock; data: AssistData; scope: AssistScope; className?: string; onOpenStitch?: (id: string) => void }) {
  const segs = splitPlaceholders(block.text, block.refs);
  const trailing = trailingRefs(block.text, block.refs);
  return (
    <>
      <p className={cn("as-simple-text", className)}>
        {segs.map((s, j) => {
          if (s.type === "text") return <span key={j}>{s.text}</span>;
          if (!s.ref) return <span key={j} className="as-clause-text">{ASSIST.notLoaded}</span>;
          return <span key={j} className="as-ref"><Inline r={resolveFor(s.ref, data, scope)} onOpenStitch={onOpenStitch} /></span>;
        })}
      </p>
      {trailing.length > 0 && (
        <ul className="as-chips" aria-label={ASSIST.toolsUsed}>
          {trailing.map((r, k) => <li key={k}><Chip r={r} data={data} scope={scope} onOpenStitch={onOpenStitch} /></li>)}
        </ul>
      )}
    </>
  );
}

export function AnswerCard({ answer: a, data, mode, loading, busy, simplifying, onSimpler, onOpenStitch, onOpenStep, onClarify, nothingSurvived = ASSIST.boxNothingSurvived }: AnswerCardProps) {
  const reduce = useReducedMotion();
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const { simple, details } = splitAnswer(a.blocks);
  const simplerSplit = a.simpler ? splitAnswer(a.simpler.blocks) : null;
  const simplerText: SimpleBlock[] = simplerSplit ? (simplerSplit.simple.length ? simplerSplit.simple : firstSentence(a.simpler!.blocks)) : [];
  const ribbon = ribbonFor(a.resp, mode?.llm_mode ?? null);
  const dropped = a.resp.guard.dropped + a.localDropped + (a.simpler ? a.simpler.resp.guard.dropped + a.simpler.localDropped : 0);
  const grounding = a.resp.guard.grounding_failures;
  const hasSentence = simple.length > 0 || a.blocks.some((b) => b.type === "sentence");
  const informational = INFORMATIONAL.has(a.resp.intent) || a.blocks.length === 0;
  const lookups = lookupLabels(a.resp.tools_used, data);
  const land = (delay = 0) => (reduce ? { initial: false as const } : { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: EASE.land, delay } });
  const legacy = simple.length === 0;

  return (
    <li className="as-answer" data-tone={ribbon?.tone ?? "live"} data-simple={legacy ? "false" : "true"}>
      <p className="as-asked">{ASSIST.asked(a.question)}</p>
      {loading && <p className="as-caption">{ASSIST.loadingData}</p>}
      {legacy ? (
        <AnswerBlocks blocks={a.blocks} data={data} scope={a.scope} onOpenStitch={onOpenStitch} onOpenStep={onOpenStep} onClarify={(patch) => onClarify?.(a.question, patch)} />
      ) : (
        <>
          <motion.div className="as-simple" {...land()}>
            <p className="as-simple-label">{ASSIST.simpleLabel}</p>
            {simple.map((b, i) => <PlainSentence key={i} block={b} data={data} scope={a.scope} onOpenStitch={onOpenStitch} />)}
          </motion.div>
          {a.simpler && (
            <motion.div className="as-simple as-simpler" {...land()}>
              <p className="as-simple-label">{ASSIST.simplerLabel}</p>
              {simplerText.length
                ? simplerText.map((b, i) => <PlainSentence key={i} block={b} data={data} scope={a.scope} onOpenStitch={onOpenStitch} />)
                : <p className="as-caption">{ASSIST.noSimpler}</p>}
            </motion.div>
          )}
          <div className="as-actions">
            {!a.simpler && onSimpler && (
              <Button type="button" variant="outline" size="touch" className="as-action h-auto rounded-[var(--r-2)] px-3 text-sm" disabled={busy || simplifying} aria-busy={simplifying || undefined} onClick={() => onSimpler(a.id)}>
                {simplifying ? ASSIST.sayingItSimpler : ASSIST.sayItSimpler}
              </Button>
            )}
            {details.length > 0 && (
              <Button type="button" variant="outline" size="touch" className="as-action as-disclosure h-auto rounded-[var(--r-2)] px-3 text-sm" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((o) => !o)}>
                <span>{open ? ASSIST.hideDetails : ASSIST.showDetails}</span>
                <ChevronDown aria-hidden="true" className="as-chevron" data-open={open ? "true" : "false"} />
              </Button>
            )}
          </div>
          {details.length > 0 && (
            <div id={detailsId} className="as-details" hidden={!open}>
              {open && (
                <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.24, ease: EASE.standard }}>
                  <AnswerBlocks blocks={details} data={data} scope={a.scope} onOpenStitch={onOpenStitch} onOpenStep={onOpenStep} onClarify={(patch) => onClarify?.(a.question, patch)} />
                </motion.div>
              )}
            </div>
          )}
        </>
      )}
      {informational && !hasSentence && <p className="as-caption">{nothingSurvived}</p>}
      <div className="as-answer-foot">
        {ribbon && <span className={cn("as-ribbon", ribbon.tone === "live" ? "as-ribbon-live" : "ribbon")}>{ribbon.text}</span>}
        {dropped > 0 && <span className="as-guard">{ASSIST.guardRemoved(dropped)}</span>}
        {grounding > 0 && <span className="as-guard">{ASSIST.groundingRemoved(grounding)}</span>}
        {lookups.length > 0 && <span className="as-tools">{ASSIST.toolsUsed} {lookups.join(" · ")}</span>}
      </div>
    </li>
  );
}

/** A "simpler" response without a marked simple block: its first sentence stands in. */
function firstSentence(blocks: AskAnswer["blocks"]): SimpleBlock[] {
  const s = blocks.find((b) => b.type === "sentence" || b.type === "simple");
  return s && (s.type === "sentence" || s.type === "simple") ? [{ text: s.text, refs: s.refs ?? [] }] : [];
}

export default AnswerCard;
