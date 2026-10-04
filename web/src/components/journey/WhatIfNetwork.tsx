import { useId } from "react";
import { EvidenceBadge } from "@/components/Primitives";
import { PASSAGE } from "@/lib/copy/passage";

/**
 * "What if" on the Harbor Light (design spec §11 beat 4:20; finding demo-5): the network status the estimate uses, as a hypothetical
 * the engine labels ASSUMED ("network: hypothetical you entered" appears in the Harbor Light's assumptions with the ASSUMED badge).
 * "As in your records" sends nothing. The value lives with the plan in useAppData (a plan switch clears it); records never change.
 */
export interface WhatIfNetworkProps { value: "in" | "out" | null; recorded: string | null; onChange: (value: "in" | "out" | null) => void }

export function WhatIfNetwork({ value, recorded, onChange }: WhatIfNetworkProps) {
  const id = useId();
  const recordedWord = recorded === "in" ? PASSAGE.inNetwork : recorded === "out" ? PASSAGE.outOfNetwork : PASSAGE.networkNotProvided;
  return (
    <fieldset className="what-if">
      <legend>{PASSAGE.whatIfTitle}</legend>
      <label htmlFor={id}>{PASSAGE.whatIfNetwork}</label>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value === "in" || e.target.value === "out" ? e.target.value : null)}>
        <option value="">{PASSAGE.whatIfAsRecorded(recordedWord)}</option>
        <option value="in">{PASSAGE.whatIfIn}</option>
        <option value="out">{PASSAGE.whatIfOut}</option>
      </select>
      {value && <p className="what-if-note" role="status"><EvidenceBadge status="ASSUMED" /> {PASSAGE.whatIfActive}</p>}
    </fieldset>
  );
}

export default WhatIfNetwork;
