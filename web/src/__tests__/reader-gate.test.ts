import { describe, expect, it } from "vitest";
import { fileGate, isPdfFile, redactOnDevice } from "@/lib/reader-gate";
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
    expect(PLAN.readIntro).toMatch(/a photo or a scanned page cannot be redacted and reaches the model as it is/);
    expect(PLAN.readWorking).toMatch(/removed from the text/);
    expect(PLAN.readWorkingFile).toMatch(/cannot be redacted/);
    expect(PLAN.readGateImage).toMatch(/names, member IDs and dates on it are not removed/);
  });
});

describe("treatment-plan reader: on-device redaction of text (client redaction design point 6)", () => {
  it("removes the patient's name before the text is sent, and keeps tooth numbers, codes and fees", () => {
    const text = "Northside Dental Group estimate (fictional)\nPatient: Alex Chen\nTooth  Code   Procedure  Fee\n30     D3330  Root canal, molar  $1,120.00";
    const r = redactOnDevice(text);
    expect(r.total).toBe(1);
    expect(r.text).not.toMatch(/Alex Chen/);
    expect(r.text).toContain("[name removed]");
    for (const kept of ["30", "D3330", "Root canal, molar", "$1,120.00"]) expect(r.text).toContain(kept);
  });
  it("leaves text without identifiers as it is", () => {
    const text = "Tooth  Procedure  Fee\n14  Crown, porcelain  $1,020.00";
    expect(redactOnDevice(text)).toEqual({ text, total: 0 });
  });
  it("recognises a PDF by type or name", () => {
    expect(isPdfFile(pdf)).toBe(true);
    expect(isPdfFile({ type: "", name: "Estimate.PDF" })).toBe(true);
    expect(isPdfFile(png)).toBe(false);
  });
});
