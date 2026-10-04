import { useEffect, useState } from "react";

/** The app's phone breakpoint (760 px) — matches the `@media (max-width: 760px)` rules in styles.css. (shadcn's `useIsMobile` in
 *  hooks/use-mobile.ts uses 768 px and is only for vendored components.) */
export function useMobile() {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => { const q = window.matchMedia("(max-width: 760px)"); const f = () => setM(q.matches); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  return m;
}
