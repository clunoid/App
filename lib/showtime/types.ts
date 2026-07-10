/**
 * Showtime Arcade — core contracts.
 *
 * The stage is a fully-automated, gift-interactive game for TikTok LIVE, rendered by
 * the browser page at /showtime/stage (captured into TikTok LIVE Studio) and fed by
 * Euler Stream events + the Supabase Realtime bus. These types are the shared contract
 * between the Euler feed, the Realtime bus, the game simulations, the renderers, the
 * voice hosts, and the director console. Everything downstream imports from here.
 *
 * COMPLIANCE INVARIANTS (encoded in the design, do not weaken):
 *  - Gifts map ONLY to deterministic effects — never chance, prizes, or anything of value.
 *  - Gift effects key off COIN VALUE buckets (GiftTier), never gift names (catalog rotates).
 *  - Idle/attract entities are always clearly labeled as house bots, never fake users.
 *  - On-screen copy lives in each game's strings file so it can be reviewed in one place.
 */

/* ── Events ─────────────────────────────────────────────────────────────── */

export type EvUser = {
  id: string; // TikTok uniqueId (stable handle, lowercase, no @)
  name: string; // display nickname
  avatarUrl?: string; // TikTok CDN profile picture (proxy via /api/showtime/avatar)
};

export type ShowEventType = "gift" | "chat" | "like" | "follow" | "share" | "join" | "room";

export type ShowEvent = {
  seq: number; // monotonic per emitting source (dedup/replay aid)
  type: ShowEventType;
  user: EvUser;
  /** gift: total coin value of the event (unit coins × count). like: like delta. room: viewer count. */
  value: number;
  /** gift: streak/repeat count. like: taps in this batch. others: 1. */
  count: number;
  /** gift only: coin value of a single unit of the gift. */
  unitCoins?: number;
  /** gift only: gift display name (informational — never used for effect routing). */
  giftName?: string;
  /** chat only: the comment text. */
  text?: string;
  /** true when injected by the director console simulator — excluded from persistence. */
  sim?: boolean;
  ts: number; // epoch ms at normalization
};

/* ── Gift tiers (coin-value buckets — the ONLY effect router) ───────────── */

/** 0: 1-4 · 1: 5-99 · 2: 100-999 · 3: 1,000-9,999 · 4: 10,000+ */
export type GiftTier = 0 | 1 | 2 | 3 | 4;

export const TIER_LABEL: Record<GiftTier, string> = {
  0: "Arrow",
  1: "Champion",
  2: "Siege",
  3: "Hero",
  4: "Legend",
};

/* ── Bus messages (Supabase Realtime, channel st:<key>) ─────────────────── */

export type StageCommand =
  | { cmd: "connect"; room: string }
  | { cmd: "disconnect" }
  | { cmd: "reload" }
  | { cmd: "theme"; theme?: string };

export type FeedStatus = "idle" | "connecting" | "live" | "error" | "unconfigured";

/** 1/s heartbeat the live stage publishes so the console can monitor health. */
export type StageStatus = {
  ts: number;
  feed: FeedStatus;
  feedMsg?: string;
  room: string;
  phase: string;
  warNumber: number;
  wins: { crimson: number; cobalt: number };
  p: number; // territory % held by crimson
  viewers: number;
  fps: number;
  events1m: number; // events processed in the last minute
  uptimeS: number;
};

export type BusMessage =
  | { kind: "ev"; ev: ShowEvent }
  | { kind: "cmd"; c: StageCommand }
  | { kind: "status"; s: StageStatus };

/* ── Clash game state (sim ⇄ renderer contract) ─────────────────────────── */

export type TeamId = "crimson" | "cobalt";

export type UnitKind = "trooper" | "recruit" | "squad" | "champion" | "hero";

export type Unit = {
  id: number;
  team: TeamId;
  kind: UnitKind;
  user?: EvUser; // absent for house bots
  bot?: boolean; // house bot — renderer MUST label these visibly
  x: number; // 0..1 horizontal lane position
  y: number; // 0..1 vertical position (0 = crimson keep, 1 = cobalt keep)
  speed: number; // base units of y per second (sign encodes direction)
  power: number; // push points delivered on reaching the front line
  bornAt: number; // sim ms
};

export type ClashPhase = "war" | "suddenDeath" | "intermission" | "ceremony";

export type MvpRow = { user: EvUser; team: TeamId; coins: number; pushes: number };

export type TickerItem = { id: number; text: string; team?: TeamId; tier?: GiftTier; at: number };

export type SurgeState = { charge: number; activeUntil: number }; // charge 0..100, sim ms

export type ClashState = {
  simClock: number; // sim ms since boot
  phase: ClashPhase;
  phaseEndsAt: number; // sim ms
  warNumber: number; // 1-based within the campaign
  wins: Record<TeamId, number>;
  /** Territory: % of the field held by crimson (0..100). Front line renders at p. */
  p: number;
  /** Push scaling constant for this war (frozen at war start). */
  k: number;
  units: Unit[];
  surge: Record<TeamId, SurgeState>;
  teamLikes: Record<TeamId, number>;
  comeback: TeamId | null; // team currently holding the comeback multiplier
  warMvps: MvpRow[]; // top 5 this war
  sessionMvps: MvpRow[]; // top 5 this session
  ticker: TickerItem[]; // newest first, capped
  lastWarWinner: TeamId | null;
  campaignWinner: TeamId | null; // set during ceremony phase
  idle: boolean; // attract mode (no human events recently)
  viewers: number;
  room: string; // connected TikTok room ('' when none)
};

/* ── Sim events (discrete moments → choreography + voice) ───────────────── */

export type SimEvent =
  | { kind: "spawn"; unit: Unit }
  | { kind: "strike"; team: TeamId; tier: GiftTier; user: EvUser; coins: number; combo: number }
  | { kind: "surge"; team: TeamId }
  | { kind: "welcome"; user: EvUser; team: TeamId } // follow
  | { kind: "reinforce"; user: EvUser; team: TeamId } // share
  | { kind: "lineShift"; team: TeamId; amount: number } // % moved (render pulse)
  | { kind: "suddenDeath" }
  | { kind: "coreBreak"; team: TeamId } // team whose core broke (they lost)
  | { kind: "warEnd"; winner: TeamId | null; mvp: MvpRow | null }
  | { kind: "campaignEnd"; winner: TeamId; mvp: MvpRow | null }
  | { kind: "warStart"; warNumber: number }
  | { kind: "firstHuman"; user: EvUser }
  | { kind: "takeover"; user: EvUser; team: TeamId; coins: number } // tier-4 moment
  | { kind: "comeback"; team: TeamId };

/* ── Game module interface (games plug into the stage shell) ────────────── */

export type GameSnapshot = { game: string; v: number; state: unknown };

export interface GameModule {
  readonly id: string;
  /** Advance the deterministic simulation. dt in ms. Returns discrete events. */
  tick(dt: number): SimEvent[];
  /** Ingest one normalized ShowEvent. Returns discrete events it produced. */
  onEvent(ev: ShowEvent): SimEvent[];
  /** Serializable state for crash-resume. */
  snapshot(): GameSnapshot;
  restore(s: GameSnapshot): boolean;
}

/* ── Persistence rows (via /api/showtime/persist, service-role writes) ──── */

export type GifterRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  total_coins: number;
  wars: number;
  best_rank: number | null;
  last_seen: string;
};

export type MonumentRow = {
  id: number;
  user_id: string;
  name: string;
  coins: number;
  created_at: string;
};
