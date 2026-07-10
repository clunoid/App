import type { EvUser, GiftTier, ShowEvent } from "./types";

/**
 * Gift value → tier bucketing. THE ONLY ROUTER for gift effects.
 *
 * Research-locked (July 2026): the TikTok gift catalog (~100+ gifts, Rose=1 →
 * TikTok Universe=44,999) rotates monthly and varies by region, so effects key off
 * the coin value carried in each Euler payload — never off gift names. Real-world
 * volume is dominated by 1-coin Rose combo streaks, so tier 0 gets the deepest
 * escalation ladder (handled by each game's choreography), while 10,000+ gets the
 * reserved full-screen takeover TikTok itself trains whales to expect.
 */
export function tierForCoins(coins: number): GiftTier {
  if (coins >= 10000) return 4;
  if (coins >= 1000) return 3;
  if (coins >= 100) return 2;
  if (coins >= 5) return 1;
  return 0;
}

/** Approximate creator payout for a coin amount (~$0.005/coin) — console display only. */
export function usdForCoins(coins: number): number {
  return coins * 0.005;
}

let seq = 1;
export function nextSeq(): number {
  return seq++;
}

export function cleanHandle(raw: string): string {
  return (raw || "guest").replace(/^@/, "").trim().slice(0, 40);
}

export function makeUser(id: string, name?: string, avatarUrl?: string): EvUser {
  const clean = cleanHandle(id);
  return { id: clean.toLowerCase(), name: cleanHandle(name || clean), avatarUrl };
}

/** Build a normalized gift ShowEvent (real feed and simulator share this path). */
export function giftEvent(user: EvUser, unitCoins: number, count: number, giftName?: string, sim?: boolean): ShowEvent {
  const c = Math.max(1, count || 1);
  const unit = Math.max(1, Math.round(unitCoins) || 1);
  return { seq: nextSeq(), type: "gift", user, value: unit * c, count: c, unitCoins: unit, giftName, sim, ts: Date.now() };
}

export function chatEvent(user: EvUser, text: string, sim?: boolean): ShowEvent {
  return { seq: nextSeq(), type: "chat", user, value: 0, count: 1, text: (text || "").slice(0, 200), sim, ts: Date.now() };
}

export function likeEvent(user: EvUser, delta: number, sim?: boolean): ShowEvent {
  const d = Math.max(1, delta || 1);
  return { seq: nextSeq(), type: "like", user, value: d, count: d, sim, ts: Date.now() };
}

export function socialEvent(type: "follow" | "share" | "join", user: EvUser, sim?: boolean): ShowEvent {
  return { seq: nextSeq(), type, user, value: 0, count: 1, sim, ts: Date.now() };
}

export function roomEvent(viewers: number): ShowEvent {
  return { seq: nextSeq(), type: "room", user: makeUser("room"), value: Math.max(0, viewers | 0), count: 1, ts: Date.now() };
}

/** Simulator presets — coin values chosen to exercise each tier (incl. tier-0 combos). */
export const SIM_GIFTS: { label: string; unitCoins: number; count: number }[] = [
  { label: "Rose ×1", unitCoins: 1, count: 1 },
  { label: "Rose ×20 combo", unitCoins: 1, count: 20 },
  { label: "Rose ×100 storm", unitCoins: 1, count: 100 },
  { label: "Perfume (20)", unitCoins: 20, count: 1 },
  { label: "Hand Hearts (100)", unitCoins: 100, count: 1 },
  { label: "Corgi (299)", unitCoins: 299, count: 1 },
  { label: "Money Gun (500)", unitCoins: 500, count: 1 },
  { label: "Galaxy (1,000)", unitCoins: 1000, count: 1 },
  { label: "Sports Car (7,000)", unitCoins: 7000, count: 1 },
  { label: "Interstellar (10,000)", unitCoins: 10000, count: 1 },
  { label: "Lion (29,999)", unitCoins: 29999, count: 1 },
  { label: "Universe (44,999)", unitCoins: 44999, count: 1 },
];
