import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { EMPTY_DATA, type AssistData } from "@/lib/assistant";
import { stitchesFromClauses } from "@/lib/stitches";
import type { AssistScope } from "@/lib/types";

/**
 * AssistData (spec §8.2 "the client replaces placeholders with values from the payloads it already holds"). The assistant never asks the
 * server for an amount: refs resolve against the estimate / plan / benefits / rules / treatment items / stitches. Three ways to supply them,
 * in priority order: the `data` prop on AskAboutStep, this provider (mount once with `useAppData()` values), and a lazy owner-scoped fetch
 * that runs only after the first question is sent (so opening a drawer costs nothing). Everything fetched here is read-only.
 */
export const AssistDataContext = createContext<Partial<AssistData> | null>(null);

export function AssistDataProvider({ value, children }: { value: Partial<AssistData>; children: ReactNode }) {
  return <AssistDataContext.Provider value={value}>{children}</AssistDataContext.Provider>;
}

export type ServerMode = { llm_mode: "demo" | "live"; llm_model: string | null };
let healthCache: Promise<ServerMode> | null = null;
/** /health, cached for the session: pre-labels the composer before the first answer (the per-response mode/ribbon stay authoritative). */
export const serverMode = (): Promise<ServerMode> =>
  (healthCache ??= api.health().then((h) => ({ llm_mode: h.llm_mode, llm_model: h.llm_model ?? null })).catch(() => { healthCache = null; return { llm_mode: "demo" as const, llm_model: null }; }));

function merge(base: Partial<AssistData> | null, over: Partial<AssistData> | undefined): Partial<AssistData> {
  const out: Partial<AssistData> = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(over ?? {})) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

const has = (d: Partial<AssistData>, k: keyof AssistData) => {
  const v = d[k];
  return v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);
};

/** Merge provided data and, once `enabled`, fetch whatever the scope needs that nobody supplied. */
export function useAssistData(scope: AssistScope, override: Partial<AssistData> | undefined, enabled: boolean): { data: AssistData; loading: boolean } {
  const ctx = useContext(AssistDataContext);
  const provided = useMemo(() => merge(ctx, override), [ctx, override]);
  const [fetched, setFetched] = useState<Partial<AssistData>>({});
  const [loading, setLoading] = useState(false);
  const key = `${scope.plan_ref}|${scope.estimate_id ?? ""}`;

  useEffect(() => { setFetched({}); }, [key]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const jobs: Promise<void>[] = [];
    const put = (k: keyof AssistData, v: AssistData[typeof k]) => { if (!cancelled) setFetched((f) => ({ ...f, [k]: v })); };
    if (!has(provided, "estimate") && scope.estimate_id) jobs.push(api.savedEstimates().then((list) => put("estimate", list.find((e) => e.id === scope.estimate_id) ?? null)).catch(() => undefined));
    if (!has(provided, "plan")) jobs.push(api.planByRef(scope.plan_ref).then((r) => put("plan", r.model)).catch(() => undefined));
    if (!has(provided, "benefits")) jobs.push(api.benefitsFor(scope.plan_ref).then((b) => put("benefits", b)).catch(() => put("benefits", null)));
    if (!has(provided, "rules")) jobs.push(api.rulesByRef(scope.plan_ref).then((r) => put("rules", r.rules)).catch(() => undefined));
    if (!has(provided, "items")) jobs.push(api.treatmentItems().then((it) => put("items", it)).catch(() => undefined));
    if (!has(provided, "stitches")) jobs.push(api.evidenceByRef(scope.plan_ref).then((ev) => put("stitches", stitchesFromClauses(ev.clauses))).catch(() => undefined));
    if (!jobs.length) return;
    setLoading(true);
    Promise.all(jobs).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  const data = useMemo<AssistData>(() => {
    const m = merge(merge(fetched, provided), undefined);
    return { ...EMPTY_DATA, ...m, rules: m.rules ?? [], items: m.items ?? [], stitches: m.stitches ?? [] };
  }, [fetched, provided]);
  return { data, loading };
}
