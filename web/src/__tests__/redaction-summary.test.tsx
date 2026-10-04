// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => String(value) }));

import { RedactionSummary } from "@/components/upload/RedactionSummary";
import type { FoundIdentifier, RedactionResult } from "@/lib/redact";

/**
 * RedactionSummary (client redaction design point 2): the count, singular and zero copy, the "Keep in text" switches that change the count
 * live (announced once, politely), the mask/Show toggle, the person's own terms, the redacted preview and the Continue payload.
 * The identifiers are given (not detected), so these tests hold for the contract stub and the detector branch's lib/redact.ts alike.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAGES = [
  "Member: Riley Okafor\nMember ID: TWS-4471902\nHome phone: (910) 555-0147\nDear Riley Okafor, this statement lists the claims.\nDeductible $50 per Covered Person. D0120 Periodic oral evaluation $47.25",
  "Member: Riley Okafor\nPatient: Jamie Okafor (spouse)\nClass II Basic services: the Plan pays 80% of the Allowed Amount.",
];
const FOUND: FoundIdentifier[] = [
  { id: "n-riley", category: "name", value: "Riley Okafor", occurrences: 3, pages: [1, 2] },
  { id: "n-jamie", category: "name", value: "Jamie Okafor", occurrences: 1, pages: [2] },
  { id: "m-1", category: "member_id", value: "TWS-4471902", occurrences: 1, pages: [1] },
  { id: "p-1", category: "phone", value: "(910) 555-0147", occurrences: 1, pages: [1] },
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function render(found: FoundIdentifier[], pages = PAGES, onContinue = vi.fn()) {
  act(() => { root.render(<RedactionSummary pageTexts={pages} found={found} onContinue={onContinue} />); });
  return onContinue;
}
const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel);
const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const headline = () => $("[data-rs-headline]")?.textContent ?? "";
const live = () => $("[role=status][aria-live=polite]")?.textContent ?? "";
const click = (el: Element | null | undefined) => { expect(el, "element to click").toBeTruthy(); act(() => { (el as HTMLElement).click(); }); };
const openList = () => { const d = $<HTMLDetailsElement>("details.rs-list"); expect(d).toBeTruthy(); act(() => { d!.open = true; }); };
const rowFor = (category: string, n = 0) => $$(`.rs-row[data-category="${category}"]`)[n];
/** The accessible name through aria-labelledby (accname 1.2): each referenced element's text, skipping aria-hidden descendants. */
const visibleText = (n: Node): string => n.nodeType === Node.TEXT_NODE ? n.textContent ?? ""
  : n instanceof Element && n.getAttribute("aria-hidden") === "true" ? "" : [...n.childNodes].map(visibleText).join("");
