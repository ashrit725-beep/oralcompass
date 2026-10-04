import { Compass } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import AI_Prompt from "@/components/kokonutui/ai-prompt";
import ThoughtLine from "@/components/ui/ThoughtLine";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { ASSIST } from "@/lib/copy/assistant";
import {
  applyScopeChoice, clientGuard, createRequestGate, initialSuggestions, lookupLabels, ribbonFor, scopeChoices, type AssistBlockX, type AssistData, type AssistResponseX, type ScopeChoice,
} from "@/lib/assistant";
import { cn } from "@/lib/utils";
import type { AssistScope } from "@/lib/types";
import { AnswerBlocks } from "./AnswerBlocks";
import { serverMode, useAssistData, type ServerMode } from "./AssistData";

const RATE_LIMIT_PAUSE_MS = 20_000;

/**
 * AskAboutStep (owner: web upload-review + assistant agent; spec §8, component plan N8). Replaces the day-1 stub IN PLACE, same export.
 * The Kokonut ai-prompt composer (scope selector, Compass send button) rendered INLINE at the foot of a step or in the ClauseCard footer,
 * three suggested questions as a ruled list of 44 px text buttons, the ThoughtLine retrieval header (label = the real stage, the lookup
 * count when settled, no timer), and the answer list: parchment note blocks with Money-rendered refs, stitch chips that open the clause, the demo /
 * fixed-template / live label, the guard's dropped count. Never a right-hand column, never chat bubbles, no AI iconography. Answers clear
 * when the scope changes. States (spec §8.6): idle · sending · answered · nothing survived · live unavailable · rate limited · offline.
 * Additive props beyond the frozen contract: `data` (payloads for ref resolution; otherwise the AssistDataProvider or a lazy fetch) and
 * `heading` (false when the host section renders its own h3). The answer list is this surface's one aria-live region.
 */
export interface AskAboutStepProps {
  scope: AssistScope;
  /** Open the clause card for a stitch id (`"ML26#7"`). */
  onOpenStitch?: (stitchId: string) => void;
  /** Scroll to / select a pipeline step. */
  onOpenStep?: (lineIndex: number, stepIndex: number) => void;
  className?: string;
  /** Payloads the refs resolve against; anything missing is read from the AssistDataProvider or fetched after the first question. */
  data?: Partial<AssistData>;
  /** Render the h3 (default true; AskSection passes false and owns the heading). */
  heading?: boolean;
}

interface Answer { id: number; question: string; scope: AssistScope; resp: AssistResponseX; blocks: AssistBlockX[]; localDropped: number }

