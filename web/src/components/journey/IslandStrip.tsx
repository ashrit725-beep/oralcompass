import { PASSAGE } from "@/lib/copy/passage";
import { islandAmountText } from "@/lib/passage";
import type { MapSelection, PassageVM } from "@/lib/types";

/**
 * IslandStrip (spec §3.8, 7+ procedures): a horizontal list of chips above the map duplicating the island buttons for quick selection
 * (desktop; paginated by 12 above twelve), or a sticky <select aria-label="Jump to a procedure"> under the segment bar on phones.
 * Rendered only when the route is dense enough to need it.
 */
export interface IslandStripProps { vm: PassageVM; selected: MapSelection | null; onSelect: (islandId: string, el: HTMLElement | null) => void; mobile: boolean; page?: number }

export function IslandStrip({ vm, selected, onSelect, mobile, page = 0 }: IslandStripProps) {
  const pageSize = 12;
  const items = vm.islands.slice(page * pageSize, (page + 1) * pageSize);
  if (mobile) {
    return (
      <label className="island-strip-select">
        <span className="sr-only">{PASSAGE.jumpTo}</span>
        <select aria-label={PASSAGE.jumpTo} value={selected?.islandId ?? ""} onChange={(e) => { if (e.target.value) onSelect(e.target.value, e.currentTarget); }}>
          <option value="">{PASSAGE.jumpTo}</option>
          {vm.islands.map((i) => <option key={i.id} value={i.id}>{i.order}. {i.title}{i.subtitle ? ` (${i.subtitle})` : ""} · {islandAmountText(i)}</option>)}
        </select>
      </label>
    );
  }
  return (
    <ul className="island-strip" aria-label={PASSAGE.jumpTo}>
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" className={`unstyled island-chip ${selected?.islandId === i.id ? "is-selected" : ""}`} aria-pressed={selected?.islandId === i.id} onClick={(e) => onSelect(i.id, e.currentTarget)}>
            <span className="num">{i.order}</span> {i.title} <small>{islandAmountText(i)}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default IslandStrip;
