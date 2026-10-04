import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class-name helper used by every vendored component (`@/lib/utils`). clsx + tailwind-merge, per component plan §1.5.
 *  Note for build agents: `npx shadcn add --overwrite` rewrites this file to `export { cn } from "cn"`; restore it afterwards. */
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
