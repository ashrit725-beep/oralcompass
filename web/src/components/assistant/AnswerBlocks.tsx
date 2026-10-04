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
}

function Inline({ r, onOpenStitch }: { r: Resolved; onOpenStitch?: (id: string) => void }) {
  switch (r.kind) {
    case "money": return <Money cents={r.cents} evidence={r.evidence} className="as-money" />;
    case "percent": return <span className="as-inline"><span className="num">{r.pct === null ? ASSIST.notStated : `${r.pct}%`}</span> <EvidenceBadge status={r.evidence} /></span>;
    case "text": return <span className="as-inline"><span>{r.text}</span> <EvidenceBadge status={r.evidence} /></span>;
    case "clause": return r.stitch ? <StitchChip stitch={r.stitch} onSelect={(s) => onOpenStitch?.(s.id)} /> : <span className="as-clause-text">{r.label}</span>;
  }
}

function Chip({ r, data, scope, onOpenStitch, onOpenStep }: { r: AssistRef; data: AssistData; scope: AssistScope; onOpenStitch?: (id: string) => void; onOpenStep?: (l: number, s: number) => void }) {
  const res = resolveRef(r, data, scope);
  if (res.kind === "clause") return res.stitch ? <StitchChip stitch={res.stitch} onSelect={(s) => onOpenStitch?.(s.id)} /> : <span className="as-chip">{res.label}</span>;
  if (r.kind === "step") {
    const body = <><span className="as-chip-label">{res.label}</span> <Inline r={res} /></>;
    return onOpenStep ? <Button type="button" variant="outline" size="touch" className="as-chip-btn" onClick={() => onOpenStep(r.line_index, r.step_index)}>{body}</Button> : <span className="as-chip">{body}</span>;
  }
  return <span className="as-chip"><span className="as-chip-label">{res.label}</span> <Inline r={res} onOpenStitch={onOpenStitch} /></span>;
}

export function AnswerBlocks({ blocks, data, scope, onOpenStitch, onOpenStep, onClarify }: AnswerBlocksProps) {
  let marked = false;
  return (
    <div className="as-blocks">
      {blocks.map((b, i) => {
        if (b.type === "sentence") {
          const segs = splitPlaceholders(b.text, b.refs);
          const trailing = trailingRefs(b.text, b.refs);
          return (
            <div key={i} className="as-sentence">
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
                <ul className="as-chips" aria-label={ASSIST.toolsUsed}>
                  {trailing.map((r, k) => <li key={k}><Chip r={r} data={data} scope={scope} onOpenStitch={onOpenStitch} onOpenStep={onOpenStep} /></li>)}
                </ul>
              )}
            </div>
          );
        }
        if (b.type === "clarify") {
          return (
            <div key={i} className="as-template" data-key="clarify">
              <span className="as-label">{ASSIST.clarifyLabel}</span>
              {b.text && <p className="as-text">{b.text}</p>}
              <ul className="as-options">
                {b.options.map((o, k) => <li key={k}><Button type="button" variant="outline" size="touch" onClick={() => onClarify?.(o.scope_patch)}>{o.label}</Button></li>)}
              </ul>
            </div>
          );
        }
        return (
          <div key={i} className="as-template" data-key={b.key}>
            <span className="as-label">{templateLabel(b)}</span>
            <p className="as-text">{b.text}</p>
          </div>
        );
      })}
    </div>
  );
}

export default AnswerBlocks;
