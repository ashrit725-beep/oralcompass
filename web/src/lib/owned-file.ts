/**
 * Reads an owner-scoped file (`GET /me/documents/{id}/file`, `Cache-Control: private, no-store`) into an object URL for pdf.js.
 * The frozen `lib/api.ts` has no binary GET; this mirrors its dev header until `api.documentFile(id)` exists (listed in open issues).
 * The bytes never leave the browser; the caller revokes the URL when the page unmounts.
 */
const DEV_USER = "demo-user";   // same dev-auth identity as lib/api.ts; production sends the Cognito JWT instead

export async function ownedFileObjectUrl(path: string): Promise<string> {
  const r = await fetch(`/api${path}`, { headers: { "X-Dev-User": DEV_USER } });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return URL.createObjectURL(await r.blob());
}
