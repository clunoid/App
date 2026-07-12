/**
 * PENALTY SHOOTOUT — the deterministic match engine (pure TS, no DOM/three).
 *
 * Runs a fully-automated loop forever:
 *   ROLE VOTE (18s, once per match): who shoots first — Ronaldo or Messi.
 *   Then alternating kicks, each: VOTE (14s: shot zone + keeper dive + boosts) →
 *   KICK (5.2s cinematic, resolved before it plays) → RESULT (4.2s) …
 *   Regulation = 5 kicks each with early termination (a side that can't be caught
 *   wins immediately, like a real shootout), then sudden-death pairs.
 *   MATCH END (12s trophy + MVP) → next match's role vote.
 *
 * Votes: comments = 1 (per-user 1.5s throttle); gifts = coin value, and the same
 * coins charge the boost meters (shot POWER / keeper REACH / keeper INSTINCT).
 * The keeper dives randomly when unguided; keeper-gift votes steer him; instinct
 * gives him a chance to read the true shot zone. All randomness is a seeded
 * mulberry32 so a match is a pure function of its seed + event sequence.
 */
import type { ChatEvent, GiftEvent } from "@/lib/showtime/types";
import {
  actionForGift,
  MATH,
  OTHER,
  parseRoleComment,
  parseZoneComment,
  T,
  type PlayerId,
  type Zone,
} from "./config";

export type Phase = "role" | "vote" | "kick" | "result" | "matchEnd";

export type VoteTally = Record<Zone, number>;

export type KickRecord = {
  shooter: PlayerId;
  zone: Zone;
  dive: Zone;
  goal: boolean;
  power01: number;
  reach01: number;
  instinct: boolean; // the keeper "read" the shot
};

export type PenaltyState = {
  clock: number; // engine ms since boot
  phase: Phase;
  phaseEndsAt: number;
  matchNumber: number;
  shootsFirst: PlayerId;
  kickIndex: number; // 0-based across the shootout
  suddenDeath: boolean;
  score: Record<PlayerId, number>;
  taken: Record<PlayerId, number>;
  kicks: KickRecord[];
  roleVotes: Record<PlayerId, number>;
  shotVotes: VoteTally;
  keeperVotes: VoteTally;
  powerCoins: number;
  reachCoins: number;
  instinctCoins: number;
  lastKick: KickRecord | null;
  winner: PlayerId | null;
  jumbotron: string | null; // Universe sender, immortalized for the match
  idle: boolean;
  totalCoins: number;
  mvp: { name: string; coins: number } | null;
};

export type PenaltyEvent =
  | { kind: "matchStart"; matchNumber: number }
  | { kind: "phase"; phase: Phase }
  | { kind: "vote"; side: "role" | "shot" | "keeper"; label: string; sender: string; coins: number }
  | { kind: "boost"; type: "power" | "reach" | "instinct"; sender: string; coins: number }
  | { kind: "jumbotron"; sender: string }
  | { kind: "kickoff"; rec: KickRecord; shooter: PlayerId; keeper: PlayerId }
  | { kind: "result"; rec: KickRecord }
  | { kind: "matchEnd"; winner: PlayerId; score: Record<PlayerId, number> };

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONES: Zone[] = ["left", "center", "right"];

const zeroTally = (): VoteTally => ({ left: 0, center: 0, right: 0 });

export class PenaltyGame {
  private st: PenaltyState;
  private rng: () => number;
  private commentAt = new Map<string, number>();
  private coinsBySender = new Map<string, number>();
  private lastHumanAt = 0;
  private pendingKick: KickRecord | null = null;

  constructor(seed = 20260712) {
    this.rng = mulberry32(seed);
    this.st = {
      clock: 0,
      phase: "role",
      phaseEndsAt: T.ROLE_MS,
      matchNumber: 1,
      shootsFirst: "ronaldo",
      kickIndex: 0,
      suddenDeath: false,
      score: { ronaldo: 0, messi: 0 },
      taken: { ronaldo: 0, messi: 0 },
      kicks: [],
      roleVotes: { ronaldo: 0, messi: 0 },
      shotVotes: zeroTally(),
      keeperVotes: zeroTally(),
      powerCoins: 0,
      reachCoins: 0,
      instinctCoins: 0,
      lastKick: null,
      winner: null,
      jumbotron: null,
      idle: false,
      totalCoins: 0,
      mvp: null,
    };
  }

  get state(): PenaltyState {
    return this.st;
  }

  /** Who takes the current kick. */
  shooter(): PlayerId {
    return this.st.kickIndex % 2 === 0 ? this.st.shootsFirst : OTHER[this.st.shootsFirst];
  }

  keeper(): PlayerId {
    return OTHER[this.shooter()];
  }

