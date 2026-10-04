import { describe, expect, it } from "vitest";
import { fileGate } from "@/lib/reader-gate";
import { PLAN } from "@/lib/copy/plan";

const png = { type: "image/png" }, pdf = { type: "application/pdf" };

describe("treatment-plan reader send gate (info-only-3, web-correctness-22; orchestrator note 11)", () => {
  it("holds every file behind a confirm in live mode, and while the mode is not known yet", () => {
    expect(fileGate("live", png)).toBe("confirm");
    expect(fileGate("live", pdf)).toBe("confirm");
    expect(fileGate(null, png)).toBe("confirm");
    expect(fileGate(undefined, pdf)).toBe("confirm");
  });

  it("never sends an image in demo mode; a PDF goes to the text-layer demo read (no model)", () => {
    expect(fileGate("demo", png)).toBe("demo_image");
    expect(fileGate("demo", { type: "IMAGE/JPEG" })).toBe("demo_image");
    expect(fileGate("demo", pdf)).toBe("send");
  });

  it("does not claim a photo is redacted", () => {
    expect(PLAN.readIntro).toMatch(/a photo reaches the model as it is/);
    expect(PLAN.readWorking).toMatch(/removed from the text/);
    expect(PLAN.readWorkingFile).toMatch(/cannot be redacted/);
    expect(PLAN.readGateImage).toMatch(/names, member IDs and dates on it are not removed/);
  });
});
