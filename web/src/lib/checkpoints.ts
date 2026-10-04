import type { Benefits, CheckpointRule, Evidence, Stitch, TreatmentItem } from "./types";

/**
 * The ONE evidence rule for an insurance checkpoint, shared by the map / overview / drawer strip (`lib/passage` checkpointsFor) and the
 * drawer's cost pipeline (`lib/drawer` checkpointsForLine), so the same figure never wears two different badges (finding
 * web-correctness-25). A resolved clause stitch makes it DOC; otherwise the figure's own source decides:
 *  - fee and listed amounts come from your estimate (USER);
 *  - the allowed amount is your record's status when one is recorded, else UNKNOWN;
 *  - deductible and maximum steps rest on your benefit statement's remaining amounts (USER when entered, else UNKNOWN);
 *  - "you pay" is DOC only when the share step behind it is cited, else UNKNOWN; anything else unstitched is UNKNOWN.
 */
export function checkpointEvidence(rule: CheckpointRule, stitch: Stitch | null | undefined, ctx: { item?: TreatmentItem; benefits?: Benefits | null; shareHasStitch: boolean }): Evidence {
  if (stitch) return "DOC";
  const { item, benefits, shareHasStitch } = ctx;
  switch (rule) {
    case "fee": case "L": return "USER";
    case "N": return item?.allowed_cents != null ? ((item.allowed_status as Evidence) || "USER") : "UNKNOWN";
    case "D": return benefits?.remaining_deductible_cents != null ? "USER" : "UNKNOWN";
    case "M": return benefits?.remaining_max_cents != null || benefits?.annual_max_unlimited ? "USER" : "UNKNOWN";
    case "total": return shareHasStitch ? "DOC" : "UNKNOWN";
    default: return "UNKNOWN";
  }
}
