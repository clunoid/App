import type { Gift, GiftEvent, Tier } from "./types";

/** Tier by TikTok coin value. Tier only scales duration/stages/particle budget —
 *  NOT fidelity: every gift gets a fully polished show. */
export function tierForCoins(coins: number): Tier {
  if (coins >= 10000) return 4;
  if (coins >= 1000) return 3;
  if (coins >= 100) return 2;
  return 1;
}

/** A representative catalogue of real TikTok gifts, each mapped to a choreographed
 *  archetype + colour theme. Adding a gift is one line; the same 4 archetypes cover
 *  everything by re-theming + re-scaling, so the show library stays small. */
export const GIFTS: Gift[] = [
  { id: "rose", name: "Rose", emoji: "🌹", coins: 1, tier: 1, archetype: "bloom", theme: ["#ff4d6d", "#ff9db4", "#ffd0dc"] },
  { id: "heart-me", name: "Heart Me", emoji: "🫶", coins: 5, tier: 1, archetype: "bloom", theme: ["#ff5c8a", "#ff9ec4", "#ffe0ec"] },
  { id: "finger-heart", name: "Finger Heart", emoji: "🫰", coins: 5, tier: 1, archetype: "bloom", theme: ["#ff6b9d", "#ffc1d9"] },
  { id: "gg", name: "GG", emoji: "🎮", coins: 1, tier: 1, archetype: "bloom", theme: ["#7dd3fc", "#c4b5fd"] },
  { id: "perfume", name: "Perfume", emoji: "🌸", coins: 20, tier: 1, archetype: "bloom", theme: ["#f0abfc", "#fbcfe8", "#e9d5ff"] },
  { id: "sunglasses", name: "Sunglasses", emoji: "😎", coins: 100, tier: 2, archetype: "portal", theme: ["#fbbf24", "#fde68a", "#fca5a5"] },
  { id: "hand-hearts", name: "Hand Hearts", emoji: "💞", coins: 100, tier: 2, archetype: "bloom", theme: ["#fb7185", "#fda4af", "#fecdd3"] },
  { id: "corgi", name: "Corgi", emoji: "🐶", coins: 299, tier: 2, archetype: "beast", theme: ["#fbbf24", "#fcd34d", "#fef3c7"] },
  { id: "confetti", name: "Confetti", emoji: "🎉", coins: 100, tier: 2, archetype: "portal", theme: ["#34d399", "#fbbf24", "#f472b6", "#7dd3fc"] },
  { id: "galaxy", name: "Galaxy", emoji: "🌌", coins: 1000, tier: 3, archetype: "cosmic", theme: ["#6366f1", "#a855f7", "#22d3ee"] },
  { id: "rocket", name: "Rocket", emoji: "🚀", coins: 5000, tier: 3, archetype: "portal", theme: ["#f97316", "#fbbf24", "#f43f5e"] },
  { id: "storm", name: "Thunder", emoji: "⚡", coins: 2000, tier: 3, archetype: "cosmic", theme: ["#38bdf8", "#818cf8", "#e0f2fe"] },
  { id: "lion", name: "Lion", emoji: "🦁", coins: 29999, tier: 4, archetype: "beast", theme: ["#f59e0b", "#fcd34d", "#fffbeb"] },
  { id: "universe", name: "Universe", emoji: "🌠", coins: 44999, tier: 4, archetype: "cosmic", theme: ["#a855f7", "#22d3ee", "#f472b6", "#facc15"] },
  { id: "phoenix", name: "Phoenix", emoji: "🔥", coins: 25999, tier: 4, archetype: "beast", theme: ["#f97316", "#fbbf24", "#ef4444"] },
];

export const GIFT_BY_ID = Object.fromEntries(GIFTS.map((g) => [g.id, g]));

export function giftEvent(giftId: string, sender = "guest", count = 1): GiftEvent | null {
  const gift = GIFT_BY_ID[giftId];
  if (!gift) return null;
  return { gift, sender, count: Math.max(1, count), ts: Date.now() };
}
