import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary, isChunkLoadError } from "@/components/ErrorBoundary";

describe("Error boundary (web-correctness-3)", () => {
  it("captures a render error into state instead of unmounting the app", () => {
    const err = new Error("Cannot read properties of undefined (reading 'some')");
    expect(ErrorBoundary.getDerivedStateFromError(err)).toEqual({ error: err });
  });
  it("recognises a lazy chunk that could not be downloaded", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/PageView-x.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("boom"))).toBe(false);
  });
  it("logs nothing but the message (no record contents)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    new ErrorBoundary({ children: null }).componentDidCatch(new Error("x"), { componentStack: "\n at View" } as never);
    expect(spy).toHaveBeenCalledWith("OralCompass surface failed:", "x", "\n at View");
    spy.mockRestore();
  });
});
