// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import alexJson from "../__fixtures__/passage/alex.json";

vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => `$${value.toFixed(2)}` }));
vi.mock("@/lib/api", () => {
  class ApiError extends Error { constructor(public status: number, public path: string, public body?: unknown) { super(`${status} ${path}`); } }
  return {
    ApiError,
    api: {
      ask: vi.fn(), health: vi.fn(async () => ({ llm_mode: "demo", llm_model: null })),
      // the lazy payload fetch (only what the provider does not hold): benefits are not on record for this plan, no rules or clauses
      savedEstimate: vi.fn(async () => null), planByRef: vi.fn(async () => ({ model: null })), benefitsFor: vi.fn(async () => null), rulesByRef: vi.fn(async () => ({ rules: [] })),
      treatmentItems: vi.fn(async () => []), evidenceByRef: vi.fn(async () => ({ clauses: [] })),
    },
  };
});

import { api, ApiError } from "@/lib/api";
import { ASSIST } from "@/lib/copy/assistant";
import type { SavedEstimate, TreatmentItem, PlanFixture } from "@/lib/types";
import { AssistDataProvider } from "@/components/assistant/AssistData";
import { AskDock } from "@/components/assistant/AskBox";
import { AskAboutStep } from "@/components/assistant/AskAboutStep";
import { clearAskMemory } from "@/hooks/useAsk";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// happy-dom's Web Animations reject `finished` with AbortError when motion cancels a loop on unmount (browsers do not surface it the
// same way): without `animate`, motion drives the same end states with its JS frame loop.
delete (Element.prototype as { animate?: unknown }).animate;
const alex = alexJson as unknown as { estimate: SavedEstimate; items: TreatmentItem[]; plan: PlanFixture };
const ask = api.ask as unknown as ReturnType<typeof vi.fn>;
const scope = { plan_ref: "ML26", estimate_id: alex.estimate.id, journey_id: "j1" };
const provided = { planRef: "ML26", estimate: alex.estimate, items: alex.items, plan: alex.plan, benefits: null, rules: [], stitches: [] };

const totalAnswer = {
  mode: "demo", ribbon: ASSIST.demoRibbon, intent: "journey_total", suggested: ["Server suggestion"], guard: { dropped: 0, grounding_failures: 0 }, tools_used: ["get_estimate_line(line 0)"],
  blocks: [
    { type: "sentence", kind: "simple", text: "For the planned work, you pay {{ref:0}} and the plan pays {{ref:1}}.", refs: [{ kind: "field", path: "estimate.ledger.patient_total_cents" }, { kind: "field", path: "estimate.ledger.plan_total_cents" }] },
    { type: "sentence", text: "The crown line: you pay {{ref:0}}.", refs: [{ kind: "line_total", line_index: 1, which: "patient" }] },
  ],
};
const simplerAnswer = { ...totalAnswer, blocks: [{ type: "sentence", kind: "simple", text: "You pay {{ref:0}}.", refs: [{ kind: "field", path: "estimate.ledger.patient_total_cents" }] }] };

let host: HTMLDivElement;
let root: Root;
const flush = async (n = 4) => { for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); }); };
function render(node: React.ReactNode) {
  act(() => { root.render(<AssistDataProvider value={provided}>{node}</AssistDataProvider>); });
}
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const buttons = () => [...document.querySelectorAll("button")];
const byText = (t: string) => buttons().find((b) => b.textContent?.trim() === t) as HTMLButtonElement | undefined;
const click = async (el: Element | undefined | null) => { expect(el).toBeTruthy(); await act(async () => { (el as HTMLElement).click(); }); await flush(); };
/** The AskBox is the field above the dock + the sheet it opens (the desktop card is gone): render the dock for a tab and open its sheet. */
async function openSheet(tab: "journey" | "plan" | "compare" | "documents", sc: typeof scope = scope) {
  render(<AskDock tab={tab} scope={sc} />);
  await click(q(".askfield"));
  expect(q(".ask-sheet[data-state=open]")).toBeTruthy();
}

beforeEach(() => {
  clearAskMemory();
  ask.mockReset();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); document.body.innerHTML = ""; vi.useRealTimers(); });

