/**
 * PENALTY SHOOTOUT — the deterministic match engine (pure TS, no DOM/three).
 *
 * CONTINUOUS FLOW (v2): no role vote, no dead time. The first shooter alternates
 * each match; kicks alternate within it. Votes and boosts accumulate at ANY moment
 * (during the previous kick's flight and celebration too) and are consumed the
 * instant a kick launches — the VOTE phase is just the guaranteed window between
 * kicks. Zero votes → seeded randomness, so the show never stalls.
 *
 *   VOTE (10s) → KICK (5.2s, resolved at launch) → RESULT (3.2s, next vote is
 *   already open) → VOTE … · regulation 5 kicks each with real early-termination,
 *   then sudden-death pairs · MATCH END (10s trophy + MVP) → next match.
 *
 * Votes: comments = 1 (per-user 1.2s throttle); gifts = coin value, and the same
 * coins charge the meters (direction gifts + unmapped + Money Gun/Galaxy → shot
 * POWER · Corgi → keeper REACH · Lion → keeper INSTINCT). The keeper dives on his
 * own (seeded), stretched by REACH, and INSTINCT gives him a chance to read the
 * true zone. All randomness is seeded mulberry32 — a match is a pure function of
 * its seed + event sequence.
 */
import type { ChatEvent, GiftEvent } from "@/lib/showtime/types";
import { actionForGift, MATH, OTHER, parseZoneComment, T, type PlayerId, type Zone } from "./config";

export type Phase = "vote" | "kick" | "result" | "matchEnd";

export type VoteTally = Record<Zone, number>;

export type KickRecord = {
  shooter: PlayerId;
  zone: Zone;
  dive: Zone;
  goal: boolean;
  power01: number;
  reach01: number;
  instinct: boolean;
};

export type PenaltyState = {
  clock: number;
  phase: Phase;
  phaseEndsAt: number;
  matchNumber: number;
  shootsFirst: PlayerId;
  kickIndex: number;
  suddenDeath: boolean;
  score: Record<PlayerId, number>;
  taken: Record<PlayerId, number>;
  kicks: KickRecord[];
  shotVotes: VoteTally;
  powerCoins: number;
  reachCoins: number;
  instinctCoins: number;
  lastKick: KickRecord | null;
  winner: PlayerId | null;
  jumbotron: string | null;
  idle: boolean;
  totalCoins: number;
  mvp: { name: string; coins: number } | null;
};

export type PenaltyEvent =
  | { kind: "matchStart"; matchNumber: number }
  | { kind: "phase"; phase: Phase }
  | { kind: "vote"; zone: Zone; sender: string; coins: number }
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
      phase: "vote",
      phaseEndsAt: T.VOTE_MS,
      matchNumber: 1,
      shootsFirst: "ronaldo", // alternates every match
      kickIndex: 0,
      suddenDeath: false,
      score: { ronaldo: 0, messi: 0 },
      taken: { ronaldo: 0, messi: 0 },
      kicks: [],
      shotVotes: zeroTally(),
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

  /** Who takes the current (upcoming) kick. */
  shooter(): PlayerId {
    return this.st.kickIndex % 2 === 0 ? this.st.shootsFirst : OTHER[this.st.shootsFirst];
  }

  keeper(): PlayerId {
    return OTHER[this.shooter()];
  }

  /* ── events in (accepted at ANY time — consumed at each kick launch) ───── */

  onGift(ev: GiftEvent): PenaltyEvent[] {
    const out: PenaltyEvent[] = [];
    this.markHuman();
    const coins = Math.max(1, ev.gift.coins * Math.max(1, ev.count));
    this.st.totalCoins += coins;
    const total = (this.coinsBySender.get(ev.sender) ?? 0) + coins;
    this.coinsBySender.set(ev.sender, total);
    if (!this.st.mvp || total > this.st.mvp.coins) this.st.mvp = { name: ev.sender, coins: total };

    const action = actionForGift(ev.gift.name);
    switch (action.act) {
      case "shot":
        this.st.shotVotes[action.zone] += coins;
        this.st.powerCoins += coins;
        out.push({ kind: "vote", zone: action.zone, sender: ev.sender, coins });
        break;
      case "power":
        this.st.powerCoins += coins;
        out.push({ kind: "boost", type: "power", sender: ev.sender, coins });
        break;
      case "reach":
        this.st.reachCoins += coins;
        out.push({ kind: "boost", type: "reach", sender: ev.sender, coins });
        break;
      case "instinct":
        this.st.instinctCoins += coins;
        out.push({ kind: "boost", type: "instinct", sender: ev.sender, coins });
        break;
      case "jumbotron":
        this.st.jumbotron = ev.sender;
        this.st.powerCoins += coins; // the showstopper also supercharges the moment
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
    const z = parseZoneComment(ev.text);
    if (z) {
      this.commentAt.set(ev.sender, this.st.clock);
      this.st.shotVotes[z] += 1;
      out.push({ kind: "vote", zone: z, sender: ev.sender, coins: 0 });
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
      case "vote":
        this.launchKick(out);
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

  private pickZone(t: VoteTally): Zone {
    const max = Math.max(t.left, t.center, t.right);
    if (max <= 0) return ZONES[Math.floor(this.rng() * 3)];
    const top = ZONES.filter((z) => t[z] === max);
    return top[Math.floor(this.rng() * top.length)];
  }

  private launchKick(out: PenaltyEvent[]) {
    const zone = this.pickZone(this.st.shotVotes);

    // the keeper picks on his own; instinct may let him read the true zone
    let dive = ZONES[Math.floor(this.rng() * 3)];
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

    // consume the pool — everything arriving from now on builds the NEXT kick
    this.st.shotVotes = zeroTally();
    this.st.powerCoins = 0;
    this.st.reachCoins = 0;
    this.st.instinctCoins = 0;

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
    this.setPhase("vote", T.VOTE_MS, out);
  }

  private startMatch(out: PenaltyEvent[]) {
    this.st.matchNumber += 1;
    this.st.shootsFirst = OTHER[this.st.shootsFirst]; // fairness: alternate openers
    this.st.kickIndex = 0;
    this.st.suddenDeath = false;
    this.st.score = { ronaldo: 0, messi: 0 };
    this.st.taken = { ronaldo: 0, messi: 0 };
    this.st.kicks = [];
    this.st.lastKick = null;
    this.st.winner = null;
    this.st.totalCoins = 0;
    this.st.mvp = null;
    this.coinsBySender.clear();
    // votes already accumulating carry into kick 1 of the new match — continuous flow
    this.setPhase("vote", T.VOTE_MS, out);
    out.push({ kind: "matchStart", matchNumber: this.st.matchNumber });
  }
}
