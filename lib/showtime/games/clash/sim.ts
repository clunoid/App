/**
 * Clunoid Clash — the deterministic game simulation.
 *
 * Two teams (crimson keeps the top, cobalt keeps the bottom) fight over a front
 * line at p% of the field. Wars run on a fixed phase machine (war → maybe
 * sudden death → intermission → next war; 5 war wins → ceremony → campaign
 * reset). Every audience action converts to push points through one fully
 * deterministic pipeline (K math + tier floors + hard cap + comeback bonus).
 *
 * DESIGN CONSTRAINTS (do not weaken):
 *  - NO Date.now / Math.random in sim logic. Time is an internal clock advanced
 *    by tick(dt); the only randomness is a tiny seeded mulberry32 used for
 *    COSMETIC choices (unit lane positions, bot cadence jitter). Outcomes are a
 *    pure function of the event sequence.
 *  - Gift effects key ONLY off tierForCoins coin buckets — never gift names.
 *  - House bots are marked bot: true, carry no user, and never touch
 *    leaderboards or persistence.
 *  - `state` returns one stable ClashState object mutated in place — the
 *    renderer reads it every frame.
 *  - snapshot()/restore() round-trip everything needed to resume a war
 *    mid-flight (state + user maps + coin window + counters + rng state).
 */

import type {
  ClashState,
  EvUser,
  GameModule,
  GameSnapshot,
  GiftTier,
  MvpRow,
  ShowEvent,
  SimEvent,
  TeamId,
  TickerItem,
  Unit,
  UnitKind,
} from "@/lib/showtime/types";
import { TIER_LABEL } from "@/lib/showtime/types";
import { tierForCoins } from "@/lib/showtime/gifts";
import { CLASH } from "./config";
import { S } from "./strings";

/* ── Spec-fixed constants that are not stage-tunable ────────────────────── */

const CHAMPION_POWER = 5; // tier-1 gift spawns a champion
const HERO_POWER = 10; // tier-3 gift spawns a hero
const SQUAD_MEMBER_POWER = 1; // each of the SHARE_SQUAD units from a share
const MVP_ROWS = 5; // leaderboard depth
/** Bot deliveries drift the line gently back toward 50 in attract mode: the
 *  team pushing toward center hits harder than the team pushing away, so the
 *  equilibrium sits at midfield while the stage keeps moving. */
const BOT_DRIFT_TOWARD_PCT = 0.6;
const BOT_DRIFT_AWAY_PCT = 0.15;

const TEAM_NAME: Record<TeamId, string> = { crimson: "Crimson", cobalt: "Cobalt" };
const TEAM_WORDS: Record<string, TeamId> = {
  red: "crimson",
  crimson: "crimson",
  blue: "cobalt",
  cobalt: "cobalt",
};
const PHASES: readonly string[] = ["war", "suddenDeath", "intermission", "ceremony"];

/* ── Internal record shapes ─────────────────────────────────────────────── */

type UserRec = {
  user: EvUser;
  team: TeamId;
  lastCommentAt: number; // sim ms of the last trooper spawn (comment cooldown)
  lockSerial: number; // warSerial of the war the user last contributed to (team lock); 0 = never
  warCoins: number;
  warPushes: number;
  sessionCoins: number;
  sessionPushes: number;
};

type CoinEntry = { atSimMs: number; coins: number };

type ClashSnapshotV1 = {
  st: ClashState;
  users: [string, UserRec][];
  coinWindow: CoinEntry[];
  warSerial: number;
  lastHumanAt: number;
  nextBotAt: number;
  botCounter: number;
  unitIds: number;
  tickerIds: number;
  assignFlip: number;
  likesFired: Record<TeamId, number>;
  rngState: number;
};