describe("AskBox chips (in the sheet)", () => {
  it("four kid-simple cost chips, the title and the composer", async () => {
    await openSheet("journey");
    const chips = [...document.querySelectorAll(".askbox-chips-sheet button")].map((b) => b.textContent);
    expect(chips).toEqual(["How much is a cleaning?", "How much is a filling?", "How much is a crown?", "What does deductible mean?"]);
    expect(q(".ask-sheet .ask-sheet-title")?.textContent).toBe("Ask what it costs");
    const ta = q<HTMLTextAreaElement>(".ask-sheet textarea")!;
    expect(ta.getAttribute("aria-label")).toBe("Ask what it costs");
    expect(ta.getAttribute("placeholder")).toBe(ASSIST.boxPlaceholder);
  });
  it.each(["plan", "documents"] as const)("%s: the same chips, as buttons", async (tab) => {
    await openSheet(tab);
    const chips = [...document.querySelectorAll(".askbox-chips-sheet button")];
    expect(chips.map((b) => b.textContent)).toEqual(ASSIST.boxChips);
    expect(chips.every((b) => b.tagName === "BUTTON" && b.getAttribute("type") === "button")).toBe(true);
  });
  it("keeps its chips after an answer (the server's step suggestions are for the step composer)", async () => {
    ask.mockResolvedValue(totalAnswer);
    await openSheet("plan");
    await click(byText("What does deductible mean?"));
    expect([...document.querySelectorAll(".askbox-chips-sheet button")].map((b) => b.textContent)).toEqual(ASSIST.boxChips);
  });
});

describe("the Plan dropdown and the hero numbers", () => {
  const costAnswer = {
    mode: "demo", intent: "procedure_cost", ribbon: null, suggested: [], tools_used: [], guard: { dropped: 0, grounding_failures: 0 },
    blocks: [{ type: "sentence", kind: "simple", text: "A crown costs about {{ref:0}}. Insurance pays {{ref:1}}. You pay {{ref:2}}.", refs: [
      { kind: "quick_estimate", which: "fee", cents: 120000, evidence: "ASSUMED" },
      { kind: "quick_estimate", which: "plan", cents: 60000, evidence: "DOC" },
      { kind: "quick_estimate", which: "patient", cents: 60000, evidence: "DOC" },
    ] }],
  };
  it("is a real select labelled Plan with exactly Plan A, B and C", async () => {
    await openSheet("journey");
    const sel = q<HTMLSelectElement>(".ask-sheet select")!;
    expect(sel.tagName).toBe("SELECT");
    expect(document.querySelector(`label[for="${sel.id}"]`)?.textContent).toBe("Plan");
    expect([...sel.options].map((o) => o.value)).toEqual(["A", "B", "C"]);
    expect([...sel.options].map((o) => o.textContent?.split(" · ")[0])).toEqual(["Plan A", "Plan B", "Plan C"]);
    expect(sel.value).toBe("A");
  });
  it("sends plan_choice with the question and remembers the choice for the session", async () => {
    ask.mockResolvedValue(costAnswer);
    await openSheet("journey");
    const sel = q<HTMLSelectElement>(".ask-sheet select")!;
    await act(async () => { sel.value = "B"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
    await click(byText("How much is a crown?"));
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ message: "How much is a crown?", plan_choice: "B" }));
    expect(window.sessionStorage.getItem("oc.ask.plan")).toBe("B");
    window.sessionStorage.removeItem("oc.ask.plan");
  });
  it("shows You pay and Insurance pays as the hero numbers, the price smaller as our guess", async () => {
    ask.mockResolvedValue(costAnswer);
    await openSheet("journey");
    await click(byText("How much is a crown?"));
    const hero = q("[data-testid=cost-hero]")!;
    expect(hero).toBeTruthy();
    const terms = [...hero.querySelectorAll("dt")].map((d) => d.textContent);
    expect(terms).toEqual(["You pay", "Insurance pays"]);
    expect(hero.querySelectorAll(".as-hero-amt").length).toBe(2);
    expect(hero.querySelector(".as-hero-fee")?.textContent).toContain("Our guess of the price");
    expect(hero.querySelector(".as-hero-plan")?.textContent).toContain("Plan A");
  });
});

