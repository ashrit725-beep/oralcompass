import { api } from "./api";

/**
 * Reads an owner-scoped file (`GET /me/documents/{id}/file`, `Cache-Control: private, no-store`) into an object URL for pdf.js.
 * The bytes never leave the browser; the caller revokes the URL when the page unmounts.
 */
export async function ownedFileObjectUrl(path: string): Promise<string> {
  const m = /^\/me\/documents\/([^/]+)\/file$/.exec(path);
  if (!m) throw new Error(`unsupported owned file path ${path}`);
  return URL.createObjectURL(await api.documentFile(m[1]));
}