  /* ── events in ────────────────────────────────────────────────────────── */

  onGift(ev: GiftEvent): PenaltyEvent[] {
    const out: PenaltyEvent[] = [];
    this.markHuman();
    const coins = Math.max(1, ev.gift.coins * Math.max(1, ev.count));
    this.st.totalCoins += coins;
    const total = (this.coinsBySender.get(ev.sender) ?? 0) + coins;
    this.coinsBySender.set(ev.sender, total);
    if (!this.st.mvp || total > this.st.mvp.coins) this.st.mvp = { name: ev.sender, coins: total };

    const phase = this.st.phase === "role" ? "role" : "kick";
    const action = actionForGift(ev.gift.name, phase);
    if (!action) {
      // unmapped gifts still count: they charge the shooter's power meter
      if (this.st.phase === "vote") {
        this.st.powerCoins += coins;
        out.push({ kind: "boost", type: "power", sender: ev.sender, coins });
      }
      return out;
    }

    switch (action.act) {
      case "role":
        if (this.st.phase === "role") {
          this.st.roleVotes[action.player] += coins;
          out.push({ kind: "vote", side: "role", label: action.player, sender: ev.sender, coins });
        }
        break;
      case "shot":
        if (this.st.phase === "vote") {
          this.st.shotVotes[action.zone] += coins;
          this.st.powerCoins += coins;
          out.push({ kind: "vote", side: "shot", label: action.zone, sender: ev.sender, coins });
        }
        break;
      case "dive":
        if (this.st.phase === "vote") {
          this.st.keeperVotes[action.zone] += coins;
          this.st.reachCoins += coins;
          out.push({ kind: "vote", side: "keeper", label: action.zone, sender: ev.sender, coins });
        }
        break;
      case "power":
        if (this.st.phase === "vote") {
          this.st.powerCoins += coins;
          out.push({ kind: "boost", type: "power", sender: ev.sender, coins });
        }
        break;
      case "reach":
        if (this.st.phase === "vote") {
          this.st.reachCoins += coins;
          out.push({ kind: "boost", type: "reach", sender: ev.sender, coins });
        }
        break;
      case "instinct":
        if (this.st.phase === "vote") {
          this.st.instinctCoins += coins;
          out.push({ kind: "boost", type: "instinct", sender: ev.sender, coins });
        }
        break;
      case "jumbotron":
        this.st.jumbotron = ev.sender;
        out.push({ kind: "jumbotron", sender: ev.sender });
        break;
    }
    return out;
  }

  onChat(ev: ChatEvent): PenaltyEvent[] {
    const out: PenaltyEvent[] = [];
    this.markHuman();
    const last = this.commentAt.get(ev.sender) ?? -1e9;
    if (this.st.clock - last < T.COMMENT_COOLDOWN_MS) return out;

    if (this.st.phase === "role") {
      const p = parseRoleComment(ev.text);
      if (p) {
        this.commentAt.set(ev.sender, this.st.clock);
        this.st.roleVotes[p] += 1;
        out.push({ kind: "vote", side: "role", label: p, sender: ev.sender, coins: 0 });
      }
    } else if (this.st.phase === "vote") {
      const z = parseZoneComment(ev.text);
      if (z) {
        this.commentAt.set(ev.sender, this.st.clock);
        this.st.shotVotes[z] += 1;
        out.push({ kind: "vote", side: "shot", label: z, sender: ev.sender, coins: 0 });
      }
    }
    return out;
  }

  private markHuman() {
    this.lastHumanAt = this.st.clock;
    this.st.idle = false;
  }

  /* ── the clock ────────────────────────────────────────────────────────── */

  tick(dt: number): PenaltyEvent[] {
    const out: PenaltyEvent[] = [];
    const step = Math.max(0, Math.min(250, dt || 0));
    if (!step) return out;
    this.st.clock += step;

    if (!this.st.idle && this.st.clock - this.lastHumanAt > T.IDLE_AFTER_MS) this.st.idle = true;
    if (this.st.clock < this.st.phaseEndsAt) return out;

    switch (this.st.phase) {
      case "role":
        this.resolveRole(out);
        break;
      case "vote":
        this.resolveVoteAndKick(out);
        break;
      case "kick":
        this.enterResult(out);
        break;
      case "result":
        this.afterResult(out);
        break;
      case "matchEnd":
        this.startMatch(out);
        break;
    }
    return out;
  }

  /* ── phase transitions ────────────────────────────────────────────────── */

  private setPhase(phase: Phase, ms: number, out: PenaltyEvent[]) {
    this.st.phase = phase;
    this.st.phaseEndsAt = this.st.clock + ms;
    out.push({ kind: "phase", phase });
  }