describe("answers: simple terms first, details closed, one announcement", () => {
  it("asks with the journey scope and style plain, renders the plain-words lead first and the details behind a closed disclosure", async () => {
    ask.mockResolvedValue(totalAnswer);
    await openSheet("journey");
    await click(byText("How much is a crown?"));
    expect(ask).toHaveBeenCalledWith({ message: "How much is a crown?", scope, style: "plain", plan_choice: "A" });
    const card = q(".as-answer")!;
    const first = card.querySelector(".as-simple, .as-blocks, .as-details");
    expect(first?.className).toContain("as-simple");
    expect(card.querySelector(".as-simple-label")?.textContent).toBe("In simple terms");
    expect(card.querySelector(".as-simple-text")?.textContent).toContain("$902.00");
    expect(card.querySelector(".as-simple-text")?.textContent).toContain("Calculated from the clauses cited");
    const toggle = byText("Show the details")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(region.hidden).toBe(true);
    expect(region.textContent).toBe("");
    // one live region speaks the answer once
    const live = [...document.querySelectorAll("[aria-live]")];
    expect(live).toHaveLength(1);
    expect(live[0].textContent).toBe("Answer: For the planned work, you pay $902.00 (calculated from the clauses cited) and the plan pays $1,098.00 (calculated from the clauses cited).");
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(region.hidden).toBe(false);
    expect(region.textContent).toContain("The crown line: you pay");
    expect(region.textContent).toContain("$510.00");
    expect(live[0].textContent).toMatch(/^Answer: For the planned work/);   // opening the details does not re-announce
    await click(byText("Hide the details"));
    expect(region.hidden).toBe(true);
  });

  it("'Say it more simply' re-asks the same question with style simpler and adds the plainer sentence to the same card", async () => {
    ask.mockResolvedValueOnce(totalAnswer).mockResolvedValueOnce(simplerAnswer);
    await openSheet("journey");
    await click(byText("How much is a crown?"));
    await click(byText("Say it more simply"));
    expect(ask).toHaveBeenLastCalledWith({ message: "How much is a crown?", scope, style: "simpler", plan_choice: "A" });
    expect(document.querySelectorAll(".as-answer")).toHaveLength(1);
    const simpler = q(".as-simpler")!;
    expect(simpler.querySelector(".as-simple-label")?.textContent).toBe("Even simpler");
    expect(simpler.textContent).toContain("You pay $902.00");
    expect(byText("Say it more simply")).toBeUndefined();
    expect(q("[aria-live]")?.textContent).toMatch(/^Even simpler: You pay \$902\.00/);
  });

  it("a payload fetch that stalls delays the announcement by at most 1.5 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (api.benefitsFor as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise(() => {}));
    ask.mockResolvedValue(totalAnswer);
    await openSheet("journey");
    await click(byText("How much is a crown?"));
    expect(q("[aria-live]")?.textContent).toBe("");
    await act(async () => { vi.advanceTimersByTime(1600); }); await flush();
    expect(q("[aria-live]")?.textContent).toMatch(/^Answer: For the planned work, you pay \$902\.00/);
  });

  it("an older answer without a simple block renders its blocks directly (no disclosure)", async () => {
    ask.mockResolvedValue({ ...totalAnswer, blocks: [totalAnswer.blocks[1]] });
    await openSheet("journey");
    await click(byText("How much is a crown?"));
    expect(q(".as-answer")?.getAttribute("data-simple")).toBe("false");
    expect(byText("Show the details")).toBeUndefined();
    expect(q(".as-answer .as-sentence")?.textContent).toContain("$510.00");
  });

  it("keeps the newest answer open and earlier ones behind a disclosure", async () => {
    ask.mockResolvedValue(totalAnswer);
    await openSheet("journey");
    await click(byText("How much is a crown?"));
    await click(byText("What does deductible mean?"));
    expect(document.querySelectorAll(".as-answers")[0].querySelectorAll(":scope > .as-answer")).toHaveLength(1);
    expect(q(".as-earlier summary")?.textContent).toBe("1 earlier answer");
  });
});

