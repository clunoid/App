/**
 * PENALTY SHOOTOUT — configuration: the two stars, phase timings, outcome math
 * knobs, and the gift → action map. Every reviewable knob lives here.
 *
 * FLOW (v2 — continuous, no dead time): there is NO pre-match role vote. The first
 * shooter alternates each match (announced on screen) and kicks alternate within
 * the match. Voting is CONTINUOUS: votes and boosts accumulate at any moment and
 * are consumed the instant a kick launches — so viewers can vote during the
 * celebration of the previous kick, and the dedicated VOTE window is just the
 * guaranteed quiet time between kicks.
 *
 * GIFT MAPPING (v2 — simple, spatial, expensive = stronger):
 *  - Direction (1-coin, mass participation): Rose→LEFT, TikTok→CENTER,
 *    Ice Cream Cone→RIGHT. Comments "left/center/right" vote free.
 *    Vote weight = coin value, and direction-gift coins also charge shot POWER.
 *  - Shooter boosts: Money Gun (500) / Galaxy (1,000) → shot POWER (faster ball,
 *    harder to save). Any unmapped gift also counts as POWER.
 *  - Keeper boosts (the counterplay): Corgi (299) → REACH (longer dive),
 *    Lion (29,999) → INSTINCT (he reads the shot).
 *  - TikTok Universe (44,999) → JUMBOTRON: the sender's name on the stadium
 *    screen for the rest of the match.
 *  - The keeper otherwise dives on his own — nobody steers him directly.
 *  - Deterministic outcomes only — boosts shift probabilities, nothing is a prize.
 */

export type PlayerId = "ronaldo" | "messi";
export type Zone = "left" | "center" | "right"; // as the VIEWER sees the goal

export type PlayerDef = {
  id: PlayerId;
  name: string;
  shirt: string;
  number: number;
  jersey: string;
  jersey2: string;
  striped: boolean;
  shorts: string;
  socks: string;
  skin: string;
  hair: string;
  height: number;
  accent: string;
};

export const PLAYERS: Record<PlayerId, PlayerDef> = {
  ronaldo: {
    id: "ronaldo",
    name: "RONALDO",
    shirt: "RONALDO",
    number: 7,
    jersey: "#B3161F",
    jersey2: "#1E5B3C",
    striped: false,
    shorts: "#1E5B3C",
    socks: "#B3161F",
    skin: "#C68863",
    hair: "#17130F",
    height: 1.04,
    accent: "#E5484D",
  },
  messi: {
    id: "messi",
    name: "MESSI",
    shirt: "MESSI",
    number: 10,
    jersey: "#75C4EA",
    jersey2: "#FFFFFF",
    striped: true,
    shorts: "#101820",
    socks: "#75C4EA",
    skin: "#D9A06B",
    hair: "#3A2A1A",
    height: 0.96,
    accent: "#3E9BD6",
  },
};

export const OTHER: Record<PlayerId, PlayerId> = { ronaldo: "messi", messi: "ronaldo" };

/* ── phase timings (ms) ─────────────────────────────────────────────────── */

export const T = {
  // GIFT-GATED: a kick never fires on its own. The first gift after a kick arms a
  // short (hidden) grace window so a few more votes/gifts can stack, then the kick
  // is taken. No gifts → the shootout simply waits.
  TRIGGER_GRACE_MS: 7_000,
  // Safety net so the score never sits at 0–0 forever: after this long with NO gift,
  // auto-play one kick, then wait again.
  IDLE_FALLBACK_MS: 600_000, // 10 minutes
  KICK_MS: 5_200, // run-up + strike + flight + landing beat
  RESULT_MS: 3_200, // celebration / dejection (next kick's voting is ALREADY open)
  MATCH_END_MS: 10_000, // trophy + MVP recap, then the next match
  KICKS_EACH: 12, // 12 kicks each, then a new match kicks off at 0–0
  IDLE_AFTER_MS: 90_000,
  COMMENT_COOLDOWN_MS: 1_200,
} as const;

/* ── outcome math knobs ─────────────────────────────────────────────────── */

export const MATH = {
  POWER_FULL_COINS: 2_000,
  REACH_FULL_COINS: 2_000,
  INSTINCT_FULL_COINS: 30_000,
  SAVE_BASE: 0.72,
  SAVE_REACH_BONUS: 0.2,
  SAVE_POWER_PENALTY: 0.3,
  SAVE_MIN: 0.15,
  SAVE_MAX: 0.95,
  INSTINCT_READ_MAX: 0.5,
} as const;

/* ── gift → action mapping ──────────────────────────────────────────────── */

export type GiftAction =
  | { act: "shot"; zone: Zone }
  | { act: "power" }
  | { act: "reach" }
  | { act: "instinct" }
  | { act: "jumbotron" };

export type MappedGift = {
  key: string; // lowercase gift name (stable matching key)
  label: string;
  coins: number;
  action: GiftAction;
};

export const GIFT_MAP: MappedGift[] = [
  { key: "rose", label: "Rose", coins: 1, action: { act: "shot", zone: "left" } },
  { key: "tiktok", label: "TikTok", coins: 1, action: { act: "shot", zone: "center" } },
  { key: "ice cream cone", label: "Ice Cream Cone", coins: 1, action: { act: "shot", zone: "right" } },
  { key: "money gun", label: "Money Gun", coins: 500, action: { act: "power" } },
  { key: "galaxy", label: "Galaxy", coins: 1000, action: { act: "power" } },
  { key: "corgi", label: "Corgi", coins: 299, action: { act: "reach" } },
  { key: "lion", label: "Lion", coins: 29999, action: { act: "instinct" } },
  { key: "tiktok universe", label: "TikTok Universe", coins: 44999, action: { act: "jumbotron" } },
];

export const GIFT_BY_KEY = new Map(GIFT_MAP.map((g) => [g.key, g]));

export function actionForGift(name: string): GiftAction {
  const g = GIFT_BY_KEY.get((name || "").trim().toLowerCase());
  return g?.action ?? { act: "power" }; // every gift always does something visible
}

/** Which zone a mapped direction gift votes for (for UI placement). */
export const ZONE_GIFT_KEY: Record<Zone, string> = {
  left: "rose",
  center: "tiktok",
  right: "ice cream cone",
};

/* ── comment parsing (free votes, forgiving) ────────────────────────────── */

const RE = {
  left: /\b(left|l)\b/i,
  right: /\b(right|r)\b/i,
  center: /\b(center|centre|middle|mid|c|m)\b/i,
};

export function parseZoneComment(text: string): Zone | null {
  const t = (text || "").toLowerCase();
  const l = RE.left.test(t);
  const r = RE.right.test(t);
  const c = RE.center.test(t);
  if (l && !r && !c) return "left";
  if (r && !l && !c) return "right";
  if (c && !l && !r) return "center";
  return null;
}
