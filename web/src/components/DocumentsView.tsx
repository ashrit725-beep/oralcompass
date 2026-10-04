import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { UI } from "@/lib/copy";
import { PLAN } from "@/lib/copy/plan";
import { ownedFileObjectUrl } from "@/lib/owned-file";
import { fastPathLabel, groupPlans, summaryFor, uploadLabel, type UploadEvidenceExtras, type UploadSummary } from "@/lib/plan-catalog";
import { circled } from "@/lib/stitches";
import { clauseSection, docMetaLine, groupClauses, type ClauseSection } from "@/lib/clauses";
import type { PlanEvidence, PlanRef, PlanSummary, PrivateDocument, SourceItem, Stitch, UploadedPlanSummary } from "@/lib/types";
import { isUpload } from "@/lib/types";
import { RemindersPanel } from "@/components/notifications/RemindersPanel";
import { EvidenceBadge } from "@/components/Primitives";
import { StageLoader } from "@/components/StageLoader";
import { UploadWizard } from "@/components/upload/UploadWizard";
import HoldButton from "@/components/ui/HoldButton";

// pdf.js (≈107 KB gzip) loads only when a stored PDF is rendered — never in the main chunk (component plan §3.2).
const PageView = lazy(() => import("./PageView").then((m) => ({ default: m.PageView })));

interface Props {
  planCode: PlanRef; plans: PlanSummary[]; onPlan: (code: PlanRef) => void; evidence: PlanEvidence | null; stitches: Stitch[]; selected?: Stitch; onSelect: (s: Stitch) => void; onRetry: () => void;
  /** Hook point for the upload agent (spec §13.2): rendered inside "Your documents", above the stored-document list. Defaults to the UploadWizard entry. */
  uploadSlot?: ReactNode;
  /** Called after a publish from the default wizard mount (the shell then re-estimates). */
  onPublished?: (summary: UploadedPlanSummary, planRef: PlanRef) => void;
}

/**
 * Documents (spec §2.2): the plan documents behind the rules (the pdf.js page with stitches when the PDF is stored, for presets from
 * /fixtures and for your uploads through the owner-checked file endpoint; otherwise quotes + page references + the official link), the
 * clause list with its filter, conflicts, "Your documents" (the UploadWizard entry, your private records, the reminders mount point),
 * sources and privacy controls. For an uploaded plan the two wording lists the extractor set aside are shown and never acted on.
 */
