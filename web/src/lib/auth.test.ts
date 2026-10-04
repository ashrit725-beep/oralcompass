import { afterEach, describe, expect, it, vi } from "vitest";
import { authHeaders, devAuthEnabled, withAuth, DEV_AUTH } from "./auth";
import { apiFetch } from "./api";

describe("dev auth gating (api/app/sessions.py is the production path)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends X-Dev-User only in dev builds or with VITE_DEV_AUTH=1", () => {
    expect(devAuthEnabled({ DEV: true })).toBe(true);
    expect(devAuthEnabled({ DEV: false, VITE_DEV_AUTH: "1" })).toBe(true);
    expect(devAuthEnabled({ DEV: false })).toBe(false);
    expect(devAuthEnabled({ DEV: false, VITE_DEV_AUTH: "0" })).toBe(false);
    expect(authHeaders(false)).toEqual({});
    expect(authHeaders(true)).toEqual({ "X-Dev-User": "demo-user" });
  });

  it("always sends same-origin credentials and keeps caller headers", () => {
    const prod = withAuth({ method: "POST", headers: { "Content-Type": "application/json" } }, false);
    expect(prod.credentials).toBe("same-origin");
    expect(prod.headers).toEqual({ "Content-Type": "application/json" });
    const dev = withAuth({}, true);
    expect(dev.headers).toEqual({ "X-Dev-User": "demo-user" });
  });

  it("the test build is a dev build, so existing calls keep the dev header", async () => {
    expect(DEV_AUTH).toBe(true);
    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { seen.push(init); return new Response("{}", { status: 200 }); }));
    await apiFetch("/health");
    expect(seen[0].credentials).toBe("same-origin");
    expect((seen[0].headers as Record<string, string>)["X-Dev-User"]).toBe("demo-user");
  });
});