const accName = (el: Element) => (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((id) => { const t = document.getElementById(id); return t ? visibleText(t) : ""; }).join(" ");

describe("RedactionSummary: the count", () => {
  it("states the distinct count in the heading, which takes focus, and announces nothing on mount", () => {
    render(FOUND);
    expect(headline()).toBe("4 personal identifiers removed before AI analysis");
    const h3 = host.querySelector("h3")!;
    expect(h3.contains($("[data-rs-headline]"))).toBe(true);
    expect(document.activeElement).toBe(h3);
    expect($(".rs-count")?.getAttribute("data-count")).toBe("4");
    expect($(".rs-headline-visual")?.getAttribute("aria-hidden")).toBe("true");
    expect(live()).toBe("");
  });

  it("lists the categories with their counts", () => {
    render(FOUND);
    expect($$(".rs-chip").map((c) => c.textContent)).toEqual(["2 names", "1 member ID", "1 phone number"]);
  });

  it("uses the singular for one identifier", () => {
    render([FOUND[2]]);
    expect(headline()).toBe("1 personal identifier removed before AI analysis");
    expect($(".rs-words")?.textContent).toBe("personal identifier removed before AI analysis");
  });

  it("says so when nothing was found, with no chips and no list", () => {
    render([], ["Deductible $50 per Covered Person."]);
    expect(headline()).toBe("No personal identifiers found.");
    expect($(".rs-caption")?.textContent).toBe("The AI receives the plan text as is.");
    expect($$(".rs-chip")).toHaveLength(0);
    expect($("details.rs-list")).toBeNull();
  });
});

describe("RedactionSummary: Keep in text", () => {
  it("is a real switch, named for its row, that changes the count live and announces it once", () => {
    render(FOUND);
    openList();
    const row = rowFor("member_id");
    const sw = row.querySelector<HTMLButtonElement>("[role=switch]")!;
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(accName(sw)).toBe("Keep in text Member ID masked, visible characters 1902");
    click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(headline()).toBe("3 personal identifiers removed before AI analysis");
    expect(live()).toBe("3 personal identifiers removed before AI analysis");
    expect(row.hasAttribute("data-kept")).toBe(true);
    expect(row.querySelector(".rs-where")?.textContent).toMatch(/^stays in the text, 1 place/);
    expect($(".rs-kept")?.textContent).toBe("1 identifier stays in the text, as you chose.");
    expect($$(".rs-chip").map((c) => c.textContent)).toEqual(["2 names", "1 phone number"]);
    expect($("pre")?.textContent).toContain("TWS-4471902");
    click(sw);
    expect(headline()).toBe("4 personal identifiers removed before AI analysis");
    expect(live()).toBe("4 personal identifiers removed before AI analysis");
    expect($(".rs-kept")).toBeNull();
    expect($("pre")?.textContent).not.toContain("TWS-4471902");
  });

  it("reaches zero with the plural (not the 'nothing found' sentence) when every identifier is kept", () => {
    render([FOUND[3]]);
    openList();
    click(rowFor("phone").querySelector("[role=switch]"));
    expect(headline()).toBe("0 personal identifiers removed before AI analysis");
    expect($(".rs-caption")?.textContent).toBe("The AI receives the plan text as is.");
  });

  it("hands Continue the result without the kept identifier", () => {
    const onContinue = render(FOUND);
    openList();
    click(rowFor("phone").querySelector("[role=switch]"));
    click($$("button").find((b) => b.textContent === "Continue"));
    expect(onContinue).toHaveBeenCalledTimes(1);
    const { result, terms } = onContinue.mock.calls[0][0] as { result: RedactionResult; terms: string[] };
    expect(result.total).toBe(3);
    expect(result.removed.map((f) => f.id).sort()).toEqual(["m-1", "n-jamie", "n-riley"]);
    expect(terms).toEqual([]);
  });
});

describe("RedactionSummary: masked values", () => {
  it("masks every value until Show, with a 'masked' description for screen readers", () => {
    render(FOUND);
    openList();
    const row = rowFor("member_id");
    const value = row.querySelector(".rs-value")!;
    expect(value.textContent).not.toContain("TWS-4471902");
    expect(value.querySelector(".sr-only")?.textContent).toMatch(/^masked/);
    const show = row.querySelector<HTMLButtonElement>(".rs-show")!;
    expect(show.getAttribute("aria-pressed")).toBe("false");
    expect(show.getAttribute("aria-label")).toBe("Show this member ID");
    expect(show.textContent).toBe("Show");
    click(show);
    expect(value.textContent).toBe("TWS-4471902");
    expect(show.getAttribute("aria-pressed")).toBe("true");
    expect(show.getAttribute("aria-label")).toBe("Hide this member ID");
    expect(headline()).toBe("4 personal identifiers removed before AI analysis");   // showing is not keeping
    click(show);
    expect(value.textContent).not.toContain("TWS-4471902");
  });

  it("never prints a raw value outside a shown row: the preview carries placeholder tokens", () => {
    render(FOUND);
    const pre = $("pre")!;
    for (const f of FOUND) expect(pre.textContent).not.toContain(f.value);
    const tokens = $$(".rs-token");
    expect(tokens.length).toBe(6);                                   // 3 + 1 names, 1 member ID, 1 phone
    expect(tokens.map((t) => t.getAttribute("data-category"))).toContain("member_id");
    expect(tokens[0].textContent).toBe("name removed");
    for (const kept of ["$50", "D0120", "$47.25", "80%"]) expect(pre.textContent).toContain(kept);
  });
});

describe("RedactionSummary: the person's own terms", () => {
  const add = (term: string) => {
    const input = $<HTMLInputElement>(".up-term input")!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, term);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => { $<HTMLFormElement>("form.up-term")!.requestSubmit(); });
  };

  it("removes a term on this device at once, counts it, and takes it back", () => {
    const onContinue = render(FOUND);
    add("Periodic oral evaluation");
    expect(headline()).toBe("5 personal identifiers removed before AI analysis");
    expect($(".rs-term .rs-where")?.textContent).toBe("1 place");
    expect($("pre")?.textContent).not.toContain("Periodic oral evaluation");
    click($$("button").find((b) => b.textContent === "Continue"));
    expect((onContinue.mock.calls[0][0] as { terms: string[] }).terms).toEqual(["Periodic oral evaluation"]);
    click(host.querySelector('[aria-label="Stop removing Periodic oral evaluation"]'));
    expect(headline()).toBe("4 personal identifiers removed before AI analysis");
  });

  it("validates length and duplicates, and marks a term that is not in the text", () => {
    render(FOUND);
    add("x");
    expect($("[role=alert]")?.textContent).toBe("A term needs at least 2 characters.");
    add("Lighthouse");
    expect($(".rs-term .rs-where")?.textContent).toBe("not in the text");
    expect(headline()).toBe("4 personal identifiers removed before AI analysis");
    add("lighthouse");
    expect($("[role=alert]")?.textContent).toBe("This term is already on the list.");
  });
});

describe("RedactionSummary: after upload", () => {
  it("locks the switches and the term field once the document is stored", () => {
    act(() => { root.render(<RedactionSummary pageTexts={PAGES} found={FOUND} onContinue={() => undefined} stored />); });
    openList();
    const sw = rowFor("phone").querySelector<HTMLButtonElement>("[role=switch]")!;
    expect(sw.disabled).toBe(true);
    expect($<HTMLInputElement>(".up-term input")!.readOnly).toBe(true);
    expect($(".rs-continue-note")?.textContent).toBe("The document is stored with these removals.");
    expect($$("button").some((b) => b.textContent === "Choose another file")).toBe(false);
  });
});
