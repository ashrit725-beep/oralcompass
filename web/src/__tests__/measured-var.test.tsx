// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMeasuredVar } from "@/hooks/useAskKeyboardInset";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let h = 64;
function Probe({ active = true }: { active?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useMeasuredVar(ref, "--dock-h", active);
  return <div ref={(el) => { ref.current = el; if (el) el.getBoundingClientRect = () => ({ height: h, width: 390, top: 0, left: 0, right: 390, bottom: h, x: 0, y: 0, toJSON: () => ({}) }); }} />;
}
let host: HTMLDivElement; let root: Root;
const v = () => document.documentElement.style.getPropertyValue("--dock-h");
afterEach(() => { act(() => root.unmount()); host.remove(); h = 64; });

describe("useMeasuredVar (--dock-h at every width)", () => {
  it("publishes the height at mount, follows window resizes (wide window, rotation), and clears on unmount", () => {
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    act(() => root.render(<Probe />));
    expect(v()).toBe("64px");
    h = 56; act(() => { window.dispatchEvent(new Event("resize")); });
    expect(v()).toBe("56px");
    h = 72; act(() => { window.dispatchEvent(new Event("orientationchange")); });
    expect(v()).toBe("72px");
    h = 0; act(() => { window.dispatchEvent(new Event("resize")); });
    expect(v()).toBe("");                                        // hidden: the CSS fallback applies
    act(() => root.render(<Probe active={false} />));
    expect(v()).toBe("");
  });
});