export function DocumentsView({ planCode, plans, onPlan, evidence, stitches, selected, onSelect, onRetry, uploadSlot, onPublished }: Props) {
  const [mine, setMine] = useState<PrivateDocument[] | null>(null);
  const [uploads, setUploads] = useState<UploadSummary[]>([]);
  const [sources, setSources] = useState<SourceItem[] | null>(null);
  const [audit, setAudit] = useState<any[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [ownedUrl, setOwnedUrl] = useState<string | null>(null);
  const summary = summaryFor(planCode, plans, uploads);
  const upload = isUpload(planCode) ? (summary as UploadSummary | null) : null;
  const ev = evidence as (PlanEvidence & UploadEvidenceExtras) | null;
  const primary = evidence?.documents[0];
  const carriers = groupPlans(plans);
  const refreshUploads = () => api.myPlans().then((r) => setUploads(r.items as UploadSummary[])).catch(() => setUploads([]));
  useEffect(() => { api.myDocuments().then(setMine).catch(() => setMine([])); api.sources().then((r) => setSources(r.items)).catch(() => setSources([])); refreshUploads(); }, [planCode]);

  // an uploaded plan's PDF is private: fetched with the owner header into an object URL, revoked when the page changes
  const ownedPath = primary?.has_stored_pdf && primary.stored_path?.startsWith("/me/") ? primary.stored_path : null;
  useEffect(() => {
    let url: string | null = null; let cancelled = false;
    setOwnedUrl(null);
    if (ownedPath) ownedFileObjectUrl(ownedPath).then((u) => { if (cancelled) URL.revokeObjectURL(u); else { url = u; setOwnedUrl(u); } }).catch(() => setOwnedUrl(null));
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [ownedPath]);

  async function exportData() {
    const data = await api.exportMe();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "oralcompass-my-data.json"; a.click(); URL.revokeObjectURL(a.href);
    setMsg(PLAN.docsExported);
  }
  // The one irreversible action is a deliberate 1.6 s hold in the product's palette, with the consequence stated above it (delight pass
  // rb-04; it replaces the browser's grey confirm dialog). A tap only explains; releasing early undoes the fill.
  async function deleteData() {
    const r = await api.deleteMe(); setMsg(PLAN.docsDeleted(Object.entries(r.deleted).map(([k, v]) => `${v} ${k}`).join(", ") || PLAN.docsNothingStored)); setMine([]); onRetry();
  }
  const clauses = (evidence?.clauses ?? []).filter((c) => !filter || c.quote.toLowerCase().includes(filter.toLowerCase()) || c.field.toLowerCase().includes(filter.toLowerCase()));
  // slop-23: one row per distinct sentence (every field it supports, in plain words), grouped by plan section; only the first section
  // (or the one holding the selected stitch, or every section while filtering) starts open
  const groups = useMemo(() => groupClauses(clauses), [clauses]);
  const rowCount = groups.reduce((n, g) => n + g.rows.length, 0);
  const [openSecs, setOpenSecs] = useState<Partial<Record<ClauseSection, boolean>>>({});
  useEffect(() => {
    const hit = selected && (evidence?.clauses ?? []).find((c) => c.doc === selected.doc && c.page === selected.page && c.quote === selected.quote);
    if (hit) setOpenSecs((o) => ({ ...o, [clauseSection(hit.field)]: true }));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageUrl = primary?.has_stored_pdf && primary.stored_path ? (ownedPath ? ownedUrl : `/${primary.stored_path.replace(/^fixtures\//, "fixtures/")}`) : null;

  return (
    <div className="documents">
      <section className="doc-plan" aria-labelledby="docs-h">
        <div className="doc-head">
          <h2 id="docs-h">{PLAN.docsPlan}</h2>
          <label className="plan-pick">{PLAN.planCode}
            <select value={planCode} onChange={(e) => onPlan(e.target.value)}>
              {!summary && <option value="">{PLAN.cmpNone}</option>}
              {carriers.filter((c) => !c.fictional).map((c) => <optgroup key={c.key} label={c.label}>{c.plans.flatMap((p) => p.years.map((y) => <option key={y.code} value={y.code}>{fastPathLabel(y.summary)}</option>))}</optgroup>)}
              {carriers.some((c) => c.fictional) && <optgroup label={PLAN.fictionalGroup}>{carriers.filter((c) => c.fictional).flatMap((c) => c.plans.flatMap((p) => p.years.map((y) => <option key={y.code} value={y.code}>{fastPathLabel(y.summary)}</option>)))}</optgroup>}
              {uploads.length > 0 && <optgroup label={PLAN.uploadsGroup}>{uploads.map((u) => <option key={u.plan_code} value={u.plan_code}>{uploadLabel(u)}</option>)}</optgroup>}
            </select>
          </label>
        </div>
        {summary && <p className="muted">{upload ? <><span className="ribbon">{PLAN.uploadedRibbon(upload.version_label)}</span> {upload.banner ?? ""}</> : summary.is_fictional ? UI.fictional : UI.realPlan}{summary.currency_note ? ` · ${UI.outdated}` : ""}</p>}
        {upload?.versions && upload.versions.length > 1 && <p className="muted small">{PLAN.docsVersions(upload.versions.join(", "))}</p>}
        {evidence?.documents.map((d) => (
          <article key={d.version_label} className="doc-card">
            <h3><span className="scope">{d.version_label}</span> {d.title}</h3>
            <p className="muted small">{docMetaLine([d.publisher, d.document_date && `${PLAN.docsDated} ${d.document_date}`, d.pages ? `${d.pages} ${PLAN.docsPages}` : null, d.retrieved_at && `${PLAN.docsRetrieved} ${d.retrieved_at}`, d.role])}</p>
            {d.url && <p><a href={d.url} target="_blank" rel="noreferrer">{UI.openSource}</a></p>}
            {!d.has_stored_pdf && d.role === "primary" && <p className="flag">{PLAN.docsNotStoredPdf}</p>}
            {d.has_stored_pdf && d.stored_path?.startsWith("/me/") && <p className="muted small">{PLAN.docsUploadedPdf}</p>}
            {(d.access_limits?.length ?? 0) > 0 && <details><summary>{PLAN.docsAccessLimits(d.access_limits!.length)}</summary><ul className="plain-list small">{d.access_limits!.map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
            {d.reuse_terms && <p className="muted small">{PLAN.docsReuse} {d.reuse_terms}</p>}
          </article>
        ))}
        {pageUrl && primary && (
          <Suspense fallback={<StageLoader label={UI.renderingDocument} size="sm" />}>
            <PageView url={pageUrl} stitches={stitches.filter((s) => s.doc === primary.version_label)} selected={selected} onSelect={onSelect} />
          </Suspense>
        )}
        {ownedPath && !ownedUrl && <StageLoader label={UI.renderingDocument} size="sm" />}
        <h3>{UI.evidenceTitle} ({rowCount})</h3>
        <label className="filter">{PLAN.docsFilter} <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={PLAN.docsFilterPlaceholder} /></label>
        <div className="clause-groups">
          {groups.map((g, gi) => (
            <details key={g.section} className="clause-group" open={!!filter || (openSecs[g.section] ?? gi === 0)}
                     onToggle={(e) => { const open = e.currentTarget.open; if (!filter) setOpenSecs((o) => (o[g.section] === open ? o : { ...o, [g.section]: open })); }}>
              <summary className="clause-group-head">{g.title} <span className="muted">({g.rows.length})</span></summary>
              <ol className="clauses">
                {g.rows.map((r) => {
                  const c = r.first;
                  const st = stitches.find((s) => s.doc === c.doc && s.page === c.page && s.quote === c.quote);
                  const isSel = !!(selected && st && selected.id === st.id);
                  return (
                    <li key={r.key} className={isSel ? "is-selected" : ""}>
                      <button type="button" className="clause-btn" onClick={() => st && onSelect(st)} aria-pressed={isSel}>
                        <span className="scope">{c.doc}</span> <span className="num">{st ? circled(st.n) : ""}</span> <q>{c.quote}</q>
                        <span className="where">{docMetaLine([c.page_note ?? (c.page != null ? `p.${c.page}` : null), c.section, r.labels.join(", "), r.all.some((x) => x.review_status === "needs_review") && PLAN.docsPageReview])}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </details>
          ))}
        </div>
        {(evidence?.conflicts?.length ?? 0) > 0 && (
          <section className="conflicts"><h3><EvidenceBadge status="CONFLICT" /> {UI.conflictTitle}</h3>
            {evidence!.conflicts!.map((c, i) => <article key={i} className="conflict"><h4>{c.field}</h4><p><q>{c.a.quote}</q> ({c.a.doc}, {c.a.date})</p><p><q>{c.b.quote}</q> ({c.b.doc}, {c.b.date})</p><p className="muted small">{c.note}</p></article>)}
          </section>
        )}
        {upload && (ev?.ignored_wording?.length ?? 0) > 0 && (
          <section className="doc-wording"><h3>{PLAN.docsIgnoredTitle}</h3>{ev?.notes?.ignored_wording && <p className="muted small">{ev.notes.ignored_wording}</p>}
            <ul className="plain-list small">{ev!.ignored_wording!.map((w, i) => <li key={i}><q>{w.quote}</q> (p.{w.page})</li>)}</ul></section>
        )}
        {upload && (ev?.unmatched_wording?.length ?? 0) > 0 && (
          <section className="doc-wording"><h3>{PLAN.docsUnmatchedTitle}</h3>{ev?.notes?.unmatched_wording && <p className="muted small">{ev.notes.unmatched_wording}</p>}
            <ul className="plain-list small">{ev!.unmatched_wording!.map((w, i) => <li key={i}><q>{w.wording}</q>{w.context ? <span className="muted"> · {w.context}</span> : null}</li>)}</ul></section>
        )}
      </section>

      <section className="doc-mine" aria-labelledby="mine-h">
        <h2 id="mine-h">{PLAN.docsMine}</h2>
        {uploadSlot ?? <UploadWizard planRef={planCode} onPublished={(s, ref) => { refreshUploads(); onPlan(ref); onPublished?.(s, ref); }} />}
        <RemindersPanel refreshKey={planCode} />
        {mine === null ? <p className="muted">{UI.processing}</p> : mine.length === 0 ? <p className="muted">{PLAN.docsNoPrivate}</p> : (
          <ul className="plain-list">{mine.map((d) => <li key={d.id}><strong>{d.label ?? d.filename}</strong> <span className="muted">· {d.type ?? "upload"} · {d.extraction_status ?? UI.notStated}</span>
            {(d.fields_needing_confirmation?.length ?? 0) > 0 && <ul className="small">{d.fields_needing_confirmation!.map((f) => <li key={f}><EvidenceBadge status="AMBIGUOUS" /> {PLAN.docsNeedsConfirmation} {f}</li>)}</ul>}
            {d.redaction_preview && <p className="small muted">{PLAN.docsRedactionRemoved} {d.redaction_preview.removed.join(", ") || PLAN.docsNothing}</p>}</li>)}</ul>
        )}
        <p className="muted small">{PLAN.docsUncertain}</p>
      </section>

      <section className="doc-sources" aria-labelledby="src-h">
        <h2 id="src-h">{UI.sourcesTitle}</h2>
        {sources === null ? <p className="muted">{UI.processing}</p> : (
          <ul className="sources">{sources.map((s) => (
            <li key={s.source_id}><details><summary><span className="scope">{s.version_label ?? "·"}</span> {s.title} <span className="muted">· {s.publisher}{s.document_date ? ` · ${s.document_date}` : ""} · {s.counts.facts} facts</span></summary>
              <p className="small"><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a></p>
              <p className="small">Scope: {s.scope?.geography ?? UI.notStated} · {s.scope?.population ?? ""}</p>
              <p className="small">Effective: {s.effective_period?.start ?? "not stated"}{s.effective_period?.end ? ` to ${s.effective_period.end}` : ""} · {PLAN.docsRetrieved} {s.retrieved_at} · {s.retrieval_method}</p>
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
          <button type="button" className="secondary" onClick={() => api.audit().then(setAudit)}>{UI.auditTitle}</button>
        </div>
        <div className="delete-hold">
          <p className="delete-hold-why">{UI.deleteConfirm}</p>
          <HoldButton onHold={deleteData} onTap={() => setMsg(UI.deleteTap)} holdTime={1600} size="lg" resetAfter={0}
                      backgroundColor="var(--paper-deep)" fillColor="var(--terracotta)" textColor="var(--ink)" fillTextColor="var(--paper)" doneLabel={UI.deleting}
                      className="delete-hold-btn">
            {UI.deleteHold}
          </HoldButton>
        </div>
        {msg && <p className="note" role="status">{msg}</p>}
        {audit && <table className="audit"><caption>{UI.auditTitle}</caption><thead><tr><th>when</th><th>action</th><th>type</th><th>id</th><th>outcome</th></tr></thead><tbody>{audit.slice(-25).map((e, i) => <tr key={i}><td>{new Date(e.ts * 1000).toLocaleTimeString()}</td><td>{e.action}</td><td>{e.type}</td><td className="mono">{String(e.id).slice(0, 8)}</td><td>{e.outcome}</td></tr>)}</tbody></table>}
      </section>
    </div>
  );
}
