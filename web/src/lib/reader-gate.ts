/**
 * What happens to a file picked in the treatment-plan reader before anything is posted (orchestrator note 11; CLAUDE.md rule 7).
 * - live mode (or the mode is not known yet): every file is held and the reader shows the notice with a required confirm. An image
 *   cannot be redacted, and a PDF without a text layer is sent as page images, so neither leaves the browser until the user confirms.
 * - demo mode: no model is called. A PDF is read on the server through its text layer against the stored fictional estimates; an
 *   image is not sent at all (demo mode has nothing to read it with).
 */
export type FileGate = "confirm" | "send" | "demo_image";

export const isImageFile = (f: { type: string }) => f.type.toLowerCase().startsWith("image/");

export function fileGate(mode: "demo" | "live" | null | undefined, file: { type: string }): FileGate {
  if (mode === "demo") return isImageFile(file) ? "demo_image" : "send";
  return "confirm";
}

export const isPdfFile = (f: { type: string; name?: string }) => f.type.toLowerCase() === "application/pdf" || /\.pdf$/i.test(f.name ?? "");

/** The reader's text limit (api/app/treatment_reader.py MAX_TEXT_CHARS). */
export const READER_MAX_TEXT = 20_000;

/** Client redaction design point 6: the same on-device detector as the upload wizard, applied to a pasted estimate or a PDF's text layer
 *  before anything is sent. Returns the redacted text and the DISTINCT count. */
export async function redactOnDevice(text: string): Promise<{ text: string; total: number }> {
  const { applyRedaction, detectIdentifiers } = await import("./redact");   // the detector loads with the first read, not with the app
  const pages = [text];
  const r = applyRedaction(pages, detectIdentifiers(pages), new Set(), []);
  return { text: r.pages[0] ?? "", total: r.total };
}
