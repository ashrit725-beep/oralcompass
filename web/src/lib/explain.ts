import { api } from "./api";
import type { ExplainResponse } from "./ai-types";
import type { PlanRef, Stitch } from "./types";

/**
 * Clause explainer client (addendum D.5b): one request per (plan reference, clause), kept in memory for the session. A failed request is
 * forgotten (so a later open may retry) and the caller shows the PLAIN template instead. The server caches per plan version as well.
 */
const cache = new Map<string, Promise<ExplainResponse>>();

export const explainKey = (planRef: PlanRef, stitch: Pick<Stitch, "doc" | "page" | "quote">) => `${planRef}|${stitch.doc}#p${stitch.page}|${stitch.quote}`;

export function explainClause(planRef: PlanRef, stitch: Pick<Stitch, "doc" | "page" | "quote">): Promise<ExplainResponse> {
  const key = explainKey(planRef, stitch);
  let p = cache.get(key);
  if (!p) {
    p = api.explain({ plan_ref: planRef, stitch: `${stitch.doc}#p${stitch.page}`, quote: stitch.quote });
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** The PLAIN topic for a stitch (the clause card's existing mapping: a class membership stitch reads as coinsurance). */
export const plainTopic = (stitch: Pick<Stitch, "topic">) => (stitch.topic.startsWith("class:") ? "coinsurance" : stitch.topic);

export function clearExplainCache() { cache.clear(); }      // tests
