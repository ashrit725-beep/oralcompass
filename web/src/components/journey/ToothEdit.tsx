import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { PASSAGE } from "@/lib/copy/passage";
import type { TreatmentItem } from "@/lib/types";

/**
 * Record a planned procedure's tooth as written on the treatment plan (design spec §11 beat 4:20: the crown moved to a premolar, tooth 20;
 * finding demo-5). PATCHes the item's `tooth` and asks the host to re-estimate, like the Allowance section's allowed-amount input. The
 * engine decides what the tooth changes (e.g. an alternate benefit on molars); nothing is computed here.
 */
export function ToothEdit({ item, onRecordsChanged }: { item: TreatmentItem; onRecordsChanged?: () => void }) {
  const [tooth, setTooth] = useState(item.tooth ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function record() {
    const t = tooth.trim();
    if (!t || t === (item.tooth ?? "")) return;
    setBusy(true); setMsg(null);
    try { await api.patchItem(item.id, { tooth: t }); setMsg(PASSAGE.toothSaved); onRecordsChanged?.(); }
    catch { setMsg(PASSAGE.toothFailed); }
    finally { setBusy(false); }
  }
  return (
    <form className="inline-form tooth-edit" onSubmit={(e) => { e.preventDefault(); record(); }}>
      <label>{PASSAGE.toothLabel}<input value={tooth} onChange={(e) => setTooth(e.target.value)} inputMode="numeric" maxLength={8} /></label>
      <Button type="submit" size="touch" variant="outline" disabled={busy || !tooth.trim() || tooth.trim() === (item.tooth ?? "")}>{PASSAGE.toothSave}</Button>
      {msg && <p className="note" role="status">{msg}</p>}
    </form>
  );
}

export default ToothEdit;
