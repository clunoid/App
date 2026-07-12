/**
 * PENALTY SHOOTOUT — configuration: the two stars, phase timings, outcome math
 * knobs, and the gift → action map. Every reviewable knob lives here.
 *
 * GIFT MAPPING PRINCIPLES (locked with the user):
 *  - The game GUIDES viewers: each vote option shows its real TikTok gift (icon,
 *    name, coin price) on screen during the phase where it applies.
 *  - Comments always vote for free (1 vote); gifts vote WITH POWER — vote weight =
 *    coin value, and the same coins also charge the side's boost meter (shot POWER
 *    or keeper REACH). The bigger the gift, the bigger the boost.
 *  - The keeper dives randomly when nobody guides him; keeper gifts vote his dive
 *    AND extend his reach; premium gifts add "instinct" (a chance he reads the shot).
 *  - Deterministic outcomes only — boosts shift probabilities, nothing is a prize.
 *
 * Gift names/values verified against the July 2026 TikTok catalog (research pass);
 * the live catalog is fetched at runtime for icons via /api/showtime/gifts, with
 * these names as the stable keys. Names are matched case-insensitively.
 */

export type PlayerId = "ronaldo" | "messi";
export type Zone = "left" | "center" | "right"; // as the VIEWER sees the goal

export type PlayerDef = {
  id: PlayerId;
  name: string; // on-screen display name
  shirt: string; // name printed on the back
  number: number;
  jersey: string; // primary kit color
  jersey2: string; // trim / stripe color
  striped: boolean;
  shorts: string;
  socks: string;
  skin: string;
  hair: string;
  height: number; // scale multiplier
  accent: string; // UI accent for this player
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
  ROLE_MS: 18_000, // pre-match: who shoots first
  VOTE_MS: 14_000, // per kick: shot + keeper voting window
  KICK_MS: 5_200, // run-up + strike + ball flight + landing beat
  RESULT_MS: 4_200, // celebration / dejection + scoreboard update
  MATCH_END_MS: 12_000, // trophy + recap, then next match
  KICKS_EACH: 5, // regulation kicks per player
  SUDDEN_DEATH_MAX_PAIRS: 20, // hard cap; realistically decided long before
  IDLE_AFTER_MS: 90_000, // no human events → attract copy (game keeps playing itself)
  COMMENT_COOLDOWN_MS: 1_500, // per-user vote comment throttle
} as const;

/* ── outcome math knobs (all probabilities, all deterministic from seeds) ── */

export const MATH = {
  POWER_FULL_COINS: 2_000, // coins on the shot side for max power
  REACH_FULL_COINS: 2_000, // coins on the keeper side for max reach
  INSTINCT_FULL_COINS: 30_000, // Lion-scale coins for max instinct
  SAVE_BASE: 0.72, // save chance when the keeper picks the right zone
  SAVE_REACH_BONUS: 0.2, // + up to this from reach
  SAVE_POWER_PENALTY: 0.3, // − up to this from shot power
  SAVE_MIN: 0.15,
  SAVE_MAX: 0.95,
  INSTINCT_READ_MAX: 0.5, // max chance the keeper reads the true zone
} as const;

/* ── gift → action mapping ──────────────────────────────────────────────── */

export type GiftAction =
  | { act: "role"; player: PlayerId }
  | { act: "shot"; zone: Zone }
  | { act: "dive"; zone: Zone }
  | { act: "power" } // shot speed boost (any phase, applies to current kick)
  | { act: "reach" } // keeper reach boost
  | { act: "instinct" } // keeper reads the shot
  | { act: "jumbotron" }; // showstopper: sender's name on the stadium screen

export type MappedGift = {
  key: string; // lowercase gift name (stable matching key)
  label: string; // display name
  coins: number; // expected coin price (display; live catalog may override)
  action: GiftAction;
  roleAction?: GiftAction; // what this gift means during the pre-match ROLE vote
};

/**
 * The guide shown in-game is generated from this table, phase-scoped:
 *  ROLE PHASE: Rose→Ronaldo, TikTok→Messi (cheapest gifts, mass participation).
 *  KICK PHASE (shot): Rose→LEFT, TikTok→CENTER, Ice Cream Cone→RIGHT.
 *  KICK PHASE (keeper): Perfume→dive LEFT, Doughnut→stay CENTER, Hand Hearts→dive RIGHT.
 *  BOOSTS: Money Gun→POWER SHOT, Galaxy→THUNDER STRIKE (max power), Corgi→BIG REACH,
 *          Lion→WONDER KEEPER (instinct), TikTok Universe→JUMBOTRON showstopper.
 */
export const GIFT_MAP: MappedGift[] = [
  { key: "rose", label: "Rose", coins: 1, action: { act: "shot", zone: "left" }, roleAction: { act: "role", player: "ronaldo" } },
  { key: "tiktok", label: "TikTok", coins: 1, action: { act: "shot", zone: "center" }, roleAction: { act: "role", player: "messi" } },
  { key: "ice cream cone", label: "Ice Cream Cone", coins: 1, action: { act: "shot", zone: "right" } },
  { key: "perfume", label: "Perfume", coins: 20, action: { act: "dive", zone: "left" } },
  { key: "doughnut", label: "Doughnut", coins: 30, action: { act: "dive", zone: "center" } },
  { key: "hand hearts", label: "Hand Hearts", coins: 100, action: { act: "dive", zone: "right" } },
  { key: "money gun", label: "Money Gun", coins: 500, action: { act: "power" } },
  { key: "galaxy", label: "Galaxy", coins: 1000, action: { act: "power" } },
  { key: "corgi", label: "Corgi", coins: 299, action: { act: "reach" } },
  { key: "lion", label: "Lion", coins: 29999, action: { act: "instinct" } },
  { key: "tiktok universe", label: "TikTok Universe", coins: 44999, action: { act: "jumbotron" } },
];

export const GIFT_BY_KEY = new Map(GIFT_MAP.map((g) => [g.key, g]));

export function actionForGift(name: string, phase: "role" | "kick"): GiftAction | null {
  const g = GIFT_BY_KEY.get((name || "").trim().toLowerCase());
  if (!g) return null;
  if (phase === "role") return g.roleAction ?? g.action;
  return g.action;
}

/* ── comment parsing (free votes, forgiving) ────────────────────────────── */

const RE = {
  ronaldo: /\b(ronaldo|cristiano|cr7|siu+|7)\b/i,
  messi: /\b(messi|leo|lionel|goat|10)\b/i,
  left: /\b(left|l)\b/i,
  right: /\b(right|r)\b/i,
  center: /\b(center|centre|middle|mid|c|m)\b/i,
};

export function parseRoleComment(text: string): PlayerId | null {
  const t = (text || "").toLowerCase();
  const r = RE.ronaldo.test(t);
  const m = RE.messi.test(t);
  if (r && !m) return "ronaldo";
  if (m && !r) return "messi";
  return null;
}

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