function clampP(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/* ── The sim ────────────────────────────────────────────────────────────── */

export class ClashSim implements GameModule {
  readonly id = "clash";

  private st: ClashState;
  private users = new Map<string, UserRec>();
  private coinWindow: CoinEntry[] = []; // trailing window ring (oldest first)
  private warSerial = 1; // monotonic war counter (never resets — drives team locks + war stats)
  private lastHumanAt = 0; // sim ms of the last human (non-room) event
  private nextBotAt = 0; // sim ms of the next attract-mode bot spawn
  private botCounter = 0; // total bots spawned (drives team alternation)
  private unitIds = 0;
  private tickerIds = 0;
  private assignFlip = 0; // deterministic tie-breaker for auto team assignment
  private likesFired: Record<TeamId, number> = { crimson: 0, cobalt: 0 }; // surges already fired per team
  private rngState: number;

  constructor(seed?: number) {
    this.rngState = ((seed ?? 0x2f6e2b1) >>> 0) || 1;
    this.st = {
      simClock: 0,
      phase: "war",
      phaseEndsAt: CLASH.WAR_MS,
      warNumber: 1,
      wins: { crimson: 0, cobalt: 0 },
      p: 50,
      k: CLASH.K_FLOOR,
      units: [],
      surge: {
        crimson: { charge: 0, activeUntil: 0 },
        cobalt: { charge: 0, activeUntil: 0 },
      },
      teamLikes: { crimson: 0, cobalt: 0 },
      comeback: null,
      warMvps: [],
      sessionMvps: [],
      ticker: [],
      lastWarWinner: null,
      campaignWinner: null,
      idle: false,
      viewers: 0,
      room: "",
    };
  }

  /** Live state — one stable object, mutated in place. Renderer reads it every frame. */
  get state(): ClashState {
    return this.st;
  }

  setRoom(room: string): void {
    this.st.room = room || "";
  }

  /** mulberry32 — COSMETIC-ONLY randomness (lanes, bot cadence jitter). */
  private rand(): number {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /* ── tick ─────────────────────────────────────────────────────────────── */

  tick(dt: number): SimEvent[] {
    const out: SimEvent[] = [];
    const step = Math.max(0, Math.min(250, dt || 0)); // clamp browser-tab hiccups
    if (step === 0) return out;
    this.st.simClock += step;
    this.decayCoinWindow();
    this.runPhaseMachine(out);
    this.marchUnits(step, out);
    this.runIdle(out);
    return out;
  }

  private decayCoinWindow(): void {
    const cutoff = this.st.simClock - CLASH.COIN_WINDOW_MS;
    while (this.coinWindow.length > 0 && this.coinWindow[0].atSimMs < cutoff) this.coinWindow.shift();
  }

  private windowCoins(): number {
    let sum = 0;
    for (const e of this.coinWindow) sum += e.coins;
    return sum;
  }

  private runPhaseMachine(out: SimEvent[]): void {
    const st = this.st;
    if (st.simClock < st.phaseEndsAt) return;
    if (st.phase === "war") {
      if (Math.abs(st.p - 50) < 1) {
        st.phase = "suddenDeath";
        st.phaseEndsAt = st.simClock + CLASH.SUDDEN_MS;
        out.push({ kind: "suddenDeath" });
      } else {
        this.endWar(st.p > 50 ? "crimson" : "cobalt", out);
      }
    } else if (st.phase === "suddenDeath") {
      this.endWar(null, out); // nothing pushed — the war is a draw
    } else if (st.phase === "intermission") {
      this.startWar(st.warNumber + 1, out);
    } else {
      // ceremony over — the campaign resets
      st.wins.crimson = 0;
      st.wins.cobalt = 0;
      st.campaignWinner = null;
      this.startWar(1, out);
    }
  }

  private startWar(warNumber: number, out: SimEvent[]): void {
    const st = this.st;
    this.warSerial += 1; // releases team locks + starts a fresh war-stat window
    st.warNumber = warNumber;
    st.phase = "war";
    st.phaseEndsAt = st.simClock + CLASH.WAR_MS;
    st.p = 50;
    st.k = Math.max(CLASH.K_FLOOR, this.windowCoins()); // K frozen for this war
    st.units.length = 0;
    st.comeback = null;
    st.warMvps = [];
    for (const rec of this.users.values()) {
      rec.warCoins = 0;
      rec.warPushes = 0;
    }
    out.push({ kind: "warStart", warNumber });
  }

  private endWar(winner: TeamId | null, out: SimEvent[]): void {
    const st = this.st;
    if (st.phase !== "war" && st.phase !== "suddenDeath") return; // already ended this tick
    out.push({ kind: "warEnd", winner, mvp: st.warMvps[0] ?? null });
    st.lastWarWinner = winner;
    if (winner) {
      st.wins[winner] += 1;
      this.pushTicker(S.tickerWarWin(TEAM_NAME[winner]), winner);
      if (st.wins[winner] >= CLASH.WINS_TO_CAMPAIGN) {
        st.phase = "ceremony";
        st.phaseEndsAt = st.simClock + CLASH.CEREMONY_MS;
        st.campaignWinner = winner;
        out.push({ kind: "campaignEnd", winner, mvp: st.sessionMvps[0] ?? null });
        return;
      }
    } else {
      this.pushTicker(S.tickerDraw());
    }
    st.phase = "intermission";
    st.phaseEndsAt = st.simClock + CLASH.INTERMISSION_MS;
  }

  private marchUnits(dt: number, out: SimEvent[]): void {
    const st = this.st;
    const secs = dt / 1000;
    const arrived: Unit[] = [];
    for (const u of st.units) {
      const mult = st.surge[u.team].activeUntil > st.simClock ? CLASH.SURGE_SPEED : 1;
      u.y += u.speed * mult * secs;
      const line = st.p / 100;
      if (u.team === "crimson" ? u.y >= line : u.y <= line) arrived.push(u);
    }
    for (const u of arrived) {
      const i = st.units.indexOf(u);
      if (i >= 0) st.units.splice(i, 1);
      if (u.bot) {
        this.botDeliver(u.team, out);
      } else if (this.applyPush(u.team, u.power, undefined, out) && u.user) {
        const rec = this.users.get(u.user.id);
        if (rec) {
          rec.warPushes += 1;
          rec.sessionPushes += 1;
          this.rebuildMvps();
        }
      }
    }
  }

  private runIdle(out: SimEvent[]): void {
    const st = this.st;
    if (!st.idle) {
      if (st.simClock - this.lastHumanAt >= CLASH.IDLE_AFTER_MS) {
        st.idle = true;
        this.nextBotAt = st.simClock;
      }
      return;
    }
    if (st.simClock >= this.nextBotAt) {
      const team: TeamId = this.botCounter % 2 === 0 ? "crimson" : "cobalt";
      this.botCounter += 1;
      this.spawnUnit(team, "trooper", CLASH.COMMENT_POWER, undefined, true, out);
      // cadence jitter (0.8x–1.2x) is cosmetic — seeded rng only
      this.nextBotAt = st.simClock + CLASH.BOT_SPAWN_MS * (0.8 + 0.4 * this.rand());
    }
  }

  /* ── events ───────────────────────────────────────────────────────────── */

  onEvent(ev: ShowEvent): SimEvent[] {
    const out: SimEvent[] = [];
    if (!ev || typeof ev !== "object" || !ev.user) return out;
    const st = this.st;
    if (ev.type === "room") {
      st.viewers = Math.max(0, ev.value | 0);
      return out;
    }
    // any non-room event counts as human presence (director sim events behave identically)
    this.lastHumanAt = st.simClock;
    if (st.idle) {
      st.idle = false;
      out.push({ kind: "firstHuman", user: ev.user });
    }
    switch (ev.type) {
      case "chat":
        this.onChat(ev, out);
        break;
      case "gift":
        this.onGift(ev, out);
        break;
      case "like":
        this.onLike(ev, out);
        break;
      case "follow":
        this.onFollow(ev, out);
        break;
      case "share":
        this.onShare(ev, out);
        break;
      case "join":
        break; // presence only — team assignment happens on first contribution
    }
    return out;
  }

  private onChat(ev: ShowEvent, out: SimEvent[]): void {
    const st = this.st;
    const word = (ev.text ?? "").trim().toLowerCase();
    const picked: TeamId | undefined = TEAM_WORDS[word];
    let rec = this.users.get(ev.user.id);
    if (picked && !rec) {
      // explicit pick on first contact beats auto-assignment
      rec = this.newUser(ev.user, picked);
    } else if (picked && rec && rec.lockSerial !== this.warSerial && rec.team !== picked) {
      rec.team = picked; // switch allowed until they contribute this war
      rec.user = ev.user;
      this.pushTicker(S.tickerJoin(ev.user.name, TEAM_NAME[picked]), picked);
    }
    if (!rec) rec = this.getUser(ev.user);
    else rec.user = ev.user;
    if (st.simClock - rec.lastCommentAt < CLASH.COMMENT_COOLDOWN_MS) return;
    rec.lastCommentAt = st.simClock;
    this.spawnUnit(rec.team, "trooper", CLASH.COMMENT_POWER, rec.user, false, out);
    this.lockIfWar(rec);
  }

  private onGift(ev: ShowEvent, out: SimEvent[]): void {
    const st = this.st;
    const rec = this.getUser(ev.user);
    const coins = Math.max(1, Math.round(ev.value) || 1); // value = unit coins × combo count
    const combo = Math.max(1, ev.count | 0);
    const tier: GiftTier = tierForCoins(coins); // coin buckets are the ONLY effect router
    this.coinWindow.push({ atSimMs: st.simClock, coins });
    rec.sessionCoins += coins;
    out.push({ kind: "strike", team: rec.team, tier, user: rec.user, coins, combo });
    this.pushTicker(S.tickerGift(rec.user.name, TIER_LABEL[tier]), rec.team, tier);
    if (tier === 4) out.push({ kind: "takeover", user: rec.user, team: rec.team, coins });
    if (tier === 1) this.spawnUnit(rec.team, "champion", CHAMPION_POWER, rec.user, false, out);
    else if (tier === 3) this.spawnUnit(rec.team, "hero", HERO_POWER, rec.user, false, out);
    if (st.phase === "war" || st.phase === "suddenDeath") {
      rec.warCoins += coins;
      rec.warPushes += 1;
      rec.sessionPushes += 1;
      rec.lockSerial = this.warSerial;
      this.applyPush(rec.team, coins, tier, out); // gifts strike the line INSTANTLY
    }
    this.rebuildMvps();
  }

  private onLike(ev: ShowEvent, out: SimEvent[]): void {
    const st = this.st;
    const rec = this.getUser(ev.user);
    const team = rec.team;
    st.teamLikes[team] += Math.max(1, ev.value | 0);
    this.lockIfWar(rec);
    const total = st.teamLikes[team];
    st.surge[team].charge = ((total % CLASH.LIKES_PER_SURGE) / CLASH.LIKES_PER_SURGE) * 100;
    const due = Math.floor(total / CLASH.LIKES_PER_SURGE);
    while (this.likesFired[team] < due) {
      this.likesFired[team] += 1;
      st.surge[team].activeUntil = st.simClock + CLASH.SURGE_MS;
      out.push({ kind: "surge", team });
      this.pushTicker(S.tickerSurge(TEAM_NAME[team]), team);
    }
  }

  private onFollow(ev: ShowEvent, out: SimEvent[]): void {
    const rec = this.getUser(ev.user);
    this.spawnUnit(rec.team, "recruit", CLASH.FOLLOW_POWER, rec.user, false, out);
    out.push({ kind: "welcome", user: rec.user, team: rec.team });
    this.pushTicker(S.tickerFollow(rec.user.name), rec.team);
    this.lockIfWar(rec);
  }

  private onShare(ev: ShowEvent, out: SimEvent[]): void {
    const rec = this.getUser(ev.user);
    for (let i = 0; i < CLASH.SHARE_SQUAD; i++) {
      this.spawnUnit(rec.team, "squad", SQUAD_MEMBER_POWER, rec.user, false, out);
    }
    out.push({ kind: "reinforce", user: rec.user, team: rec.team });
    this.pushTicker(S.tickerShare(rec.user.name), rec.team);
    this.lockIfWar(rec);
  }

  /* ── users + teams ────────────────────────────────────────────────────── */

  private getUser(user: EvUser): UserRec {
    const rec = this.users.get(user.id);
    if (rec) {
      rec.user = user; // refresh display name / avatar
      return rec;
    }
    return this.newUser(user, this.pickTeam());
  }

  private newUser(user: EvUser, team: TeamId): UserRec {
    const rec: UserRec = {
      user,
      team,
      lastCommentAt: -1e9,
      lockSerial: 0,
      warCoins: 0,
      warPushes: 0,
      sessionCoins: 0,
      sessionPushes: 0,
    };
    this.users.set(user.id, rec);
    this.pushTicker(S.tickerJoin(user.name, TEAM_NAME[team]), team);
    return rec;
  }

  /** Auto-assign: the team with fewer ACTIVE members (contributed this war);
   *  ties break by deterministic alternation. */
  private pickTeam(): TeamId {
    let crimson = 0;
    let cobalt = 0;
    for (const r of this.users.values()) {
      if (r.lockSerial !== this.warSerial) continue;
      if (r.team === "crimson") crimson += 1;
      else cobalt += 1;
    }
    if (crimson !== cobalt) return crimson < cobalt ? "crimson" : "cobalt";
    this.assignFlip += 1;
    return this.assignFlip % 2 === 1 ? "crimson" : "cobalt";
  }

  /** Contributing during a live war locks the user's team until the next war. */
  private lockIfWar(rec: UserRec): void {
    if (this.st.phase === "war" || this.st.phase === "suddenDeath") rec.lockSerial = this.warSerial;
  }

  /* ── push math (the one deterministic pipeline) ───────────────────────── */

  /** Convert push points into line movement. Returns true if the push landed. */
  private applyPush(team: TeamId, points: number, tier: GiftTier | undefined, out: SimEvent[]): boolean {
    const st = this.st;
    if (points <= 0) return false;
    if (st.phase !== "war" && st.phase !== "suddenDeath") return false;
    const sudden = st.phase === "suddenDeath";
    let pts = points;
    if (st.comeback === team) pts *= CLASH.COMEBACK_MULT;
    let pct = Math.min(CLASH.MAX_EVENT_PCT, (pts / st.k) * 100);
    const floor = tier !== undefined ? CLASH.TIER_FLOOR_PCT[tier] ?? 0 : 0; // whale legibility
    pct = Math.min(CLASH.MAX_EVENT_PCT, Math.max(pct, floor));
    this.shiftLine(team, pct, out);
    // sudden death: the first push of ANY size wins instantly
    if (sudden && st.phase === "suddenDeath") this.endWar(team, out);
    return true;
  }

  /** Move the front line, emit lineShift, re-check comeback + core break. */
  private shiftLine(team: TeamId, pct: number, out: SimEvent[]): void {
    if (pct <= 0) return;
    const st = this.st;
    st.p = clampP(st.p + (team === "crimson" ? pct : -pct));
    out.push({ kind: "lineShift", team, amount: pct });
    this.updateComeback(out);
    if (st.phase === "war" || st.phase === "suddenDeath") {
      if (st.p >= CLASH.CORE_BREAK_PCT) {
        out.push({ kind: "coreBreak", team: "cobalt" }); // cobalt's core broke — they lost
        this.endWar("crimson", out);
      } else if (st.p <= 100 - CLASH.CORE_BREAK_PCT) {
        out.push({ kind: "coreBreak", team: "crimson" });
        this.endWar("cobalt", out);
      }
    }
  }

  private updateComeback(out: SimEvent[]): void {
    const st = this.st;
    const cur: TeamId | null =
      st.p < CLASH.COMEBACK_BELOW_PCT ? "crimson" : 100 - st.p < CLASH.COMEBACK_BELOW_PCT ? "cobalt" : null;
    if (cur === st.comeback) return;
    const affected = cur ?? st.comeback; // engaging team, or the team that just disengaged
    st.comeback = cur;
    if (affected) out.push({ kind: "comeback", team: affected });
  }

  /** House-bot delivery: gentle deterministic drift back toward midfield. */
  private botDeliver(team: TeamId, out: SimEvent[]): void {
    const st = this.st;
    if (st.phase === "suddenDeath") {
      this.endWar(team, out); // a push of any size still decides sudden death
      return;
    }
    if (st.phase !== "war") return;
    const toward50 = team === "crimson" ? st.p < 50 : st.p > 50;
    this.shiftLine(team, toward50 ? BOT_DRIFT_TOWARD_PCT : BOT_DRIFT_AWAY_PCT, out);
  }

  /* ── units ────────────────────────────────────────────────────────────── */

  private spawnUnit(
    team: TeamId,
    kind: UnitKind,
    power: number,
    user: EvUser | undefined,
    bot: boolean,
    out: SimEvent[],
  ): Unit {
    this.enforceCaps(team);
    const u: Unit = {
      id: ++this.unitIds,
      team,
      kind,
      user,
      bot: bot || undefined,
      x: 0.06 + this.rand() * 0.88, // lane position is cosmetic
      y: team === "crimson" ? 0.02 : 0.98,
      speed: CLASH.UNIT_SPEED * (team === "crimson" ? 1 : -1),
      power,
      bornAt: this.st.simClock,
    };
    this.st.units.push(u);
    out.push({ kind: "spawn", unit: u });
    return u;
  }

  private enforceCaps(team: TeamId): void {
    const st = this.st;
    let teamCount = 0;
    for (const u of st.units) if (u.team === team) teamCount += 1;
    while (teamCount >= CLASH.TEAM_UNIT_CAP) {
      if (!this.evictOne(team)) break;
      teamCount -= 1;
    }
    while (st.units.length >= CLASH.UNIT_CAP) {
      if (!this.evictOne(null)) break; // only champions/heroes left — soft-exceed
    }
  }

  /** Evict the oldest bot first, then troopers/squads, then recruits — never champions/heroes. */
  private evictOne(team: TeamId | null): boolean {
    const units = this.st.units;
    const passes: ((u: Unit) => boolean)[] = [
      (u) => u.bot === true,
      (u) => !u.bot && (u.kind === "trooper" || u.kind === "squad"),
      (u) => !u.bot && u.kind === "recruit",
    ];
    for (const match of passes) {
      let best = -1;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (team && u.team !== team) continue;
        if (!match(u)) continue;
        if (
          best < 0 ||
          u.bornAt < units[best].bornAt ||
          (u.bornAt === units[best].bornAt && u.id < units[best].id)
        ) {
          best = i;
        }
      }
      if (best >= 0) {
        units.splice(best, 1);
        return true;
      }
    }
    return false;
  }

  /* ── leaderboards + ticker ────────────────────────────────────────────── */

  private rebuildMvps(): void {
    const war: UserRec[] = [];
    const session: UserRec[] = [];
    for (const r of this.users.values()) {
      if (r.warCoins > 0 || r.warPushes > 0) war.push(r);
      if (r.sessionCoins > 0 || r.sessionPushes > 0) session.push(r);
    }
    war.sort((a, b) => b.warCoins - a.warCoins || b.warPushes - a.warPushes || a.user.id.localeCompare(b.user.id));
    session.sort(
      (a, b) => b.sessionCoins - a.sessionCoins || b.sessionPushes - a.sessionPushes || a.user.id.localeCompare(b.user.id),
    );
    this.st.warMvps = war
      .slice(0, MVP_ROWS)
      .map((r): MvpRow => ({ user: r.user, team: r.team, coins: r.warCoins, pushes: r.warPushes }));
    this.st.sessionMvps = session
      .slice(0, MVP_ROWS)
      .map((r): MvpRow => ({ user: r.user, team: r.team, coins: r.sessionCoins, pushes: r.sessionPushes }));
  }

  private pushTicker(text: string, team?: TeamId, tier?: GiftTier): void {
    const item: TickerItem = { id: ++this.tickerIds, text, at: this.st.simClock };
    if (team) item.team = team;
    if (tier !== undefined) item.tier = tier;
    this.st.ticker.unshift(item);
    if (this.st.ticker.length > CLASH.TICKER_CAP) this.st.ticker.length = CLASH.TICKER_CAP;
  }

  /* ── snapshot / restore ───────────────────────────────────────────────── */

  snapshot(): GameSnapshot {
    const data: ClashSnapshotV1 = {
      st: this.st,
      users: Array.from(this.users.entries()),
      coinWindow: this.coinWindow,
      warSerial: this.warSerial,
      lastHumanAt: this.lastHumanAt,
      nextBotAt: this.nextBotAt,
      botCounter: this.botCounter,
      unitIds: this.unitIds,
      tickerIds: this.tickerIds,
      assignFlip: this.assignFlip,
      likesFired: this.likesFired,
      rngState: this.rngState,
    };
    // deep copy so the caller's snapshot is detached from the live sim
    return { game: "clash", v: 1, state: JSON.parse(JSON.stringify(data)) as ClashSnapshotV1 };
  }

  restore(s: GameSnapshot): boolean {
    if (!s || typeof s !== "object" || s.game !== "clash" || s.v !== 1) return false;
    const raw = s.state as Partial<ClashSnapshotV1> | null;
    if (!raw || typeof raw !== "object") return false;
    const src = raw.st;
    if (!src || typeof src !== "object") return false;
    if (
      typeof src.simClock !== "number" ||
      typeof src.phaseEndsAt !== "number" ||
      typeof src.warNumber !== "number" ||
      typeof src.p !== "number" ||
      typeof src.k !== "number"
    ) {
      return false;
    }
    if (!PHASES.includes(src.phase)) return false;
    if (!src.wins || typeof src.wins.crimson !== "number" || typeof src.wins.cobalt !== "number") return false;
    if (
      !src.surge ||
      !src.surge.crimson ||
      !src.surge.cobalt ||
      typeof src.surge.crimson.charge !== "number" ||
      typeof src.surge.crimson.activeUntil !== "number" ||
      typeof src.surge.cobalt.charge !== "number" ||
      typeof src.surge.cobalt.activeUntil !== "number"
    ) {
      return false;
    }
    if (!src.teamLikes || typeof src.teamLikes.crimson !== "number" || typeof src.teamLikes.cobalt !== "number") {
      return false;
    }
    if (
      !Array.isArray(src.units) ||
      !Array.isArray(src.ticker) ||
      !Array.isArray(src.warMvps) ||
      !Array.isArray(src.sessionMvps)
    ) {
      return false;
    }
    if (!Array.isArray(raw.users) || !Array.isArray(raw.coinWindow)) return false;
    if (typeof raw.warSerial !== "number" || typeof raw.rngState !== "number") return false;

    const d = JSON.parse(JSON.stringify(raw)) as ClashSnapshotV1; // detach from the caller's object
    const t = this.st; // mutate the stable state object in place
    t.simClock = d.st.simClock;
    t.phase = d.st.phase;
    t.phaseEndsAt = d.st.phaseEndsAt;
    t.warNumber = d.st.warNumber;
    t.wins.crimson = d.st.wins.crimson;
    t.wins.cobalt = d.st.wins.cobalt;
    t.p = clampP(d.st.p);
    t.k = Math.max(CLASH.K_FLOOR, d.st.k);
    t.units.length = 0;
    for (const u of d.st.units) t.units.push(u);
    t.surge.crimson = d.st.surge.crimson;
    t.surge.cobalt = d.st.surge.cobalt;
    t.teamLikes.crimson = d.st.teamLikes.crimson;
    t.teamLikes.cobalt = d.st.teamLikes.cobalt;
    t.comeback = d.st.comeback === "crimson" || d.st.comeback === "cobalt" ? d.st.comeback : null;
    t.warMvps = d.st.warMvps;
    t.sessionMvps = d.st.sessionMvps;
    t.ticker.length = 0;
    for (const it of d.st.ticker) t.ticker.push(it);
    t.lastWarWinner = d.st.lastWarWinner === "crimson" || d.st.lastWarWinner === "cobalt" ? d.st.lastWarWinner : null;
    t.campaignWinner =
      d.st.campaignWinner === "crimson" || d.st.campaignWinner === "cobalt" ? d.st.campaignWinner : null;
    t.idle = d.st.idle === true;
    t.viewers = typeof d.st.viewers === "number" ? d.st.viewers : 0;
    t.room = typeof d.st.room === "string" ? d.st.room : "";

    this.users = new Map(d.users);
    this.coinWindow = d.coinWindow;
    this.warSerial = d.warSerial;
    this.lastHumanAt = typeof d.lastHumanAt === "number" ? d.lastHumanAt : t.simClock;
    this.nextBotAt = typeof d.nextBotAt === "number" ? d.nextBotAt : t.simClock;
    this.botCounter = typeof d.botCounter === "number" ? d.botCounter : 0;
    this.assignFlip = typeof d.assignFlip === "number" ? d.assignFlip : 0;
    this.likesFired =
      d.likesFired && typeof d.likesFired.crimson === "number" && typeof d.likesFired.cobalt === "number"
        ? d.likesFired
        : {
            crimson: Math.floor(t.teamLikes.crimson / CLASH.LIKES_PER_SURGE),
            cobalt: Math.floor(t.teamLikes.cobalt / CLASH.LIKES_PER_SURGE),
          };
    this.rngState = (d.rngState >>> 0) || 1;
    // id counters must resume above anything already on screen
    let maxUnit = typeof d.unitIds === "number" ? d.unitIds : 0;
    for (const u of t.units) if (u.id > maxUnit) maxUnit = u.id;
    this.unitIds = maxUnit;
    let maxTicker = typeof d.tickerIds === "number" ? d.tickerIds : 0;
    for (const it of t.ticker) if (it.id > maxTicker) maxTicker = it.id;
    this.tickerIds = maxTicker;
    return true;
  }
}
