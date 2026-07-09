/**
 * Showtime — Clunoid's live, gift-reactive animation stage (admin-only for now).
 * Gift data model. The animation renderer is being re-planned around professionally
 * made assets (Lottie / Rive / alpha-video), so this file holds only the gift types
 * shared by the catalogue, the TikTok feed and the console.
 */
export type Tier = 1 | 2 | 3 | 4;
/** A coarse visual family we'll map each gift's asset to when the new system lands. */
export type ShowArchetype = "bloom" | "portal" | "cosmic" | "beast";

export type Gift = {
  id: string;
  name: string;
  emoji: string;
  coins: number; // TikTok coin value — drives the tier
  tier: Tier;
  archetype: ShowArchetype;
  theme: string[]; // 2–4 hex accent colors
};

/** One received gift (real or simulated) ready to be staged. */
export type GiftEvent = { gift: Gift; sender: string; count: number; ts: number };
