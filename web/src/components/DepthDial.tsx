import { useRef } from "react";
import RubberSegment from "@/components/ui/RubberSegment";
import { UI } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * DepthDial (component plan N14): the three explanation depths (Plain words · Your numbers · Exact wording) on the React Bits
 * RubberSegment, tuned as a brass dial glide with no rubber deformation (`stretch` 0, `squash` 0, `draggable` off, 44 px slots,
 * serif). The one depth control in the app: My plan landmarks and the clause card both use it (delight pass rb-06; the legacy Primitives
 * dial was removed). A11y comes from the vendored
 * component: role=radiogroup / role=radio with aria-checked, roving tabindex, arrow/Home/End keys and a 3 px focus outline; the radio's
 * accessible name is the depth word, so `get_by_role("radio", name="Exact wording")` keeps working. Spec §9.2 adds the digit keys 1 2 3.
 * Reduced motion: handled inside RubberSegment (the thumb jumps to the selected slot; end state exact).
 */
export interface DepthDialProps {
  depth: 1 | 2 | 3;
  onChange: (d: 1 | 2 | 3) => void;
  className?: string;
  /** Accessible name of the group. */
  label?: string;
}

const DEPTHS = [1, 2, 3] as const;

export function DepthDial({ depth, onChange, className, label = "Explanation depth" }: DepthDialProps) {
  const host = useRef<HTMLDivElement>(null);
  const items = DEPTHS.map((d) => ({ value: String(d), label: <><span aria-hidden="true" className="depth-n">{d}</span><span>{UI.depth[d - 1]}</span></> }));
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "1" && e.key !== "2" && e.key !== "3") return;
    const d = Number(e.key) as 1 | 2 | 3;
    e.preventDefault();
    if (d !== depth) onChange(d);
    const radios = host.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[d - 1]?.focus();
  }
  return (
    <div ref={host} className={cn("depth-dial", className)} onKeyDown={onKeyDown}>
      <RubberSegment
        aria-label={label}
        items={items}
        value={String(depth)}
        onChange={(v) => onChange(Number(v) as 1 | 2 | 3)}
        size="lg"
        stretch={0}
        squash={0}
        draggable={false}
        radius={12}
        className="font-serif"
      />
    </div>
  );
}

export default DepthDial;
