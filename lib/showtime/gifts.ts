import type { Gift, GiftEvent, Tier } from "./types";

/** Tier by TikTok coin value. Kept because the live Euler feed still tiers gifts. */
export function tierForCoins(coins: number): Tier {
  if (coins >= 10000) return 4;
  if (coins >= 1000) return 3;
  if (coins >= 100) return 2;
  return 1;
}

const TIER_EMOJI: Record<Tier, string> = { 1: "✨", 2: "💫", 3: "🌟", 4: "🌠" };

/** Build a Gift from a raw name + coin value. No catalogue/theme yet — the visual
 *  system is being redesigned; this only carries the data the feed and bus need. */
export function synthesizeGift(name: string, coins: number, emoji?: string): Gift {
  const tier = tierForCoins(coins);
  return {
    id: `gift:${(name || "gift").toLowerCase().replace(/\s+/g, "-")}`,
    name: name || "Gift",
    emoji: emoji || TIER_EMOJI[tier],
    coins,
    tier,
  };
}

/** Turn a raw (real or simulated) gift into a ready-to-handle event. */
export function normalizeGift(name: string, coins: number, sender: string, count: number, emoji?: string): GiftEvent {
  return {
    gift: synthesizeGift(name, coins, emoji),
    sender: (sender || "guest").replace(/^@/, "").slice(0, 40),
    count: Math.max(1, count || 1),
    ts: Date.now(),
  };
}

/** A simple synthetic gift for testing the bus + stage while no room is live. */
export function testGift(sender = "guest"): GiftEvent {
  const coins = [1, 100, 1000, 10000][(Math.random() * 4) | 0];
  return normalizeGift("Test gift", coins, sender, 1);
}
