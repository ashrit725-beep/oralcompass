/**
 * Island vocabulary (design spec §3.7), plates (§10, addendum §C) and checkpoint glyphs (§5.6). Pure data; no patient information:
 * place names are keyed on `procedures.json` `category_hint`, never on a name, tooth or amount.
 */
import type { ArtSlot } from "@/components/atlas/ArtPlate";
import type { CheckpointRule, ProcedureCategory } from "./types";

/** `category_hint` → the fixed ProcedureCategory used by the view-model. */
export function categoryOf(hint: string | null | undefined): ProcedureCategory | null {
  switch (hint) {
    case "preventive": return "preventive";
    case "basic": return "basic";
    case "basic/major (varies)": return "varies";
    case "major": return "major";
    case "major/excluded (varies)": return "major_excluded";
    default: return null;
  }
}

/** Fixed place names per category (§3.7). */
export const PLACE_NAME: Record<ProcedureCategory, string> = {
  preventive: "Clearwater Shoal",
  basic: "Quiet Bay",
  varies: "Narrow Strait",
  major: "High Cliffs",
  major_excluded: "Outer Reef",
};
export const START_PLACE = "Harbor of Beginnings";
export const LIGHT_PLACE = "Harbor Light";
export const CLOSED_SUFFIX = ", closed channel";

/** Repeats take a count: the second `major` island is `High Cliffs · 2`. */
export function placeName(category: ProcedureCategory | null, seen: Map<string, number>): string {
  const base = category ? PLACE_NAME[category] : "Open Water";
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base} · ${n}`;
}

/** Plate slot per category; major and lighthouse plates carry their own painted surf and sit at ≈ 3.4r (addendum §C.3). */
export function plateFor(category: ProcedureCategory | null, kind: "procedure" | "visited" | "marginal" | "destination"): { slot: ArtSlot; scale: number; aspect: number } {
  if (kind === "destination") return { slot: "island-lighthouse", scale: 3.4, aspect: 1106 / 1422 };
  if (category === "major" || category === "major_excluded") return { slot: "island-major", scale: 3.4, aspect: 1106 / 1422 };
  return { slot: "island-generic", scale: 3, aspect: 1106 / 1422 };
}

/** Checkpoint terms and decorative places per rule (§3.3). */
export const CHECKPOINT_TERM: Record<CheckpointRule, string> = {
  fee: "Dentist's fee", N: "Allowed amount", AB: "Alternate benefit", D: "Deductible", CO: "Plan share", M: "Annual maximum",
  L: "Listed on your estimate", total: "You pay", X: "Not covered by this plan", W: "Waiting period", F: "Frequency limit", missing: "Waiting for information",
};
export const CHECKPOINT_PLACE: Record<CheckpointRule, string> = {
  fee: "the quay", N: "the reef", AB: "the point", D: "the crossing", CO: "the strait", M: "the gate", L: "the ledger", total: "the landing",
  X: "the closed channel", W: "the closed channel", F: "the closed channel", missing: "the fog bank",
};
/** Fixed slot order (addendum graft P3): every island's checkpoint set has the same silhouette. */
export const SLOT_ORDER: CheckpointRule[] = ["fee", "N", "AB", "D", "CO", "M", "L", "total"];

/** Glyph ids; each is drawn as an SVG path (never emoji) by `components/atlas/InsuranceCheckpoint.tsx`. */
export type GlyphId = "fee" | "allowed" | "alternate" | "deductible" | "share" | "maximum" | "listed" | "youpay" | "closed" | "fog" | "visited" | "passed";
export const GLYPH_FOR_RULE: Record<CheckpointRule, GlyphId> = {
  fee: "fee", N: "allowed", AB: "alternate", D: "deductible", CO: "share", M: "maximum", L: "listed", total: "youpay", X: "closed", W: "closed", F: "closed", missing: "fog",
};

/**
 * Glyph geometry in a 24 × 24 box (centre 12,12). `paths` are stroked unless `fill` says otherwise. Chosen so each one reads at 12 px:
 * § fee, ≈ allowed, ⇄ alternate, ◐ deductible, ◑ share, ▲ maximum, ≡ listed, ● you pay, ⊘ closed, ? fog, ◌ visited, ○ passed.
 */
export const GLYPH_PATHS: Record<GlyphId, { d: string; fill?: boolean; dashed?: boolean }[]> = {
  fee: [{ d: "M15 7.5a3 3 0 0 0-6 0c0 2 6 2.5 6 5.5a3 3 0 0 1-6 0" }, { d: "M12 4v2M12 18v2" }],
  allowed: [{ d: "M5 10c2-2 4-2 6 0s4 2 6 0M5 15c2-2 4-2 6 0s4 2 6 0" }],
  alternate: [{ d: "M5 9h12l-3-3M19 15H7l3 3" }],
  deductible: [{ d: "M12 4a8 8 0 1 0 0 16z", fill: true }, { d: "M12 4a8 8 0 1 1 0 16" }],
  share: [{ d: "M12 4a8 8 0 1 1 0 16z", fill: true }, { d: "M12 4a8 8 0 1 0 0 16" }],
  maximum: [{ d: "M12 5l8 14H4z" }],
  listed: [{ d: "M5 8h14M5 12h14M5 16h14" }],
  youpay: [{ d: "M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14z", fill: true }],
  closed: [{ d: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z" }, { d: "M7 12h10" }],
  fog: [{ d: "M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" }, { d: "M12 17.5v.5" }],
  visited: [{ d: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z", dashed: true }],
  passed: [{ d: "M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14z" }],
};
