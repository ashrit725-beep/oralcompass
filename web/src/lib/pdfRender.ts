/**
 * Page-by-page rendering with a cancellation check after EVERY await (web-correctness-16). A superseded run (the URL changed, the view
 * unmounted) never appends a page into a container that a newer run has already cleared: `isCancelled` is consulted before each load and
 * again after it resolves, right before `append`.
 *
 * Returns true when every page was appended, false when the run stopped because it was cancelled.
 */
export async function renderSequential<P>(
  numPages: number,
  load: (pageNumber: number) => Promise<P>,
  append: (pageNumber: number, page: P) => void,
  isCancelled: () => boolean,
): Promise<boolean> {
  for (let p = 1; p <= numPages; p++) {
    if (isCancelled()) return false;
    const page = await load(p);
    if (isCancelled()) return false;
    append(p, page);
  }
  return !isCancelled();
}

/** A stable key for a stitch list: the page overlay repaints when the set of stitches changes, not when the array identity does. */
export const stitchKey = (stitches: { id: string }[]) => stitches.map((s) => s.id).join("|");
