import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { ASSIST } from "@/lib/copy/assistant";
import type { AskPlanChoice } from "@/lib/ask-plans";
import { clientGuard, createRequestGate, type AssistBlockX, type AssistData, type AssistResponseX, type AssistStyle } from "@/lib/assistant";
import type { AssistScope } from "@/lib/types";
import { serverMode, useAssistData, type ServerMode } from "@/components/assistant/AssistData";

export const RATE_LIMIT_PAUSE_MS = 20_000;

/** One answer as rendered: the server response after the client's amount guard, plus the "Say it more simply" follow-up when asked. */
export interface AskAnswer {
  id: number;
  question: string;
  scope: AssistScope;
  resp: AssistResponseX;
  blocks: AssistBlockX[];
  localDropped: number;
  /** The prompt box's plan letter this answer was asked with (one plan per answer). */
  planChoice?: AskPlanChoice;
  simpler?: { resp: AssistResponseX; blocks: AssistBlockX[]; localDropped: number } | null;
}

export interface UseAskOptions {
  /** The base scope: a change clears the answers (answers belong to one scope, spec §8.1). */
  scope: AssistScope;
  /** Payloads the refs resolve against (otherwise the AssistDataProvider, then a lazy fetch after the first question). */
  data?: Partial<AssistData>;
  /** Keep the answers for this key across unmounts (the AskBox: one list per tab, so leaving a tab and coming back keeps them). */
  memoryKey?: string;
  /** Adopt the server's `suggested` questions after an answer (the step/clause composer does; the AskBox keeps its everyday chips). */
  adoptSuggestions?: boolean;
  initialSuggestions?: string[];
  /** The prompt box's plan dropdown (AssistIn.plan_choice): the server answers cost questions for that plan. */
  planChoice?: AskPlanChoice;
}

export interface AskApi {
  answers: AskAnswer[];
  suggested: string[];
  /** The question in flight (null when idle). */
  pending: string | null;
  /** The answer id whose plainer version is in flight. */
  simplerFor: number | null;
  error: string | null;
  paused: boolean;
  mode: ServerMode | null;
  data: AssistData;
  loading: boolean;
  /** Increments per question: one ThoughtLine instance per question. */
  cycle: number;
  /** Ask a question. `scope` overrides the base scope for this one question (the scope selector); `patch` narrows it (clarify). */
  ask: (message: string, opts?: { scope?: AssistScope; patch?: Partial<AssistScope> }) => Promise<void>;
  /** "Say it more simply": re-ask the answer's question with style "simpler"; the result is attached to that answer. */
  askSimpler: (answerId: number) => Promise<void>;
}

/** Answers kept per memory key for the session (in memory only; nothing is stored in the browser). */
const memory = new Map<string, { scopeKey: string; answers: AskAnswer[]; seq: number }>();

/** Test hook: forget every remembered answer list. */
export const clearAskMemory = () => memory.clear();

/**
 * useAsk — the one question/answer controller behind every composer (the drawer's "Ask about this step", the ClauseCard footer and the
 * AskBox on each tab). It owns: the latest-request gate (an answer for an earlier scope or an older question never lands, web-correctness-14),
 * the client amount guard, the rate-limit pause, offline / not-found / live-unavailable errors, the lazy payload fetch for ref resolution,
 * and the "Say it more simply" re-ask (style "simpler") attached to the answer it simplifies.
 */
