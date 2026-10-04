import { useEffect, useRef, useState } from "react";
import { ASSIST } from "@/lib/copy/assistant";
import { plainText, splitAnswer, type AssistData, type SimpleBlock } from "@/lib/assistant";
import type { AssistScope } from "@/lib/types";
import type { AskAnswer, AskApi } from "@/hooks/useAsk";
import { AnswerCard } from "./AnswerCard";

/**
 * AnswerList: the answers of one composer and its ONE live region. The visible list is not live (opening "Show the details" must not
 * re-announce); a visually hidden status line speaks each new answer once ("Answer: …" with the plain-words lead, figures with their
 * evidence words) and the "Even simpler" sentence once when it arrives. `collapseEarlier` (the AskBox) shows the newest answer and keeps
 * the earlier ones behind a native disclosure, so the card stays short above the map.
 */
export interface AnswerListProps {
  ask: AskApi;
  collapseEarlier?: boolean;
  onOpenStitch?: (stitchId: string) => void;
  onOpenStep?: (lineIndex: number, stepIndex: number) => void;
  nothingSurvived?: string;
  /** Simpler re-asks are offered (the AskBox and the composers; off only for a host that cannot show them). */
  simpler?: boolean;
}

/** The announcement for one answer: its plain-words lead, else its first sentence, else its first template text. */
export function announcementFor(a: AskAnswer, data: AssistData, which: "answer" | "simpler"): string {
  const blocks = which === "simpler" ? a.simpler?.blocks ?? [] : a.blocks;
  const { simple } = splitAnswer(blocks);
  let lead: SimpleBlock[] = simple;
  if (!lead.length) {
    const s = blocks.find((b) => b.type === "sentence" || b.type === "simple" || b.type === "template");
    if (s && (s.type === "sentence" || s.type === "simple")) lead = [{ text: s.text, refs: s.refs ?? [] }];
    else if (s && s.type === "template") lead = [{ text: s.text, refs: [] }];
  }
  const text = lead.map((b) => plainText(b, data, a.scope as AssistScope)).join(" ").trim();
  if (!text) return "";
  return which === "simpler" ? ASSIST.announceSimpler(text) : ASSIST.announce(text);
}

export function AnswerList({ ask, collapseEarlier = false, onOpenStitch, onOpenStep, nothingSurvived, simpler = true }: AnswerListProps) {
  const { answers, data, mode, loading, pending, simplerFor } = ask;
  const [live, setLive] = useState("");
  const spoken = useRef(new Set<string>());

  // announce once per answer and once per plainer version (keys survive re-renders; a scope change empties the list and the set)
  useEffect(() => {
    if (!answers.length) { spoken.current.clear(); setLive(""); return; }
    if (loading) return;                                   // the figures resolve first, so the announcement carries them
    const latest = answers[answers.length - 1];
    const keyA = `a${latest.id}`;
    if (!spoken.current.has(keyA)) { spoken.current.add(keyA); setLive(announcementFor(latest, data, "answer")); return; }
    const withSimpler = [...answers].reverse().find((a) => a.simpler && !spoken.current.has(`s${a.id}`));
    if (withSimpler) { spoken.current.add(`s${withSimpler.id}`); setLive(announcementFor(withSimpler, data, "simpler")); }
  }, [answers, data, loading]);

  const busy = !!pending || simplerFor !== null || ask.paused;
  const card = (a: AskAnswer) => (
    <AnswerCard key={a.id} answer={a} data={data} mode={mode} loading={loading} busy={busy} simplifying={simplerFor === a.id}
                onSimpler={simpler ? (id) => { void ask.askSimpler(id); } : undefined}
                onOpenStitch={onOpenStitch} onOpenStep={onOpenStep} onClarify={(q, patch) => { void ask.ask(q, { scope: a.scope, patch }); }}
                nothingSurvived={nothingSurvived} />
  );
  const earlier = collapseEarlier ? answers.slice(0, -1) : [];
  const shown = collapseEarlier ? answers.slice(-1) : answers;

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{live}</p>
      {answers.length > 0 && (
        <ol className="as-answers" aria-label={ASSIST.answerHeading}>
          {shown.map(card)}
        </ol>
      )}
      {earlier.length > 0 && (
        <details className="as-earlier">
          <summary>{ASSIST.boxEarlier(earlier.length)}</summary>
          <ol className="as-answers">{[...earlier].reverse().map(card)}</ol>
        </details>
      )}
    </>
  );
}

export default AnswerList;
