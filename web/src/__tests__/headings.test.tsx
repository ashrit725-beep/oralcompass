import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));

import { CompareView } from "@/components/CompareView";
import { UI } from "@/lib/copy";

/** a11y-22 and slop-9: the view title is the h2; the availability banner is a paragraph printed once, not a heading. */
describe("Compare headings", () => {
  const html = renderToStaticMarkup(<CompareView plans={[]} items={[]} benefits={[]} initial={["ML26", "DD24"]} />);
  it("titles the view with an h2 and keeps the banner out of every heading", () => {
    expect(html).toMatch(/<h2 id="cv-h">Compare plans<\/h2>/);
    const headings = html.match(/<h[1-6][^>]*>.*?<\/h[1-6]>/g) ?? [];
    for (const h of headings) expect(h).not.toContain(UI.availabilityBanner);
    expect(html.split(UI.availabilityBanner)).toHaveLength(2);
  });
});