export function AskAboutStep({ scope, onOpenStitch, onOpenStep, className, data: dataProp, heading = true }: AskAboutStepProps) {
  const descId = useId();
  const scopeKey = JSON.stringify(scope);
  const [choice, setChoice] = useState<ScopeChoice>(() => scopeChoices(scope)[0]?.value ?? "plan");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [suggested, setSuggested] = useState<string[]>(() => initialSuggestions(scope));
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const [mode, setMode] = useState<ServerMode | null>(null);
  const [asked, setAsked] = useState(false);
  const seq = useRef(0);
  const gate = useRef(createRequestGate());   // an answer for an earlier scope never lands in this scope's list (web-correctness-14)
  const [cycle, setCycle] = useState(0);   // one ThoughtLine instance per question, so its timer runs from send to settle
  const { data, loading } = useAssistData(scope, dataProp, asked);

  useEffect(() => { serverMode().then(setMode); }, []);
  // answers belong to one scope: a new step, clause or plan clears them (spec §8.1)
  useEffect(() => {
    gate.current.invalidate(); setPending(null);
    setAnswers([]); setSuggested(initialSuggestions(scope)); setError(null); setChoice(scopeChoices(scope)[0]?.value ?? "plan");
  }, [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pausedUntil === null) return;
    const t = setTimeout(() => setPausedUntil(null), Math.max(0, pausedUntil - Date.now()));
    return () => clearTimeout(t);
  }, [pausedUntil]);

  const choices = useMemo(() => scopeChoices(scope), [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const isClause = !!scope.stitch;
  // a procedure line (the drawer) is "this step" copy, like a named step or checkpoint; only the whole-plan scope reads "this plan"
  const stepScoped = !!(scope.step_key || scope.checkpoint_key || scope.treatment_item_id || scope.line_index != null);
  const paused = pausedUntil !== null && pausedUntil > Date.now();

  const ask = useCallback(async (message: string, patch?: Partial<AssistScope>) => {
    const q = message.trim().slice(0, 400);
    if (!q || pending) return;
    const effective = { ...applyScopeChoice(scope, choice), ...(patch ?? {}) };
    setError(null); setAsked(true); setPending(q); setCycle((c) => c + 1);
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setError(ASSIST.offline); setPending(null); return; }
    const ticket = gate.current.begin();
    try {
      const resp = (await api.ask({ message: q, scope: effective })) as AssistResponseX;
      if (!gate.current.isCurrent(ticket)) return;
      const guarded = clientGuard(resp.blocks ?? []);
      setAnswers((a) => [...a, { id: ++seq.current, question: q, scope: effective, resp, blocks: guarded.blocks, localDropped: guarded.dropped }]);
      if (resp.suggested?.length) setSuggested(resp.suggested);
    } catch (e) {
      if (!gate.current.isCurrent(ticket)) return;
      if (e instanceof ApiError) {
        if (e.status === 429) { setError(ASSIST.rateLimited); setPausedUntil(Date.now() + RATE_LIMIT_PAUSE_MS); }
        else if (e.status === 404) setError(ASSIST.notFound);
        else setError(ASSIST.failed);
      } else setError(ASSIST.offline);
    } finally { if (gate.current.isCurrent(ticket)) setPending(null); }
  }, [scope, choice, pending]);

  const latest = answers[answers.length - 1];
  const lookupCount = latest ? lookupLabels(latest.resp.tools_used, data).length : 0;
  const preLabel = !answers.length && mode ? (mode.llm_mode === "live" && mode.llm_model ? ASSIST.liveLabel(mode.llm_model) : ASSIST.demoEnvironment) : null;

  return (
    <div className={cn("as-root", className)} data-scope={isClause ? "clause" : "step"}>
      {heading && <h3 className="as-h3">{isClause ? ASSIST.clauseHeading : stepScoped ? ASSIST.heading : ASSIST.planHeading}</h3>}
      <p id={descId} className="as-described">{ASSIST.describedBy}</p>
      {preLabel && <p className="as-mode">{preLabel}</p>}
      <AI_Prompt
        scopes={choices}
        scope={choice}
        onScopeChange={(v) => setChoice(v as ScopeChoice)}
        placeholder={isClause ? ASSIST.clausePlaceholder : stepScoped ? ASSIST.placeholder : ASSIST.planPlaceholder}
        sendLabel={ASSIST.send}
        label={isClause ? ASSIST.clauseHeading : stepScoped ? ASSIST.heading : ASSIST.planHeading}
        scopeLabel={ASSIST.scopeLabel}
        describedBy={descId}
        disabled={!!pending || paused}
        onSubmit={(v) => { void ask(v); }}
        className="as-composer"
      />
      <ul className="as-suggestions" aria-label={ASSIST.suggestionsLabel}>
        {suggested.map((q) => (
          <li key={q}><Button type="button" variant="ghost" size="touch" className="as-suggestion h-auto w-full justify-start whitespace-normal rounded-[var(--r-2)] text-left" disabled={!!pending || paused} onClick={() => { void ask(q); }}>{q}</Button></li>
        ))}
      </ul>
      {(pending || latest) && (
        <ThoughtLine
          key={cycle}
          working={!!pending}
          label={isClause ? ASSIST.sendingClause : ASSIST.sending}
          doneLabel={ASSIST.readIn(lookupCount)}
          showTimer={false}
          glyph={<Compass aria-hidden="true" />}
          glyphColor="var(--gold)"
          breathPeriod={2.4}
          breathDepth={0.3}
          collapseOnSettle={false}
          fontSize={14}
          className="as-thought"
        />
      )}
      {error && <p role="alert" className="as-error">{error}</p>}
      <ol className="as-answers" aria-live="polite" aria-label={ASSIST.answerHeading}>
        {answers.map((a) => {
          const ribbon = ribbonFor(a.resp, mode?.llm_mode ?? null);
          const dropped = a.resp.guard.dropped + a.localDropped;
          const grounding = a.resp.guard.grounding_failures;
          const hasSentence = a.blocks.some((b) => b.type === "sentence");
          const informational = a.resp.intent === "explain_step" || a.resp.intent === "explain_clause" || a.resp.intent === "where_from";
          return (
            <li key={a.id} className="as-answer" data-tone={ribbon?.tone ?? "live"}>
              <p className="as-asked">{ASSIST.asked(a.question)}</p>
              {ribbon && <p className={cn("as-ribbon", ribbon.tone === "live" ? "as-ribbon-live" : "ribbon")}>{ribbon.text}</p>}
              {loading && <p className="as-caption">{ASSIST.loadingData}</p>}
              <AnswerBlocks blocks={a.blocks} data={data} scope={a.scope} onOpenStitch={onOpenStitch} onOpenStep={onOpenStep} onClarify={(patch) => { void ask(a.question, patch); }} />
              {informational && !hasSentence && <p className="as-caption">{ASSIST.nothingSurvived}</p>}
              <div className="as-answer-foot">
                {dropped > 0 && <span className="as-guard">{ASSIST.guardRemoved(dropped)}</span>}
                {grounding > 0 && <span className="as-guard">{ASSIST.groundingRemoved(grounding)}</span>}
                {a.resp.tools_used.length > 0 && (
                  <span className="as-tools">{ASSIST.toolsUsed} {lookupLabels(a.resp.tools_used, data).join(" · ")}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default AskAboutStep;
