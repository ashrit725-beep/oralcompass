import { useState } from "react";
import { ATTRIBUTION, DRAWER, UI, type LandmarkId } from "../lib/copy";
import { PASSAGE } from "../lib/copy/passage";
import { attributionLabel, dateLabel, nextCheckpoint, stageProgress, statusLabel } from "../lib/journey";
import { money } from "../lib/stitches";
import type { Checkpoint, JourneyLinks, JourneyView, SavedEstimate, Stage } from "../lib/types";
import type { StageSelection as Selection } from "../lib/types";
import { EvidenceBadge } from "./Primitives";
import { Sheet } from "./Primitives/Sheet";

interface Props {
  view: JourneyView; selection: Selection; onSelect: (s: Selection) => void; onOpenLandmark: (id: LandmarkId) => void; onOpenDocuments: () => void;
  onPatch: (cpId: string, body: { status?: string; completed_by?: string; date?: string; date_source?: string; note?: string }) => Promise<void>;
  onInstructions: (stageId: string, text: string, source: string, givenOn?: string) => Promise<void>;
  busy: boolean; onClose: () => void;
  /** The live estimate (useAppData): the same figures the map, the Answers log and the Harbor Light show. The journey view's
   *  `links.latest_estimate` is a snapshot taken when the journey was fetched and goes stale after a re-estimate. */
  estimate: SavedEstimate | null;
  /** Phone: where focus returns when the sheet closes (the stage or checkpoint button that opened it). */
  returnFocus?: HTMLElement | null;
}

/**
 * The shared modal `Sheet` (mobile-only direction 2026-10-04: the desktop side panel was removed) (vaul over Radix Dialog: aria-modal,
 * focus moves in and is trapped, the page behind is inert, scrim, scroll lock, drag or Escape to close, 44 × 44 close button, safe-area
 * padding), so keyboard focus never lands on controls hidden under a fixed panel (WCAG 2.2 SC 2.4.11). It opens only when the person
 * selects a stage or checkpoint. Shows the selected stage or checkpoint: status, explanation, dates/amounts/documents, source, next action.
 */
export function DetailPanel(props: Props) {
  const { view, selection, onClose, returnFocus } = props;
  const stage = view.journey.stages.find((s) => s.id === selection.stageId);
  if (!stage) return null;
  const cp = selection.cpId ? stage.checkpoints.find((c) => c.id === selection.cpId) : undefined;
  const crumbs = <p className="crumbs">{stage.title} <span className="muted">· {stage.island}</span>{cp ? <> › {cp.label}</> : null}</p>;
  // keyed: moving to another checkpoint or stage mounts a fresh form, so a date, attribution or instruction typed for one is never
  // submitted for the next ("Next checkpoint" only changes props)
  const body = cp ? <CheckpointDetail key={`${stage.id}:${cp.id}`} {...props} stage={stage} cp={cp} /> : <StageDetail key={stage.id} {...props} stage={stage} />;
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} title={stage.title} returnFocus={returnFocus ?? undefined} className="detail-sheet" autoFocus>
      {crumbs}
      {body}
    </Sheet>
  );
}

/** "you pay $X · plan pays $Y" from the live estimate, labelled as calculated (engine arithmetic over cited clauses and your figures). */
function EstimateFigures({ estimate }: { estimate: SavedEstimate }) {
  const code = estimate.sources?.plan_document?.version_label ?? estimate.plan_code;
  if (estimate.status !== "estimate" || estimate.user_estimated_payment_cents == null) return <>{code}: {PASSAGE.waitingInputs(estimate.missing_inputs.length)}</>;
  return (
    <>{code}: you pay <strong className="num">{money(estimate.user_estimated_payment_cents)}</strong> · plan pays <strong className="num">{money(estimate.insurer_estimated_payment_cents)}</strong>
      {estimate.plan_payment_is_upper_bound ? " (upper bound)" : ""} <span className="fig-calc">{DRAWER.calculatedCited}</span></>
  );
}

function StageDetail({ view, stage, estimate, onSelect, onOpenLandmark, onInstructions, busy }: Props & { stage: Stage }) {
  const prog = stageProgress(stage);
  const items = (stage.linked_treatment_items ?? []).map((id) => view.links.treatment_items[id]).filter(Boolean);
  const [text, setText] = useState(""); const [source, setSource] = useState(""); const [given, setGiven] = useState("");
  return (
    <div className="detail-body">
      <h2 id="detail-h">{stage.title}</h2>
      <p className="status-line"><strong className="num">{prog.label}</strong></p>
      <p>{stage.purpose}</p>
      {stage.dates && <section className="block"><h3>{stage.dates.label}</h3><ul className="plain-list">{stage.dates.values.map((v) => <li key={v}>{v}</li>)}</ul><p className="src">Source: {stage.dates.source}</p></section>}
      {items.length > 0 && (
        <section className="block"><h3>Procedures on this island</h3>
          <ul className="plain-list">{items.map((t) => (
            <li key={t.id}><strong>{t.procedure_name ?? t.procedure_key.replace(/_/g, " ")}</strong>{t.tooth ? ` (tooth ${t.tooth})` : ""}: {t.status.replace(/_/g, " ")} · dentist's fee {money(t.dentist_fee_cents)} · allowed amount {t.allowed_cents == null ? <><EvidenceBadge status="UNKNOWN" /></> : <>{money(t.allowed_cents)} <EvidenceBadge status="USER" /> <small className="note">{t.allowed_source ?? "entered by you"}</small></>}</li>
          ))}</ul>
          <p className="muted small">{UI.allowedNote}</p>
        </section>
      )}
      {stage.finance.kind !== "none" && estimate && (
        <section className="block"><h3>Costs</h3>
          <p>{PASSAGE.currentEstimate} <EstimateFigures estimate={estimate} /></p>
          <button type="button" onClick={() => onOpenLandmark("lighthouse")}>Open the cost breakdown</button>
        </section>
      )}
      <section className="block"><h3>Dental team instructions</h3>
        {stage.instructions ? (<><blockquote className="instructions">{stage.instructions.text}</blockquote><p className="src">{UI.instructionsAsWritten}. Source: {stage.instructions.source}{stage.instructions.given_on ? ` (${stage.instructions.given_on})` : ""}</p></>)
          : (<><p className="muted">{UI.noInstructions}</p>
              <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (text && source) onInstructions(stage.id, text, source, given || undefined).then(() => { setText(""); setSource(""); setGiven(""); }); }}>
                <label>Instructions, exactly as the dental team wrote them<textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} /></label>
                <label>Source (who gave them, which document)<input value={source} onChange={(e) => setSource(e.target.value)} /></label>
                <label>Date given<input type="date" value={given} onChange={(e) => setGiven(e.target.value)} /></label>
                <button type="submit" disabled={busy || !text || !source}>Add as written</button>
              </form></>)}
      </section>
      <section className="block"><h3>Checkpoints</h3>
        <ol className="plain-list">{stage.checkpoints.map((c) => <li key={c.id}><button type="button" className="linklike" onClick={() => onSelect({ stageId: stage.id, cpId: c.id })}>{c.label}</button>: {statusLabel(c)}{attributionLabel(c) ? ` · ${attributionLabel(c)}` : ""}</li>)}</ol>
      </section>
    </div>
  );
}

