import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { UI } from "../lib/copy";
import { circled } from "../lib/stitches";
import type { PlanEvidence, PlanSummary, PrivateDocument, SourceItem, Stitch } from "../lib/types";
import { EvidenceBadge } from "./Primitives";
import { StageLoader } from "./StageLoader";

// pdf.js (≈107 KB gzip) loads only when a stored PDF is rendered — never in the main chunk (component plan §3.2).
const PageView = lazy(() => import("./PageView").then((m) => ({ default: m.PageView })));

interface Props {
  planCode: string; plans: PlanSummary[]; onPlan: (code: string) => void; evidence: PlanEvidence | null; stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; onRetry: () => void;
  /** Hook point for the upload agent (spec §13.2): rendered inside "Your documents", above the stored-document list (the UploadWizard entry). */
  uploadSlot?: ReactNode;
}

/** Documents: the plan documents behind the rules (PDF with stitches when stored; otherwise quotes + page references + official link), your private records, sources, privacy. */
export function DocumentsView({ planCode, plans, onPlan, evidence, stitches, selected, onSelect, onRetry, uploadSlot }: Props) {
  const [mine, setMine] = useState<PrivateDocument[] | null>(null);
  const [sources, setSources] = useState<SourceItem[] | null>(null);
  const [audit, setAudit] = useState<any[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const summary = plans.find((p) => p.plan_code === planCode);
  const primary = evidence?.documents[0];
  useEffect(() => { api.myDocuments().then(setMine).catch(() => setMine([])); api.sources().then((r) => setSources(r.items)).catch(() => setSources([])); }, [planCode]);

  async function exportData() {
    const data = await api.exportMe();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "oralcompass-my-data.json"; a.click(); URL.revokeObjectURL(a.href);
    setMsg("A copy of your records was downloaded.");
  }
  async function deleteData() {
    if (!window.confirm(UI.deleteConfirm)) return;
    const r = await api.deleteMe(); setMsg(`Deleted: ${Object.entries(r.deleted).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing stored"}.`); setMine([]); onRetry();
  }
  const clauses = (evidence?.clauses ?? []).filter((c) => !filter || c.quote.toLowerCase().includes(filter.toLowerCase()) || c.field.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="documents">
      <section className="doc-plan" aria-labelledby="docs-h">
        <div className="doc-head">
          <h2 id="docs-h">Plan documents</h2>
          <label className="plan-pick">Plan <select value={planCode} onChange={(e) => onPlan(e.target.value)}>{plans.map((p) => <option key={p.plan_code} value={p.plan_code}>{p.title}{p.is_fictional ? " (fictional)" : ""}</option>)}</select></label>
        </div>
        {summary && <p className="muted">{summary.is_fictional ? UI.fictional : UI.realPlan}{summary.currency_note ? ` · ${UI.outdated}` : ""}</p>}
        {evidence?.documents.map((d) => (
          <article key={d.version_label} className="doc-card">
            <h3><span className="scope">{d.version_label}</span> {d.title}</h3>
            <p className="muted small">{d.publisher ?? ""}{d.document_date ? ` · dated ${d.document_date}` : ""}{d.pages ? ` · ${d.pages} pages` : ""} · retrieved {d.retrieved_at ?? "—"} · {d.role}</p>
            {d.url && <p><a href={d.url} target="_blank" rel="noreferrer">{UI.openSource}</a></p>}
            {!d.has_stored_pdf && d.role === "primary" && <p className="flag">The PDF is not stored in this build (binary downloads from this host were blocked); clauses below show the exact quote with its page reference, and the link opens the official document.</p>}
            {(d.access_limits?.length ?? 0) > 0 && <details><summary>Access limits recorded for this document ({d.access_limits!.length})</summary><ul className="plain-list small">{d.access_limits!.map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
            {d.reuse_terms && <p className="muted small">Reuse terms: {d.reuse_terms}</p>}
          </article>
        ))}
        {primary?.has_stored_pdf && primary.stored_path && (
          <Suspense fallback={<StageLoader label={UI.renderingDocument} size="sm" />}>
            <PageView url={`/${primary.stored_path.replace(/^fixtures\//, "fixtures/")}`} stitches={stitches.filter((s) => s.doc === primary.version_label)} selected={selected} onSelect={onSelect} />
          </Suspense>
        )}
        <h3>{UI.evidenceTitle} ({clauses.length})</h3>
        <label className="filter">Filter clauses <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="deductible, crown, page…" /></label>
        <ol className="clauses">
          {clauses.map((c) => {
            const st = stitches.find((s) => s.doc === c.doc && s.page === c.page && s.quote === c.quote);
            return (
              <li key={`${c.doc}-${c.n}`} className={selected && st && selected.id === st.id ? "is-selected" : ""}>
                <button type="button" className="clause-btn" onClick={() => st && onSelect(st)} aria-pressed={!!(selected && st && selected.id === st.id)}>
                  <span className="scope">{c.doc}</span> <span className="num">{st ? circled(st.n) : ""}</span> <q>{c.quote}</q>
                  <span className="where">— {c.page_note ?? `p.${c.page}`}{c.section ? ` · ${c.section}` : ""} · {c.field.replace(/\[\d+\]/g, "").replace(/[._]/g, " ")}{c.review_status === "needs_review" ? " · page attribution needs review" : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {(evidence?.conflicts?.length ?? 0) > 0 && (
          <section className="conflicts"><h3><EvidenceBadge status="CONFLICT" /> {UI.conflictTitle}</h3>
            {evidence!.conflicts!.map((c, i) => <article key={i} className="conflict"><h4>{c.field}</h4><p><q>{c.a.quote}</q> — {c.a.doc} ({c.a.date})</p><p><q>{c.b.quote}</q> — {c.b.doc} ({c.b.date})</p><p className="muted small">{c.note}</p></article>)}
          </section>
        )}
      </section>

      <section className="doc-mine" aria-labelledby="mine-h">
        <h2 id="mine-h">Your documents</h2>
        {uploadSlot}
        {mine === null ? <p className="muted">{UI.processing}</p> : mine.length === 0 ? <p className="muted">No private documents are stored. Plan documents you add, typed estimates and benefit statements appear here with their extraction status.</p> : (
          <ul className="plain-list">{mine.map((d) => <li key={d.id}><strong>{d.label ?? d.filename}</strong> <span className="muted">· {d.type ?? "upload"} · {d.extraction_status ?? "—"}</span>
            {(d.fields_needing_confirmation?.length ?? 0) > 0 && <ul className="small">{d.fields_needing_confirmation!.map((f) => <li key={f}><EvidenceBadge status="AMBIGUOUS" /> needs your confirmation: {f}</li>)}</ul>}
            {d.redaction_preview && <p className="small muted">Redaction preview removed: {d.redaction_preview.removed.join(", ") || "nothing"}</p>}</li>)}</ul>
        )}
        <p className="muted small">Uncertain extractions are listed as needing confirmation; nothing uncertain enters a calculation until confirmed.</p>
      </section>

      <section className="doc-sources" aria-labelledby="src-h">
        <h2 id="src-h">{UI.sourcesTitle}</h2>
        {sources === null ? <p className="muted">{UI.processing}</p> : (
          <ul className="sources">{sources.map((s) => (
            <li key={s.source_id}><details><summary><span className="scope">{s.version_label ?? "—"}</span> {s.title} <span className="muted">· {s.publisher}{s.document_date ? ` · ${s.document_date}` : ""} · {s.counts.facts} facts</span></summary>
              <p className="small"><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a></p>
              <p className="small">Scope: {s.scope?.geography ?? "—"} · {s.scope?.population ?? ""}</p>
              <p className="small">Effective: {s.effective_period?.start ?? "not stated"}{s.effective_period?.end ? ` – ${s.effective_period.end}` : ""} · retrieved {s.retrieved_at} · {s.retrieval_method}</p>
              <p className="small">Facts by status: {Object.entries(s.counts.by_status).map(([k, v]) => `${k} ${v}`).join(", ")} · supports {s.supports_plan_codes.join(", ") || "procedure codes / benchmarks"}</p>
              {s.access_limits.length > 0 && <details><summary>Access limits ({s.access_limits.length})</summary><ul className="small">{s.access_limits.map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
              {s.reuse_terms && <p className="small muted">Reuse: {s.reuse_terms}</p>}
            </details></li>
          ))}</ul>
        )}
      </section>

      <section className="privacy" aria-labelledby="priv-h">
        <h2 id="priv-h">{UI.privacyTitle}</h2>
        <p>{UI.privacyBody}</p>
        <div className="actions">
          <button type="button" onClick={exportData}>{UI.exportData}</button>
          <button type="button" className="danger" onClick={deleteData}>{UI.deleteData}</button>
          <button type="button" className="secondary" onClick={() => api.audit().then(setAudit)}>{UI.auditTitle}</button>
        </div>
        {msg && <p className="note" role="status">{msg}</p>}
        {audit && <table className="audit"><caption>{UI.auditTitle}</caption><thead><tr><th>when</th><th>action</th><th>type</th><th>id</th><th>outcome</th></tr></thead><tbody>{audit.slice(-25).map((e, i) => <tr key={i}><td>{new Date(e.ts * 1000).toLocaleTimeString()}</td><td>{e.action}</td><td>{e.type}</td><td className="mono">{String(e.id).slice(0, 8)}</td><td>{e.outcome}</td></tr>)}</tbody></table>}
      </section>
    </div>
  );
}
