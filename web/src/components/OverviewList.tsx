import { UI } from "../lib/copy";
import { PASSAGE } from "../lib/copy/passage";
import { attributionLabel, dateLabel, stageProgress, statusLabel } from "../lib/journey";
import { islandAmountText, moneyText } from "../lib/passage";
import type { InsuranceCheckpointVM, IslandVM, Journey, PassageVM, Stitch } from "../lib/types";
import type { StageSelection as Selection } from "../lib/types";
import { Money } from "./Money";
import { EvidenceBadge, StitchChip } from "./Primitives";

/**
 * The accessible equivalent of the painted passage (spec §9.3): a Route table (one row per island in route order, framed by START and
 * the Harbor Light), a checkpoint table per island inside <details>, short tables for visited and marginal islands, then the care-stage
 * tables unchanged. Every figure carries the same badge (and stitch chip) as on the map; nothing is computed here.
 */
export interface OverviewListProps {
  journey: Journey; onSelect: (s: Selection) => void;
  vm?: PassageVM; planTitle?: string; onSelectIsland?: (islandId: string, checkpointKey?: string) => void; onSelectStitch?: (s: Stitch) => void;
}

const OWNER_WORD: Record<InsuranceCheckpointVM["owner"], string> = { patient: PASSAGE.ownerPatient, plan: PASSAGE.ownerPlan, nobody: PASSAGE.ownerNobody, basis: PASSAGE.ownerBasis, info: PASSAGE.ownerInfo };