function CheckpointDetail({ view, stage, cp, estimate, onSelect, onOpenLandmark, onOpenDocuments, onPatch, busy }: Props & { stage: Stage; cp: Checkpoint }) {
  const [date, setDate] = useState(cp.date?.value ?? ""); const [dateSource, setDateSource] = useState<string>(cp.date?.source ?? "user");
  const [who, setWho] = useState<"user" | "dental_team">("user");
  const next = nextCheckpoint(view.journey, { stageId: stage.id, cpId: cp.id });
  const linkedDoc = cp.links?.document ? view.links.documents[cp.links.document] : undefined;
  const linkedItems = (cp.links?.treatment_items ?? []).map((id) => view.links.treatment_items[id]).filter(Boolean);
  const action = cp.action;
  return (
    <div className="detail-body">
      <h2 id="detail-h">{cp.label}</h2>
      <p className="status-line"><span className={`pill pill-${cp.status}`}>{statusLabel(cp)}</span>{attributionLabel(cp) && <span className="attr">{attributionLabel(cp)}</span>}</p>
      <p>{cp.detail}</p>
      <dl className="kv">
        <dt>Date</dt><dd>{dateLabel(cp)}{cp.due_date && cp.status !== "completed" ? ` · listed date ${cp.due_date}` : ""}</dd>
        {cp.source && <><dt>Source</dt><dd>{cp.source.label}{cp.source.doc ? ` (${cp.source.doc}${cp.source.page ? `, p.${cp.source.page}` : ""})` : ""}</dd></>}
        {linkedDoc && <><dt>Document</dt><dd>{linkedDoc.label} <button type="button" className="linklike" onClick={onOpenDocuments}>open in Documents</button></dd></>}
        {linkedItems.length > 0 && <><dt>Procedures</dt><dd>{linkedItems.map((t) => `${t.procedure_name ?? t.procedure_key}${t.tooth ? ` (tooth ${t.tooth})` : ""}`).join("; ")}</dd></>}
        {cp.links?.estimate && estimate && <><dt>Amounts</dt><dd><EstimateFigures estimate={estimate} /></dd></>}
        {cp.user_note && <><dt>Your note</dt><dd>{cp.user_note}</dd></>}
      </dl>
      <section className="block actions">
        {action?.type === "open_landmark" && <button type="button" onClick={() => onOpenLandmark(action.target as LandmarkId)}>Open “{action.target === "lighthouse" ? "Cost breakdown" : action.target === "lookout" ? "Annual maximum" : action.target === "harbor" ? "Your plan" : action.target === "bridge" ? "Deductible" : "Coverage"}” on My plan</button>}
        {action?.type === "add_document" && <button type="button" onClick={onOpenDocuments}>Add or view documents</button>}
        {(action?.type === "enter_date" || action?.type === "mark_recorded" || cp.status !== "completed") && (
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); onPatch(cp.id, { status: "completed", completed_by: who, date: date || undefined, date_source: dateSource }); }}>
            <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label>Date given by<select value={dateSource} onChange={(e) => setDateSource(e.target.value)}><option value="user">{ATTRIBUTION.user}</option><option value="dental_team">{ATTRIBUTION.dental_team}</option><option value="document">{ATTRIBUTION.document}</option></select></label>
            <label>Record as<select value={who} onChange={(e) => setWho(e.target.value as "user" | "dental_team")}><option value="user">{ATTRIBUTION.user}</option><option value="dental_team">{ATTRIBUTION.dental_team}</option></select></label>
            <button type="submit" disabled={busy}>Record this checkpoint</button>
          </form>
        )}
        {cp.status === "completed" && <button type="button" className="secondary" disabled={busy} onClick={() => onPatch(cp.id, { status: "upcoming" })}>Undo the recorded completion</button>}
      </section>
      <section className="block nav-next">
        {next ? <button type="button" className="secondary" onClick={() => onSelect({ stageId: next.stage.id, cpId: next.cp.id })}>{UI.nextCheckpoint}: {next.cp.label}</button> : <p className="muted">This is the last checkpoint listed.</p>}
        <p className="muted small">{UI.nextNote}</p>
      </section>
    </div>
  );
}
