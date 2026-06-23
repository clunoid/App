import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, resolving Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Tidy a person's name: trim, collapse spaces, and capitalize the first letter
 * of each word (so "ada lovelace" → "Ada Lovelace"). The rest of each word is
 * left as typed, so deliberate caps like "McDonald" survive.
 */
export function formatName(s: string | undefined | null): string {
  return (s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
