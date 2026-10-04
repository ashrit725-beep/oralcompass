/**
 * The server's redaction summary (client redaction design point 4), read defensively from any response that carries it. Kept in its own
 * dependency-free module so views outside the lazy upload chunk (DocumentsView) can show the count without pulling in pdf.js or the detector.
 */
import type { IdentifierCategory } from "./redact";

/** The server's authoritative count (design point 4): `redaction_preview.summary` on the upload response and the document record, and the
 *  same object on GET extraction. Masked values only; raw values never come back. */
export interface ServerRedactionSummary {
  total: number;
  by_category: Partial<Record<IdentifierCategory, number>>;
  occurrences: number;
  from_device: number;
  from_server_check: number;
  masked: { category: IdentifierCategory | string; masked: string; occurrences: number }[];
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

function asSummary(x: unknown): ServerRedactionSummary | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!isCount(o.total)) return null;
  const by = o.by_category && typeof o.by_category === "object" ? (o.by_category as Record<string, unknown>) : {};
  const by_category: Partial<Record<IdentifierCategory, number>> = {};
  for (const [k, v] of Object.entries(by)) if (isCount(v)) by_category[k as IdentifierCategory] = v;
  const masked = Array.isArray(o.masked)
    ? o.masked.filter((m): m is ServerRedactionSummary["masked"][number] => !!m && typeof m === "object" && typeof (m as { masked?: unknown }).masked === "string")
    : [];
  return { total: o.total, by_category, occurrences: isCount(o.occurrences) ? o.occurrences : 0, from_device: isCount(o.from_device) ? o.from_device : 0,
    from_server_check: isCount(o.from_server_check) ? o.from_server_check : 0, masked };
}

/** The server summary wherever a response carries it: `redaction_preview.summary` (upload, document record), `redaction_summary` or
 *  `redaction.summary` (GET extraction). Null when the server sent none (an older API): the UI then shows no server count. */
export function serverRedactionSummary(x: unknown): ServerRedactionSummary | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const nested = (k: string) => (o[k] && typeof o[k] === "object" ? (o[k] as Record<string, unknown>).summary : undefined);
  return asSummary(nested("redaction_preview")) ?? asSummary(o.redaction_summary) ?? asSummary(nested("redaction"));
}

