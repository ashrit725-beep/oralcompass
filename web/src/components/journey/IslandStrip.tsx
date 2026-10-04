import { useState } from "react";
import { UI } from "@/lib/copy";
import { PASSAGE } from "@/lib/copy/passage";
import { islandAmountText } from "@/lib/passage";
import type { MapSelection, PassageVM } from "@/lib/types";

/**
 * IslandStrip (spec §3.8, 7+ procedures): a sticky <select aria-label="Jump to a procedure"> under the segment bar, rendered only when the
 * route is dense enough to need it. Mobile-only (owner direction 2026-10-04): the desktop chip strip with page buttons was removed.
 */
export interface IslandStripProps { vm: PassageVM; selected: MapSelection | null; onSelect: (islandId: string, el: HTMLElement | null) => void }

export function IslandStrip(props: IslandStripProps) {
  return <IslandSelect {...props} />;
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
