/**
 * Showtime Arcade — core contracts.
 *
 * The stage is a fully-automated, gift-interactive game for TikTok LIVE, rendered by
 * the browser page at /showtime/stage (captured into TikTok LIVE Studio) and fed by
 * Euler Stream events + the Supabase Realtime bus. These types are the shared contract
 * between the Euler feed, the Realtime bus, the game simulation, the renderer, the
 * voice hosts, and the director console. Everything downstream imports from here.
 *
 * CURRENT GAME: BEACH RACE (id "sprint") — a bright, summery, instantly-legible race:
 * comment to join, likes fill a shared Wave, gifts boost YOUR racer, podium + points.
 *
 * COMPLIANCE INVARIANTS (encoded in the design, do not weaken):
 *  - Gifts map ONLY to deterministic effects — never chance, prizes, or anything of value.
 *  - Gift effects key off COIN VALUE buckets (GiftTier), never gift names (catalog rotates).
 *  - Idle/attract entities are always clearly labeled as house bots, never fake users.
 *  - On-screen copy lives in the game's strings file so it can be reviewed in one place.
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
  0: "Dash",
  1: "Turbo",
  2: "Jet ski",
  3: "Airlift",
  4: "Parade",
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
  raceNumber: number;
  racers: number;
  leader: string; // current leader (or last winner) display name, '' when none
  viewers: number;
  fps: number;
  events1m: number; // events processed in the last minute
  uptimeS: number;
};

export type BusMessage =
  | { kind: "ev"; ev: ShowEvent }
  | { kind: "cmd"; c: StageCommand }
  | { kind: "status"; s: StageStatus };

/* ── Beach Race game state (sim ⇄ renderer contract) ────────────────────── */

export type SprintPhase = "lobby" | "race" | "podium";

export type Racer = {
  id: string; // user id, or "bot:N"
  user?: EvUser; // absent for house bots
  bot?: boolean; // house bot — renderer MUST label these visibly
  lane: number; // 0-based grid lane
  progress: number; // 0..1 down the track (1 = finish line)
  place?: number; // 1-based, set when finished
  boostUntil: number; // sim ms
  boostMult: number; // active multiplier while boosted (1 when none)
  boostTier: GiftTier | -1; // tier of the active/most recent boost (drives trail art)
  hat?: boolean; // follow cosmetic (sun hat)
  cheerUntil: number; // sim ms (comment cheer micro-boost)
  points: number; // session championship points
  joinedAt: number; // sim ms
};

export type ScoreRow = { user: EvUser; points: number; wins: number };

export type PodiumRow = { user?: EvUser; bot?: boolean; place: number; points: number };

export type TickerItem = { id: number; text: string; tier?: GiftTier; at: number };

export type SprintState = {
  simClock: number; // sim ms since boot
  phase: SprintPhase;
  phaseEndsAt: number; // sim ms
  raceNumber: number;
  racers: Racer[];
  /** Shared Wave meter charged by room likes: 0..100; wave active while simClock < waveUntil. */
  waveCharge: number;
  waveUntil: number;
  board: ScoreRow[]; // session championship top 5 (humans only)
  lastPodium: PodiumRow[]; // podium of the most recent race
  ticker: TickerItem[]; // newest first, capped
  idle: boolean; // attract mode (no human events recently)
  viewers: number;
  room: string; // connected TikTok room ('' when none)
};

/* ── Sim events (discrete moments → choreography + voice) ───────────────── */

export type SimEvent =
  | { kind: "join"; user: EvUser; lane: number; midRace: boolean }
  | { kind: "cheer"; user: EvUser }
  | { kind: "boost"; user: EvUser; tier: GiftTier; coins: number; combo: number }
  | { kind: "wave" } // likes meter filled — everyone surfs
  | { kind: "welcome"; user: EvUser } // follow → sun hat
  | { kind: "beachball"; user: EvUser } // share → beach ball drop
  | { kind: "raceStart"; raceNumber: number }
  | { kind: "finish"; racer: Racer; place: number }
  | { kind: "photoFinish" } // 1st and 2nd within a whisker
  | { kind: "raceEnd"; podium: PodiumRow[] }
  | { kind: "takeover"; user: EvUser; coins: number } // tier-4 parade moment
  | { kind: "firstHuman"; user: EvUser };

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
  wars: number; // races participated (column name is historical)
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
