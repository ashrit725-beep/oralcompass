import { useEffect, useState } from "react";
import { UI } from "@/lib/copy";
import { PASSAGE } from "@/lib/copy/passage";
import { islandAmountText } from "@/lib/passage";
import type { MapSelection, PassageVM } from "@/lib/types";

/**
 * IslandStrip (spec §3.8, 7+ procedures): a horizontal list of chips above the map duplicating the island buttons for quick selection
 * (desktop; paginated by 12 above twelve with page buttons, and the page holding the selected island is shown), or a sticky
 * <select aria-label="Jump to a procedure"> under the segment bar on phones.
 * Rendered only when the route is dense enough to need it.
 */
export interface IslandStripProps { vm: PassageVM; selected: MapSelection | null; onSelect: (islandId: string, el: HTMLElement | null) => void; mobile: boolean; page?: number }

export function IslandStrip({ vm, selected, onSelect, mobile, page: initialPage = 0 }: IslandStripProps) {
  const pageSize = 12;
  const pages = Math.max(1, Math.ceil(vm.islands.length / pageSize));
  const [page, setPage] = useState(Math.min(initialPage, pages - 1));
  const selIndex = selected ? vm.islands.findIndex((i) => i.id === selected.islandId) : -1;
  useEffect(() => { if (selIndex >= 0) setPage(Math.floor(selIndex / pageSize)); }, [selIndex]);
  const shown = Math.min(page, pages - 1);
  const items = vm.islands.slice(shown * pageSize, (shown + 1) * pageSize);
  if (mobile) return <IslandSelect vm={vm} selected={selected} onSelect={onSelect} />;
  return (
    <>
    {pages > 1 && (
      <div className="island-strip-pages" role="group" aria-label={PASSAGE.stripPages}>
        {Array.from({ length: pages }, (_, p) => (
          <button key={p} type="button" className="unstyled island-chip" aria-pressed={p === shown} onClick={() => setPage(p)}>
            {PASSAGE.stripPage(p * pageSize + 1, Math.min((p + 1) * pageSize, vm.islands.length))}
          </button>
        ))}
      </div>
    )}
    <ul className="island-strip" aria-label={PASSAGE.jumpTo}>
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" className={`unstyled island-chip ${selected?.islandId === i.id ? "is-selected" : ""}`} aria-pressed={selected?.islandId === i.id} onClick={(e) => onSelect(i.id, e.currentTarget)}>
            <span className="num">{i.order}</span> {i.title} <small>{islandAmountText(i)}</small>
          </button>
        </li>
      ))}
    </ul>
    </>
  );
}

/**
 * Phone: picking an option only chooses it; the Show button opens the procedure (a11y-16, SC 3.2.2). Browsing the options with the
 * arrow keys on a closed select no longer opens the modal sheet and steals focus mid-browse.
 */
function IslandSelect({ vm, selected, onSelect }: Pick<IslandStripProps, "vm" | "selected" | "onSelect">) {
  const [chosen, setChosen] = useState(selected?.islandId ?? "");
  return (
    <form className="island-strip-select" onSubmit={(e) => { e.preventDefault(); if (chosen) onSelect(chosen, e.currentTarget.querySelector("select")); }}>
      <select aria-label={PASSAGE.jumpTo} value={chosen} onChange={(e) => setChosen(e.target.value)}>
        <option value="">{PASSAGE.jumpTo}</option>
        {vm.islands.map((i) => <option key={i.id} value={i.id}>{i.order}. {i.title}{i.subtitle ? ` (${i.subtitle})` : ""} · {islandAmountText(i)}</option>)}
      </select>
      <button type="submit" className="secondary" disabled={!chosen}>{UI.showChosen}</button>
    </form>
  );
}

export default IslandStrip;
