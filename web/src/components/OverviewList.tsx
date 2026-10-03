import { UI } from "../lib/copy";
import { attributionLabel, dateLabel, stageProgress, statusLabel } from "../lib/journey";
import type { Journey } from "../lib/types";
import type { Selection } from "./atlas/JourneyMap";

/** The accessible equivalent of the painted map: every island and checkpoint as plain text with status, attribution, date and source. */
export function OverviewList({ journey, onSelect }: { journey: Journey; onSelect: (s: Selection) => void }) {
  return (
    <section className="overview" aria-labelledby="ov-h">
      <h2 id="ov-h">{UI.overview}</h2>
      <p className="muted small">{UI.progressNote}</p>
      <ol className="ov-stages">
        {journey.stages.map((s) => (
          <li key={s.id}>
            <h3><button type="button" className="linklike" onClick={() => onSelect({ stageId: s.id })}>{s.title}</button> <span className="muted">· {s.island} · {stageProgress(s).label}</span></h3>
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
          </li>
        ))}
      </ol>
    </section>
  );
}