describe("states", () => {
  it("sending: the send button and chips wait, the question box stays editable", async () => {
    let resolve!: (v: unknown) => void;
    ask.mockReturnValue(new Promise((r) => { resolve = r; }));
    await openSheet("plan");
    await click(byText("What does deductible mean?"));
    expect(q(".as-thought")).toBeTruthy();
    expect(byText("How much is a cleaning?")?.disabled).toBe(true);
    expect(q<HTMLTextAreaElement>(".ask-sheet textarea")?.disabled).toBe(false);
    await act(async () => { resolve(totalAnswer); }); await flush();
    expect(q(".as-thought")).toBeNull();
    expect(byText("How much is a cleaning?")?.disabled).toBe(false);
  });
  it("rate limited: says so and pauses the chips", async () => {
    ask.mockRejectedValue(new ApiError(429, "/me/assistant"));
    await openSheet("plan");
    await click(byText("What does deductible mean?"));
    expect(q("[role=alert]")?.textContent).toBe(ASSIST.rateLimited);
    expect(byText("How much is a cleaning?")?.disabled).toBe(true);
  });
  it("live unavailable and offline have their own words", async () => {
    ask.mockRejectedValueOnce(new ApiError(503, "/me/assistant"));
    await openSheet("plan");
    await click(byText("What does deductible mean?"));
    expect(q("[role=alert]")?.textContent).toBe(ASSIST.liveUnavailable);
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    await click(byText("How much is a cleaning?"));
    expect(q("[role=alert]")?.textContent).toBe(ASSIST.offline);
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it("nothing survived: a plain-words lead that states its own amount is dropped and counted", async () => {
    ask.mockResolvedValue({ ...totalAnswer, intent: "explain_step", blocks: [{ type: "sentence", kind: "simple", text: "You pay $902.00.", refs: [] }] });
    await openSheet("journey");
    await click(byText("How much is a crown?"));
    expect(q(".as-answer")?.textContent).toContain(ASSIST.boxNothingSurvived);
    expect(q(".as-answer")?.textContent).toContain(ASSIST.guardRemoved(1));
    expect(q(".as-answer")?.textContent).not.toContain("$902.00.");
  });
  it("remembers a tab's answers when the card is unmounted and mounted again (tab switch)", async () => {
    ask.mockResolvedValue(totalAnswer);
    await openSheet("journey");
    await click(byText("How much is a crown?"));
    await openSheet("plan");
    expect(q(".as-answer")).toBeNull();
    await openSheet("journey");
    expect(q(".as-answer .as-asked")?.textContent).toBe(ASSIST.asked("How much is a crown?"));
  });
});

describe("the phone field and sheet", () => {
  it("opens the sheet from the field, focuses the composer, closes back to the field", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AskDock tab="journey" scope={scope} />);
    const field = q<HTMLButtonElement>(".askfield")!;
    expect(field.textContent).toContain("Ask what it costs");
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(q(".ask-sheet")).toBeNull();
    await click(field);
    const sheet = q(".ask-sheet")!;
    expect(sheet).toBeTruthy();
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(field.getAttribute("aria-expanded")).toBe("true");
    expect(q(".askfield-bar")?.getAttribute("data-open")).toBe("true");
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
    expect([...sheet.querySelectorAll(".askbox-chips-sheet button")].map((b) => b.textContent)).toHaveLength(4);
    // the dock stays reachable: the sheet is not modal and nothing outside it is hidden from assistive tech
    expect(sheet.getAttribute("aria-modal")).not.toBe("true");
    await click([...sheet.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Close" && b.querySelector("svg")));
    await act(async () => { vi.advanceTimersByTime(600); }); await flush();
    expect(q(".ask-sheet[data-state=open]")).toBeNull();
    expect(document.activeElement).toBe(field);
  });
  it("the on-screen keyboard lifts the sheet: its bottom follows the visual viewport (the composer is never covered)", async () => {
    const vv = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0, width: window.innerWidth, scale: 1 });
    const had = Object.getOwnPropertyDescriptor(window, "visualViewport");
    Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
    try {
      render(<AskDock tab="journey" scope={scope} />);
      await click(q(".askfield"));
      const sheet = q<HTMLElement>(".ask-sheet")!;
      expect(sheet.style.bottom).toBe("");                  // no keyboard: the sheet sits on the dock (CSS var --dock-h)
      vv.height = window.innerHeight - 320;                 // keyboard up: 320 px of the layout viewport hidden
      await act(async () => { vv.dispatchEvent(new Event("resize")); }); await flush();
      expect(sheet.style.bottom).toBe("320px");
      expect(sheet.style.maxHeight).toBe(`${window.innerHeight - 320 - 8}px`);
      vv.height = window.innerHeight;                        // keyboard down
      await act(async () => { vv.dispatchEvent(new Event("resize")); }); await flush();
      expect(sheet.style.bottom).toBe("");
    } finally {
      if (had) Object.defineProperty(window, "visualViewport", had); else delete (window as { visualViewport?: unknown }).visualViewport;
    }
  });

  it("answers inside the sheet with the same simple-first card", async () => {
    ask.mockResolvedValue(totalAnswer);
    render(<AskDock tab="journey" scope={scope} />);
    await click(q(".askfield"));
    await click([...document.querySelectorAll(".ask-sheet button")].find((b) => b.textContent === "How much is a crown?"));
    expect(q(".ask-sheet .as-simple-text")?.textContent).toContain("$902.00");
    expect(q(".ask-sheet .as-disclosure")?.getAttribute("aria-expanded")).toBe("false");
  });
  it("a tab change closes the sheet", async () => {
    render(<AskDock tab="journey" scope={scope} />);
    await click(q(".askfield"));
    expect(q(".ask-sheet[data-state=open]")).toBeTruthy();
    render(<AskDock tab="plan" scope={scope} />);
    await flush();
    expect(q(".askfield")?.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("the step composer still works on the shared pieces", () => {
  it("drawer scope: step suggestions, scope selector, answers through the same card", async () => {
    ask.mockResolvedValue(totalAnswer);
    render(<AskAboutStep scope={{ plan_ref: "ML26", estimate_id: alex.estimate.id, line_index: 0, step_key: "deductible" }} />);
    expect(q(".as-h3")?.textContent).toBe(ASSIST.heading);
    expect([...document.querySelectorAll(".as-suggestions button")].map((b) => b.textContent)).toEqual(ASSIST.suggestions.D);
    await click(byText(ASSIST.suggestions.D[0]));
    expect(ask.mock.calls[0][0]).toMatchObject({ message: ASSIST.suggestions.D[0], style: "plain", scope: { plan_ref: "ML26", step_key: "deductible", line_index: 0 } });
    expect(q(".as-answer .as-simple-text")?.textContent).toContain("$902.00");
    // the composer adopts the server's follow-up suggestions
    expect([...document.querySelectorAll(".as-suggestions button")].map((b) => b.textContent)).toEqual(["Server suggestion"]);
  });
});

describe("Compare and Documents scopes, the estimate_total ref", () => {
  it("never sends scope.compare and shows no comparing chip", async () => {
    ask.mockResolvedValue(totalAnswer);
    await openSheet("plan");
    const chips = [...document.querySelectorAll(".askbox-chips-sheet button")].map((b) => b.textContent ?? "");
    expect(chips.some((c) => /differen|compar/i.test(c))).toBe(false);
    await click(byText("How much is a crown?"));
    expect(ask.mock.calls[0][0].scope).not.toHaveProperty("compare");
  });
  it("renders an estimate_total ref as the journey's calculated total (the facts line's numbers), tabular, with the calculated label", async () => {
    ask.mockResolvedValue({ ...totalAnswer, blocks: [{ type: "sentence", kind: "simple", text: "You pay {{ref:0}} and the plan pays {{ref:1}}.", refs: [{ kind: "estimate_total", which: "patient" }, { kind: "estimate_total", which: "plan" }] }] });
    await openSheet("journey");
    await click(byText("How much is a crown?"));
    const text = q(".ask-sheet .as-simple-text")!;
    expect(text.textContent).toContain("$902.00");
    expect(text.textContent).toContain("$1098.00");                   // NumberFlow is mocked with toFixed (no grouping) here
    expect(text.querySelectorAll(".amt.tabular-nums")).toHaveLength(2);
    expect(text.textContent).toContain("Calculated from the clauses cited");
    expect(q("[aria-live]")?.textContent).toBe("Answer: You pay $902.00 (calculated from the clauses cited) and the plan pays $1,098.00 (calculated from the clauses cited).");
  });
});
