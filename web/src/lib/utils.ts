import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class-name helper used by every vendored component (`@/lib/utils`). clsx + tailwind-merge, per component plan §1.5. */
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
