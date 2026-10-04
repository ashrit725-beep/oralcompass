/**
 * The client side of the upload contract (client redaction design points 3 and 5): the `client_redaction` field and the fictional sample.
 * Imported only by the lazily loaded upload wizard, so the detector (lib/redact.ts) stays out of the main chunk.
 */
import { REDACTION_VERSION, type IdentifierCategory, type RedactionResult } from "./redact";

export const CLIENT_REDACTION_LIMITS = { identifiers: 300, valueMin: 2, valueMax: 120, terms: 20, termMax: 64, bytes: 64 * 1024 } as const;

export interface ClientRedactionPayload {
  version: number;
  identifiers: { category: IdentifierCategory; value: string }[];
  extra_terms: string[];
}

/** The multipart `client_redaction` field (upload contract, design point 3): every identifier the person left removed, with its value, so
 *  the server removes each occurrence from the text it reads before any model call; plus the person's own terms. Values outside the
 *  contract's 2..120 characters are left to the server's own patterns (a value that long is not an identifier). Within the limits. */
export function buildClientRedaction(result: Pick<RedactionResult, "removed">, terms: readonly string[]): ClientRedactionPayload {
  const L = CLIENT_REDACTION_LIMITS;
  const seen = new Set<string>();
  const identifiers: ClientRedactionPayload["identifiers"] = [];
  for (const f of result.removed) {
    const value = f.value.trim();
    const key = `${f.category}|${value.toLowerCase()}`;
    if (value.length < L.valueMin || value.length > L.valueMax || seen.has(key)) continue;
    seen.add(key);
    identifiers.push({ category: f.category, value });
    if (identifiers.length >= L.identifiers) break;
  }
  const extra_terms = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= L.valueMin && t.length <= L.termMax))].slice(0, L.terms);
  const payload: ClientRedactionPayload = { version: REDACTION_VERSION, identifiers, extra_terms };
  // the 64 KB cap: drop identifiers from the end until the JSON fits (only reachable with hundreds of long values)
  while (identifiers.length && new TextEncoder().encode(JSON.stringify(payload)).length > L.bytes) identifiers.pop();
  return payload;
}

/** The clearly fictional sample statement (design point 5), read in the browser and sent down the SAME client path as a picked file. */
/** (red/sample: fixtures/documents/tw26_fictional_sample_statement.pdf, Tidewater Dental Select 2026, TW26; served from /fixtures by
 *  api/app/server.py in production and by the preview once fixtures are copied into web/public/fixtures.) */
export const SAMPLE_STATEMENT = { path: "/fixtures/documents/tw26_fictional_sample_statement.pdf", name: "tw26_fictional_sample_statement.pdf" } as const;

export async function loadSampleStatement(fetcher: typeof fetch = fetch): Promise<File> {
  const r = await fetcher(SAMPLE_STATEMENT.path);
  if (!r.ok) throw new Error(`sample ${r.status}`);
  const blob = await r.blob();
  return new File([blob], SAMPLE_STATEMENT.name, { type: "application/pdf" });
}
