import { Compass } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import AI_Prompt from "@/components/kokonutui/ai-prompt";
import ThoughtLine from "@/components/ui/ThoughtLine";
import { Button } from "@/components/ui/button";
import { ASSIST } from "@/lib/copy/assistant";
import { applyScopeChoice, initialSuggestions, lookupLabels, scopeChoices, type AssistData, type ScopeChoice } from "@/lib/assistant";
import { cn } from "@/lib/utils";
import type { AssistScope } from "@/lib/types";
import { useAsk } from "@/hooks/useAsk";
import { AnswerList } from "./AnswerList";

/**
 * AskAboutStep (owner: web upload-review + assistant agent; spec §8, component plan N8). The step / clause composer: the Kokonut ai-prompt
 * composer (scope selector, Compass send button) INLINE at the foot of a step (the drawer's Ask section) or in the ClauseCard footer, the
 * suggested questions as a ruled list of 44 px text buttons, the ThoughtLine retrieval header (the real stage, the lookup count when
 * settled, no timer) and the answers. The question/answer logic is the shared `useAsk` hook and the answers render through the shared
 * `AnswerList` / `AnswerCard` (the same simple-terms layout the AskBox uses: "In simple terms" first, "Say it more simply", the details
 * behind "Show the details"). Never a right-hand column, never chat bubbles, no AI iconography. Answers clear when the scope changes.
 * States (spec §8.6): idle · sending · answered · nothing survived · live unavailable · rate limited · offline.
 * Additive props beyond the frozen contract: `data` (payloads for ref resolution; otherwise the AssistDataProvider or a lazy fetch) and
 * `heading` (false when the host section renders its own h3). One live region announces each answer once.
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

export function AskAboutStep({ scope, onOpenStitch, onOpenStep, className, data: dataProp, heading = true }: AskAboutStepProps) {
  const descId = useId();
  const scopeKey = JSON.stringify(scope);
  const choices = useMemo(() => scopeChoices(scope), [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [choice, setChoice] = useState<ScopeChoice>(() => choices[0]?.value ?? "plan");
  useEffect(() => { setChoice(choices[0]?.value ?? "plan"); }, [choices]);
  const firstSuggestions = useMemo(() => initialSuggestions(scope), [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const ask = useAsk({ scope, data: dataProp, adoptSuggestions: true, initialSuggestions: firstSuggestions });
  const { answers, suggested, pending, simplerFor, error, paused, mode, data, cycle } = ask;

  const isClause = !!scope.stitch;
  // a procedure line (the drawer) is "this step" copy, like a named step or checkpoint; only the whole-plan scope reads "this plan"
  const stepScoped = !!(scope.step_key || scope.checkpoint_key || scope.treatment_item_id || scope.line_index != null);
  const send = (q: string) => { void ask.ask(q, { scope: applyScopeChoice(scope, choice) }); };
  const busy = !!pending || simplerFor !== null;

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
        disabled={paused}
        busy={busy}
        onSubmit={(v) => send(v)}
        className="as-composer"
      />
      <ul className="as-suggestions" aria-label={ASSIST.suggestionsLabel}>
        {suggested.map((q) => (
          <li key={q}><Button type="button" variant="ghost" size="touch" className="as-suggestion h-auto w-full justify-start whitespace-normal rounded-[var(--r-2)] text-left" disabled={busy || paused} onClick={() => send(q)}>{q}</Button></li>
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
      <AnswerList ask={ask} onOpenStitch={onOpenStitch} onOpenStep={onOpenStep} nothingSurvived={ASSIST.nothingSurvived} />
    </div>
  );
}

export default AskAboutStep;