export function useAsk({ scope, data: dataProp, memoryKey, adoptSuggestions = true, initialSuggestions = [], planChoice }: UseAskOptions): AskApi {
  const scopeKey = JSON.stringify(scope);
  const remembered = memoryKey ? memory.get(memoryKey) : undefined;
  const fresh = remembered && remembered.scopeKey === scopeKey ? remembered : undefined;
  const [answers, setAnswers] = useState<AskAnswer[]>(() => fresh?.answers ?? []);
  const [suggested, setSuggested] = useState<string[]>(initialSuggestions);
  const [pending, setPending] = useState<string | null>(null);
  const [simplerFor, setSimplerFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const [mode, setMode] = useState<ServerMode | null>(null);
  const [asked, setAsked] = useState(!!fresh?.answers.length);
  const [cycle, setCycle] = useState(0);
  const seq = useRef(fresh?.seq ?? 0);
  const gate = useRef(createRequestGate());
  const busy = useRef(false);
  const { data, loading } = useAssistData(scope, dataProp, asked);

  useEffect(() => { let live = true; serverMode().then((m) => { if (live) setMode(m); }); return () => { live = false; }; }, []);

  // a new scope (another step, clause, plan or estimate) clears the answers; the first run keeps what memory restored
  const lastScope = useRef(scopeKey);
  useEffect(() => {
    if (lastScope.current === scopeKey) return;      // idempotent (StrictMode re-runs effects on mount)
    lastScope.current = scopeKey;
    gate.current.invalidate(); busy.current = false;
    setPending(null); setSimplerFor(null); setAnswers([]); setError(null); setSuggested(initialSuggestions); seq.current = 0;
  }, [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // the composer's own suggestions follow its scope (step → step questions); the AskBox passes its tab chips
  const suggestionKey = initialSuggestions.join("\u0000");
  useEffect(() => { if (!adoptSuggestions || !answers.length) setSuggested(initialSuggestions); }, [suggestionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!memoryKey) return;
    memory.set(memoryKey, { scopeKey, answers, seq: seq.current });
  }, [memoryKey, scopeKey, answers]);

  useEffect(() => {
    if (pausedUntil === null) return;
    const t = setTimeout(() => { setPausedUntil(null); setError((e) => (e === ASSIST.rateLimited ? null : e)); }, Math.max(0, pausedUntil - Date.now()));
    return () => clearTimeout(t);
  }, [pausedUntil]);

  // an answer that arrives after unmount is dropped by the gate
  useEffect(() => () => { gate.current.invalidate(); }, []);

  const paused = pausedUntil !== null && pausedUntil > Date.now();

  const failure = useCallback((e: unknown) => {
    if (e instanceof ApiError) {
      if (e.status === 429) { setError(ASSIST.rateLimited); setPausedUntil(Date.now() + RATE_LIMIT_PAUSE_MS); }
      else if (e.status === 404) setError(ASSIST.notFound);
      else if (e.status === 503 || e.status === 502 || e.status === 504) setError(ASSIST.liveUnavailable);
      else setError(ASSIST.failed);
    } else setError(ASSIST.offline);
  }, []);

  const send = useCallback(async (message: string, scopeFor: AssistScope, style: AssistStyle, choice?: AskPlanChoice) => {
    const resp = (await api.ask({ message, scope: scopeFor, style, ...(choice ? { plan_choice: choice } : {}) })) as AssistResponseX;
    const guarded = clientGuard(resp.blocks ?? []);
    return { resp, blocks: guarded.blocks, localDropped: guarded.dropped };
  }, []);

  const ask = useCallback<AskApi["ask"]>(async (message, opts) => {
    const q = message.trim().slice(0, 400);
    if (!q || busy.current || paused) return;
    const effective: AssistScope = { ...(opts?.scope ?? scope), ...(opts?.patch ?? {}) };
    setError(null); setAsked(true);
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setError(ASSIST.offline); return; }
    busy.current = true; setPending(q); setCycle((c) => c + 1);
    const ticket = gate.current.begin();
    try {
      const out = await send(q, effective, "plain", planChoice);
      if (!gate.current.isCurrent(ticket)) return;
      setAnswers((a) => [...a, { id: ++seq.current, question: q, scope: effective, planChoice, ...out, simpler: undefined }]);
      if (adoptSuggestions && out.resp.suggested?.length) setSuggested(out.resp.suggested);
    } catch (e) {
      if (gate.current.isCurrent(ticket)) failure(e);
    } finally {
      if (gate.current.isCurrent(ticket)) { busy.current = false; setPending(null); }
    }
  }, [scope, paused, send, failure, adoptSuggestions, planChoice]);

  const askSimpler = useCallback<AskApi["askSimpler"]>(async (answerId) => {
    const target = answers.find((a) => a.id === answerId);
    if (!target || busy.current || paused) return;
    setError(null);
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setError(ASSIST.offline); return; }
    busy.current = true; setSimplerFor(answerId);
    const ticket = gate.current.begin();
    try {
      const out = await send(target.question, target.scope, "simpler", target.planChoice);
      if (!gate.current.isCurrent(ticket)) return;
      setAnswers((list) => list.map((a) => (a.id === answerId ? { ...a, simpler: out } : a)));
    } catch (e) {
      if (gate.current.isCurrent(ticket)) failure(e);
    } finally {
      if (gate.current.isCurrent(ticket)) { busy.current = false; setSimplerFor(null); }
    }
  }, [answers, paused, send, failure]);

  return { answers, suggested, pending, simplerFor, error, paused, mode, data, loading, cycle, ask, askSimpler };
}

export default useAsk;
