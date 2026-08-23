/**
 * CREATOR PROGRAM — the platform set, server side.
 *
 * Mirrors the catalogue the UI shows, minus the labels and logos. Kept separate
 * so API routes never import a React component tree, and so the list of what we
 * will accept lives in exactly one place on the server.
 */

export const PLATFORM_KEYS = [
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "snapchat",
] as const;

export type PlatformKey = (typeof PLATFORM_KEYS)[number];

/** Everyone posts each video to exactly this many platforms. */
export const PLATFORMS_REQUIRED = 3;

export const DEFAULT_PLATFORMS: PlatformKey[] = ["tiktok", "instagram", "youtube"];

export function isPlatform(v: unknown): v is PlatformKey {
  return typeof v === "string" && (PLATFORM_KEYS as readonly string[]).includes(v);
}

/**
 * Reduce whatever came in to a valid choice of three: known keys only, no
 * duplicates, exactly PLATFORMS_REQUIRED of them. Returns null when the caller
 * sent something we cannot honour, so the route can say so rather than silently
 * storing a set the creator did not pick.
 */
export function parsePlatformChoice(v: unknown): PlatformKey[] | null {
  if (!Array.isArray(v)) return null;
  const picked = [...new Set(v.filter(isPlatform))];
  return picked.length === PLATFORMS_REQUIRED ? picked : null;
}
