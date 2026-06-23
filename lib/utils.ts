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

/**
 * Save a media URL to the user's device. Tries a real download via blob; if the
 * host blocks cross-origin fetch (CORS), falls back to opening it in a new tab.
 */
export async function downloadMedia(url: string): Promise<void> {
  const name = (url.split("/").pop()?.split("?")[0] || "clunoid-media").replace(/[^\w.\-]/g, "_");
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(obj), 5000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
