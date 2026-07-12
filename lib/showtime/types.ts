/**
 * Showtime — live TikTok event data model.
 *
 * Minimal by design: the Euler feed + Realtime bus carry exactly two event kinds the
 * penalty game consumes — GIFTS (votes with power: coin value = vote weight + boost)
 * and CHAT comments (free votes). Everything game-specific (players, zones, phases,
 * gift→action mapping) lives under lib/showtime/game/.
 */
export type Tier = 1 | 2 | 3 | 4;

export type Gift = {
  id: string;
  name: string;
  emoji: string;
  coins: number; // TikTok coin value — drives vote weight and boosts
  tier: Tier;
};

/** One received gift (real or simulated), ready to be handled by the stage. */
export type GiftEvent = { gift: Gift; sender: string; count: number; ts: number };

/** One chat comment (real or simulated) — the free voting channel. */
export type ChatEvent = { sender: string; text: string; ts: number };

/** What travels over the Realtime bus, console → stage. */
export type StageEvent = { kind: "gift"; ev: GiftEvent } | { kind: "chat"; ev: ChatEvent };

/** A catalog entry for the on-screen gift guide (live from Euler, or static fallback). */
export type CatalogGift = { name: string; coins: number; image?: string };
