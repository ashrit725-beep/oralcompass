import { describe, expect, it, vi } from "vitest";

// NumberFlow registers a custom element at import time; the type check below needs only the component's props.
vi.mock("@number-flow/react", () => ({ default: () => null }));

import { Money } from "@/components/Money";

/**
 * Compile-time contract (component plan N1, CLAUDE.md rule 2): a dollar figure without evidence does not compile.
 * `npm run build` runs `tsc --noEmit` over src/, so the `@ts-expect-error` below fails the build if `evidence` ever becomes optional.
 */
describe("Money", () => {
  it("requires the evidence prop at the type level", () => {
    // @ts-expect-error — `evidence` is required; a Money without a badge must not compile
    const missing = <Money cents={1} />;
    const ok = <Money cents={1} evidence="DOC" />;
    expect(missing).toBeTruthy();
    expect(ok.props.evidence).toBe("DOC");
  });

  it("renders a dash for a missing amount rather than $0.00", () => {
    const el = <Money cents={null} evidence="UNKNOWN" />;
    expect(el.props.cents).toBeNull();
  });
});
