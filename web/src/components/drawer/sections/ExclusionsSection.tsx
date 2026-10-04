import { DRAWER } from "@/lib/copy/drawer";
import { stitchForCite } from "@/lib/stitches";
import { docOf, Fact, Flag, Section, type SectionProps } from "./shared";

/**
 * Section 9 · Exclusions (spec §4.4): excluded → the sentence, the exclusion quote's stitch and the engine's closed-step label; not excluded →
 * "The pages read list no exclusion naming this service." plus the plan's own note on its exclusion list (e.g. "the list is partial and the
 * certificate governs"). Related `unsupported_rules` wording that names the procedure is shown as wording the engine did not apply.
 * Omitted when there is no rule row for the procedure.
 */
export function ExclusionsSection({ line, item, rule, plan, stitches, onSelectStitch }: SectionProps) {
  if (!rule) return null;
  const doc = docOf(plan);
  const key = item?.procedure_key ?? line?.procedure_key ?? rule.procedure_key;
  const excluded = rule.exclusion ?? null;
  const planNote = key ? plan.excluded?.[key]?.note : undefined;
  const closed = line?.status === "not_covered" && line.steps[0]?.rule === "X" ? line.steps[0] : null;
  const words = (key ?? "").split("_").filter((w) => w.length > 3);
  const related = (plan.unsupported_rules ?? []).filter((u) => words.some((w) => new RegExp(`\\b${w}`, "i").test(u.quote) || new RegExp(`\\b${w}`, "i").test(u.reason))).slice(0, 3);
  return (
    <Section k="exclusions" title={DRAWER.sExclusions}>
      {excluded ? (
        <>
          <p className="dsec-lede"><Fact evidence="DOC" stitch={stitchForCite(excluded.cite, stitches, doc)} onSelectStitch={onSelectStitch}>{DRAWER.excludedSentence}</Fact></p>
          {excluded.cite?.quote && <figure className="wording"><blockquote>“{excluded.cite.quote}”</blockquote><figcaption>{excluded.cite.doc ?? doc}, page {excluded.cite.page}</figcaption></figure>}
          {closed && <Flag text={closed.label} />}
        </>
      ) : (
        <p className="dsec-lede"><Fact evidence="DOC">{DRAWER.notExcludedSentence}</Fact></p>
      )}
      {planNote && <p className="dsec-note">{planNote}</p>}
      {related.length > 0 && (
        <div className="dsec-related">
          <p className="dsec-k">{DRAWER.relatedWording}</p>
          <ul className="dsec-list">
            {related.map((u, i) => (
              <li key={i}>
                <Fact evidence="DOC" stitch={stitchForCite({ page: u.page, quote: u.quote, doc: u.doc }, stitches, doc)} onSelectStitch={onSelectStitch}><q>{u.quote}</q></Fact>
                <span className="dsec-note">{u.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

export default ExclusionsSection;