function CheckpointTable({ isl, onSelectStitch }: { isl: IslandVM; onSelectStitch?: (s: Stitch) => void }) {
  return (
    <table className="ov-table ov-cps">
      <thead><tr><th scope="col">{PASSAGE.colTerm}</th><th scope="col">{PASSAGE.colAmountIn}</th><th scope="col">{PASSAGE.colChange}</th><th scope="col">{PASSAGE.colAmountOut}</th><th scope="col">{PASSAGE.colOwner}</th><th scope="col">{PASSAGE.colClause}</th></tr></thead>
      <tbody>
        {isl.checkpoints.map((cp) => (
          <tr key={cp.key}>
            <th scope="row">{cp.term}{cp.rule === "missing" || cp.rule === "X" || cp.rule === "W" || cp.rule === "F" ? <small className="note"> {cp.explanation}</small> : null}</th>
            <td>{cp.amountIn != null ? <Money cents={cp.amountIn} evidence={cp.badge} badge={false} /> : "—"}</td>
            <td>{cp.split ? <>{PASSAGE.plan} {cp.split.planPct}% <Money cents={cp.split.plan} evidence={cp.badge} badge={false} /> · {PASSAGE.you} {100 - cp.split.planPct}% <Money cents={cp.split.patient} evidence={cp.badge} badge={false} /></> : cp.change != null ? (cp.change === 0 ? PASSAGE.noChange : <Money cents={cp.change} evidence={cp.badge} badge={false} signed />) : "—"}</td>
            <td>{cp.amountOut != null ? <Money cents={cp.amountOut} evidence={cp.badge} badge={false} /> : "—"}</td>
            <td>{OWNER_WORD[cp.owner]}</td>
            <td>{cp.stitch ? <><StitchChip stitch={cp.stitch} onSelect={onSelectStitch} /> <small className="where">{cp.stitch.doc} {cp.stitch.pageNote ?? `p.${cp.stitch.page}`}</small></> : <EvidenceBadge status={cp.badge} />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OverviewList({ journey, onSelect, vm, planTitle, onSelectIsland, onSelectStitch }: OverviewListProps) {
  const sound = (isl: IslandVM) => isl.soundingsAfter ? `${PASSAGE.soundingsDeductible} ${moneyText(isl.soundingsAfter.deductible)} · ${PASSAGE.soundingsMax} ${isl.soundingsAfter.unlimited || isl.soundingsAfter.annualMax == null ? PASSAGE.noMaximum : moneyText(isl.soundingsAfter.annualMax)}` : "—";
  const pick = (id: string, cp?: string) => () => onSelectIsland?.(id, cp);
  return (
    <section className="overview" aria-labelledby="ov-h">
      <h2 id="ov-h">{UI.overview}</h2>
      {vm && (
        <section className="ov-route" aria-labelledby="ov-route-h">
          <h3 id="ov-route-h">{PASSAGE.routeTable}</h3>
          <p id="ov-route-sum" className="muted small">{PASSAGE.routeTableSummary(vm.islands.length, planTitle ?? "—", vm.totals.youPay != null ? moneyText(vm.totals.youPay) : PASSAGE.waitingLower)}</p>
          <table className="ov-table ov-islands" aria-describedby="ov-route-sum">
            <thead><tr><th scope="col">{PASSAGE.colProcedure}</th><th scope="col">{PASSAGE.colTooth}</th><th scope="col">{PASSAGE.colStatus}</th><th scope="col">{PASSAGE.colFee}</th><th scope="col">{PASSAGE.colAllowed}</th><th scope="col">{PASSAGE.colYouPay}</th><th scope="col">{PASSAGE.colPlanPays}</th><th scope="col">{PASSAGE.colCheckpoints}</th><th scope="col">{PASSAGE.colFlags}</th><th scope="col">{PASSAGE.colSoundings}</th></tr></thead>
            <tbody>
              <tr className="ov-frame"><th scope="row"><button type="button" className="linklike" onClick={pick("start")}>{vm.start.title}</button> <span className="muted">· {vm.start.place}</span></th><td colSpan={8}>{vm.start.subtitle}{vm.start.notices.length ? ` · ${vm.start.notices[0]}` : ""}</td><td>{vm.start.soundingsAfter ? `${PASSAGE.soundingsBefore}: ${sound(vm.start)}` : "—"}</td></tr>
              {vm.islands.map((isl) => {
                const n = isl.checkpoints.find((c) => c.rule === "N");
                return (
                  <tr key={isl.id} className={`ov-island is-${isl.state}`}>
                    <th scope="row"><button type="button" className="linklike" onClick={pick(isl.id)}>{isl.title}</button> <span className="muted">· {isl.place}</span></th>
                    <td>{isl.item?.tooth ?? "—"}</td>
                    <td>{isl.item?.status.replace(/_/g, " ")}{isl.state === "unresolved" ? ` · ${PASSAGE.waitingLower}` : isl.state === "not_covered" ? ` · ${PASSAGE.notCoveredLower}` : ""}</td>
                    <td>{isl.item ? <Money cents={isl.item.dentist_fee_cents * (isl.item.quantity || 1)} evidence="USER" /> : "—"}</td>
                    <td>{isl.item?.allowed_cents != null ? <Money cents={isl.item.allowed_cents} evidence={(isl.item.allowed_status as never) || "USER"} /> : n?.amountOut != null ? <Money cents={n.amountOut} evidence={n.badge} /> : <EvidenceBadge status="UNKNOWN" />}</td>
                    <td>{isl.youPay != null ? <Money cents={isl.youPay} evidence={isl.checkpoints.find((c) => c.rule === "CO")?.badge ?? "USER"} /> : <span className="muted">{islandAmountText(isl)}</span>}</td>
                    <td>{isl.planPays != null ? <Money cents={isl.planPays} evidence={isl.checkpoints.find((c) => c.rule === "CO")?.badge ?? "USER"} /> : "—"}{isl.upperBound ? ` ${PASSAGE.upperBoundParen}` : ""}</td>
                    <td>{PASSAGE.stepsOf(isl.checkpoints.length)}</td>
                    <td>{isl.notices.length}</td>
                    <td className="ov-sound">{sound(isl)}</td>
                  </tr>
                );
              })}
              <tr className="ov-frame"><th scope="row"><button type="button" className="linklike" onClick={pick("destination")}>{vm.destination.title}</button> <span className="muted">· {vm.destination.subtitle}</span></th><td colSpan={4}>{vm.destination.notices[0] ?? ""}</td><td>{vm.destination.youPay != null ? <Money cents={vm.destination.youPay} evidence="DOC" /> : <span className="muted">{PASSAGE.waitingLower}</span>}</td><td>{vm.destination.planPays != null ? <Money cents={vm.destination.planPays} evidence="DOC" /> : "—"}{vm.destination.upperBound ? ` ${PASSAGE.upperBoundParen}` : ""}</td><td colSpan={2} /><td>{sound(vm.destination)}</td></tr>
            </tbody>
          </table>
          {vm.islands.filter((i) => i.checkpoints.length).map((isl) => (
            <details key={isl.id} className="ov-cp-details">
              <summary>{PASSAGE.showCheckpoints}: {isl.title}</summary>
              <CheckpointTable isl={isl} onSelectStitch={onSelectStitch} />
            </details>
          ))}
          {vm.visited.length > 0 && (
            <>
              <h3>{PASSAGE.visitedTable}</h3>
              <table className="ov-table ov-visited">
                <thead><tr><th scope="col">{PASSAGE.colProcedure}</th><th scope="col">{PASSAGE.colDate}</th><th scope="col">{PASSAGE.colTooth}</th><th scope="col">{PASSAGE.colFee}</th><th scope="col">{PASSAGE.colAllowed}</th><th scope="col">{PASSAGE.colPlanPaid}</th><th scope="col">{PASSAGE.colPatientPaid}</th></tr></thead>
                <tbody>{vm.visited.map((v) => (
                  <tr key={v.id}><th scope="row"><button type="button" className="linklike" onClick={pick(v.id)}>{v.title}</button></th><td>{v.claim?.date ?? v.item?.appointment_date ?? "—"}</td><td>{v.claim?.tooth ?? v.item?.tooth ?? "—"}</td>
                    <td>{v.claim?.dentist_fee_cents != null ? <Money cents={v.claim.dentist_fee_cents} evidence="USER" /> : v.item ? <Money cents={v.item.dentist_fee_cents} evidence="USER" /> : "—"}</td>
                    <td>{v.claim?.allowed_cents != null ? <Money cents={v.claim.allowed_cents} evidence="USER" /> : "—"}</td>
                    <td>{v.claim ? <Money cents={v.claim.plan_paid_cents} evidence="USER" /> : <span className="muted">{PASSAGE.planPaidNotProvided}</span>}</td>
                    <td>{v.claim?.patient_paid_cents != null ? <Money cents={v.claim.patient_paid_cents} evidence="USER" /> : "—"}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          {vm.marginal.length > 0 && (
            <>
              <h3>{PASSAGE.marginalTable}</h3>
              <table className="ov-table ov-marginal">
                <thead><tr><th scope="col">{PASSAGE.colProcedure}</th><th scope="col">{PASSAGE.colRule}</th><th scope="col">{PASSAGE.colClause}</th></tr></thead>
                <tbody>{vm.marginal.map((m) => (
                  <tr key={m.id}><th scope="row"><button type="button" className="linklike" onClick={pick(m.id)}>{m.title}</button> <span className="muted">· {m.place}</span></th><td>{m.checkpoints[0]?.term ?? PASSAGE.noEstimateCalculated}<br /><small className="note">{m.notices[0]}</small></td><td>{m.checkpoints[0]?.stitch ? <StitchChip stitch={m.checkpoints[0].stitch} onSelect={onSelectStitch} /> : <EvidenceBadge status={m.checkpoints[0]?.badge ?? "UNKNOWN"} />}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
        </section>
      )}
      <p className="muted small">{UI.progressNote}</p>
      <ol className="ov-stages">
        {journey.stages.map((s) => (
          <li key={s.id}>
            <h3><button type="button" className="linklike" onClick={() => onSelect({ stageId: s.id })}>{s.title}</button> <span className="muted">· {s.island} · {stageProgress(s).label}</span></h3>
            {/* scrolls sideways inside its own region on phones (the page itself never scrolls sideways; slop-5) */}
            <div className="ov-scroll" role="region" aria-label={`${s.title}: checkpoints`} tabIndex={0}>
            <table className="ov-table">
              <thead><tr><th scope="col">Checkpoint</th><th scope="col">Status</th><th scope="col">Recorded by</th><th scope="col">Date</th><th scope="col">Source</th></tr></thead>
              <tbody>
                {s.checkpoints.map((c) => (
                  <tr key={c.id}>
                    <th scope="row"><button type="button" className="linklike" onClick={() => onSelect({ stageId: s.id, cpId: c.id })}>{c.label}</button></th>
                    <td>{statusLabel(c)}</td><td>{attributionLabel(c) ?? "—"}</td><td>{dateLabel(c)}</td><td>{c.source?.label ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
