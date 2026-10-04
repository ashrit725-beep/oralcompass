import { describe, expect, it } from "vitest";
import { REVOKE_DELAY_MS, failureReason, saveJson, type DownloadEnv } from "@/lib/download";

describe("Download a copy of my data (web-correctness-18)", () => {
  it("clicks an attached anchor and revokes the object URL on a later task, not synchronously", () => {
    const events: string[] = [];
    const anchor = { href: "", download: "", rel: "", style: {} as Record<string, string>, click: () => events.push("click"), remove: () => events.push("remove") };
    const timers: [() => void, number][] = [];
    const env: DownloadEnv = {
      document: { createElement: () => anchor, body: { appendChild: () => { events.push("append"); return anchor; } } } as unknown as DownloadEnv["document"],
      URL: { createObjectURL: () => "blob:1", revokeObjectURL: (u: string) => events.push(`revoke ${u}`) } as unknown as DownloadEnv["URL"],
      setTimeout: (fn, ms) => { timers.push([fn, ms]); return 0; },
    };
    saveJson({ a: 1 }, "oralcompass-my-data.json", env);
    expect(anchor.download).toBe("oralcompass-my-data.json");
    expect(events).toEqual(["append", "click", "remove"]);    // not revoked yet
    expect(timers[0][1]).toBe(REVOKE_DELAY_MS);
    timers[0][0]();
    expect(events.at(-1)).toBe("revoke blob:1");
  });

  it("names the failure reason for the status line", () => {
    expect(failureReason(new Error("500 /me/export"))).toBe("500 /me/export");
    expect(failureReason("offline")).toBe("offline");
  });
});
