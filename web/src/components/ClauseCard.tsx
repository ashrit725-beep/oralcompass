import { useState } from "react";
import { PLAIN, UI } from "../lib/copy";
import { money } from "../lib/stitches";
import type { LedgerLine, Stitch } from "../lib/types";
import { DepthDial, EvidenceBadge, StitchChip } from "./Primitives";

interface Props { stitch: Stitch; lines: LedgerLine[]; onClose: () => void; onOpenOnPage: (s: Stitch) => void }

/** Clause card: depth 1 plain sentence · depth 2 the user's numbers · depth 3 exact wording + arithmetic — one element, no new route. */
export function ClauseCard({ stitch, lines, onClose, onOpenOnPage }: Props) {
  const [depth, setDepth] = useState<1 | 2 | 3>(1);
  const topicKey = stitch.topic.startsWith("class:") ? "coinsurance" : stitch.topic;
  const plain = PLAIN[topicKey] ?? "This sentence states a rule of your plan.";
  const affected = lines.flatMap((l) => l.steps.filter((s) => s.stitch?.endsWith(`#p${stitch.page}`) && stitch.ruleCodes.includes(s.rule)).map((s) => ({ line: l.label, step: s })));
  return (
    <aside className="clause" role="dialog" aria-labelledby="clause-h" aria-modal="false">
      <header>
        <StitchChip stitch={stitch} selected prominent />
        <h3 id="clause-h">{stitch.topic.replace(/[_:]/g, " ")}</h3>
        <EvidenceBadge status="DOC" />
        <button type="button" className="close" onClick={onClose} aria-label="Close clause card">×</button>
      </header>
      <DepthDial depth={depth} onChange={setDepth} />
      {depth === 1 && <p className="plain">{plain}</p>}
      {depth === 2 && (
        affected.length ? (
          <table className="mini"><caption>In this scenario</caption><tbody>
            {affected.map((a, i) => <tr key={i}><th scope="row">{a.line}: {a.step.label}</th><td className="amt">{money(Math.abs(a.step.cents))}</td></tr>)}
          </tbody></table>
        ) : <p className="plain">This sentence does not change your numbers in this scenario.</p>
      )}
      {depth === 3 && (
        <figure className="wording">
          <blockquote>“{stitch.quote}”</blockquote>
          <figcaption>{stitch.doc}, page {stitch.page}</figcaption>
        </figure>
      )}
      <footer>
        <button type="button" onClick={() => onOpenOnPage(stitch)}>{UI.showInDocuments}</button>
      </footer>
    </aside>
  );
}