  private resolveRole(out: PenaltyEvent[]) {
    const { ronaldo, messi } = this.st.roleVotes;
    this.st.shootsFirst = ronaldo === messi ? (this.rng() < 0.5 ? "ronaldo" : "messi") : ronaldo > messi ? "ronaldo" : "messi";
    this.startVote(out);
  }

  private startVote(out: PenaltyEvent[]) {
    this.st.shotVotes = zeroTally();
    this.st.keeperVotes = zeroTally();
    this.st.powerCoins = 0;
    this.st.reachCoins = 0;
    this.st.instinctCoins = 0;
    this.setPhase("vote", T.VOTE_MS, out);
  }

  private pickZone(t: VoteTally): Zone {
    const max = Math.max(t.left, t.center, t.right);
    if (max <= 0) return ZONES[Math.floor(this.rng() * 3)];
    const top = ZONES.filter((z) => t[z] === max);
    return top[Math.floor(this.rng() * top.length)];
  }

  private resolveVoteAndKick(out: PenaltyEvent[]) {
    const zone = this.pickZone(this.st.shotVotes);

    // keeper: guided by keeper votes, else random; instinct may read the true zone
    let dive = this.pickZone(this.st.keeperVotes);
    const instinct01 = Math.min(1, this.st.instinctCoins / MATH.INSTINCT_FULL_COINS);
    const read = this.rng() < instinct01 * MATH.INSTINCT_READ_MAX;
    if (read) dive = zone;

    const power01 = Math.min(1, this.st.powerCoins / MATH.POWER_FULL_COINS);
    const reach01 = Math.min(1, this.st.reachCoins / MATH.REACH_FULL_COINS);

    let goal: boolean;
    if (dive === zone) {
      const saveP = Math.min(MATH.SAVE_MAX, Math.max(MATH.SAVE_MIN, MATH.SAVE_BASE + MATH.SAVE_REACH_BONUS * reach01 - MATH.SAVE_POWER_PENALTY * power01));
      goal = this.rng() >= saveP;
    } else {
      goal = true;
    }

    const rec: KickRecord = { shooter: this.shooter(), zone, dive, goal, power01, reach01, instinct: read };
    this.pendingKick = rec;
    this.setPhase("kick", T.KICK_MS, out);
    out.push({ kind: "kickoff", rec, shooter: rec.shooter, keeper: OTHER[rec.shooter] });
  }

  private enterResult(out: PenaltyEvent[]) {
    const rec = this.pendingKick;
    this.pendingKick = null;
    if (rec) {
      this.st.kicks.push(rec);
      this.st.lastKick = rec;
      this.st.taken[rec.shooter] += 1;
      if (rec.goal) this.st.score[rec.shooter] += 1;
      out.push({ kind: "result", rec });
    }
    this.setPhase("result", T.RESULT_MS, out);
  }

  private decided(): PlayerId | null {
    const a = this.st.shootsFirst;
    const b = OTHER[a];
    const { score, taken, suddenDeath } = this.st;
    if (!suddenDeath) {
      const remA = T.KICKS_EACH - taken[a];
      const remB = T.KICKS_EACH - taken[b];
      if (score[a] > score[b] + remB) return a;
      if (score[b] > score[a] + remA) return b;
      if (taken[a] >= T.KICKS_EACH && taken[b] >= T.KICKS_EACH) {
        if (score[a] !== score[b]) return score[a] > score[b] ? a : b;
        this.st.suddenDeath = true;
      }
      return null;
    }
    // sudden death: judge only after complete pairs
    if (taken[a] === taken[b] && score[a] !== score[b]) return score[a] > score[b] ? a : b;
    return null;
  }

  private afterResult(out: PenaltyEvent[]) {
    const winner = this.decided();
    if (winner) {
      this.st.winner = winner;
      this.setPhase("matchEnd", T.MATCH_END_MS, out);
      out.push({ kind: "matchEnd", winner, score: { ...this.st.score } });
      return;
    }
    this.st.kickIndex += 1;
    this.startVote(out);
  }

  private startMatch(out: PenaltyEvent[]) {
    this.st.matchNumber += 1;
    this.st.kickIndex = 0;
    this.st.suddenDeath = false;
    this.st.score = { ronaldo: 0, messi: 0 };
    this.st.taken = { ronaldo: 0, messi: 0 };
    this.st.kicks = [];
    this.st.lastKick = null;
    this.st.winner = null;
    this.st.roleVotes = { ronaldo: 0, messi: 0 };
    this.st.totalCoins = 0;
    this.st.mvp = null;
    this.coinsBySender.clear();
    this.setPhase("role", T.ROLE_MS, out);
    out.push({ kind: "matchStart", matchNumber: this.st.matchNumber });
  }
}
