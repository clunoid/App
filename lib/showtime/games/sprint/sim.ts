/**
 * BEACH RACE — the deterministic simulation.
 *
 * A pure state machine: lobby (grid forms) -> race (<=90s) -> podium -> next lobby,
 * forever, with zero operator input. Time is the internal simClock advanced by
 * tick(dt); the ONLY randomness is a seeded mulberry32 used for cosmetic pacing
 * (per-racer wobble parameters, bot lanes) — outcomes are a pure function of the
 * event sequence, so a snapshot restore resumes the exact same race.
 *
 * Interaction rules (see config.ts for numbers):
 *  - lobby comment = join (max 12); mid-race comment from a racer = cheer micro-boost;
 *    non-racers who comment mid-race are queued and auto-joined at the next lobby.
 *  - gifts boost YOUR racer by coin-value tier (Dash/Turbo/Jet ski/Airlift/Parade);
 *    a gift from a non-racer auto-joins them (mid-race: at the back) — a gift ALWAYS
 *    lands on screen. Airlift also gains up to 2 positions. 10k+ adds the Parade.
 *  - likes pool into the shared Wave: at 100 the wave breaks and EVERYONE surfs.
 *  - follow = sun hat (session-persistent); share = beach ball + a short boost.
 *  - bots ("Sunny Bot N", clearly labeled) fill the grid to 6 and run exhibition
 *    races while the room is idle; they never touch the championship board.
 */
import type { EvUser, GameModule, GameSnapshot, PodiumRow, Racer, ScoreRow, ShowEvent, SimEvent, SprintPhase, SprintState, TickerItem } from "@/lib/showtime/types";
import { TIER_LABEL } from "@/lib/showtime/types";
import { tierForCoins } from "@/lib/showtime/gifts";
import { SPRINT } from "./config";
import { S } from "./strings";

/* ── seeded rng (cosmetic-only) ─────────────────────────────────────────── */

function mulberry32(seed: number) {
  let t = seed >>> 0;
  const next = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  return { next, get state() { return t; }, set state(v: number) { t = v >>> 0; } };
}

type Wobble = { a1: number; f1: number; p1: number; a2: number; f2: number; p2: number };

type PointsRow = { user: EvUser; points: number; wins: number };

export class SprintSim implements GameModule {
  readonly id = "sprint";

  private st: SprintState;
  private rng: ReturnType<typeof mulberry32>;
  private wobbles = new Map<string, Wobble>();
  private pendingJoin = new Map<string, EvUser>(); // auto-join at next lobby
  private hats = new Set<string>(); // session sun hats (follows)
  private cheerAt = new Map<string, number>(); // per-user cheer cooldown (simClock)
  private notedFull = new Set<string>(); // grid-full ticker shown once per user
  private pointsByUser = new Map<string, PointsRow>(); // session championship (humans)
  private likePool = 0;
  private lastHumanAt = 0;
  private botN = 0;
  private tickerN = 0;
  private placeCounter = 0;
  private finishAt: number[] = []; // simClock per place (1-based -> index 0)
  private raceStartedAt = 0;

  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.st = {
      simClock: 0,
      phase: "lobby",
      phaseEndsAt: SPRINT.LOBBY_MS,
      raceNumber: 1,
      racers: [],
      waveCharge: 0,
      waveUntil: 0,
      board: [],
      lastPodium: [],
      ticker: [],
      idle: false,
      viewers: 0,
      room: "",
    };
  }

  get state(): SprintState {
    return this.st;
  }

  setRoom(room: string): void {
    this.st.room = room;
  }

  /* ── helpers ──────────────────────────────────────────────────────────── */

  private ticker(text: string, tier?: number) {
    const item: TickerItem = { id: ++this.tickerN, text, tier: tier as TickerItem["tier"], at: this.st.simClock };
    this.st.ticker.unshift(item);
    if (this.st.ticker.length > SPRINT.TICKER_CAP) this.st.ticker.length = SPRINT.TICKER_CAP;
  }

  private newWobble(): Wobble {
    const r = this.rng;
    // two slow sines: periods ~9-24s, amplitudes split so the sum stays within ±WOBBLE
    const f = (min: number, max: number) => (Math.PI * 2) / (min + r.next() * (max - min));
    const aSplit = 0.4 + r.next() * 0.3;
    return {
      a1: SPRINT.WOBBLE * aSplit,
      f1: f(9_000, 16_000),
      p1: r.next() * Math.PI * 2,
      a2: SPRINT.WOBBLE * (1 - aSplit),
      f2: f(14_000, 24_000),
      p2: r.next() * Math.PI * 2,
    };
  }

  private racerOf(id: string): Racer | undefined {
    return this.st.racers.find((r) => r.id === id);
  }

  private freeLane(): number {
    // fill from the center outward so a small grid reads balanced on screen
    const used = new Set(this.st.racers.map((r) => r.lane));
    const mid = (SPRINT.GRID_MAX - 1) / 2;
    const order = Array.from({ length: SPRINT.GRID_MAX }, (_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
    for (const i of order) if (!used.has(i)) return i;
    return -1;
  }

  private makeRacer(user: EvUser | undefined, bot: boolean, lane: number, progress = 0): Racer {
    const id = bot ? `bot:${++this.botN}` : user!.id;
    this.wobbles.set(id, this.newWobble());
    return {
      id,
      user,
      bot: bot || undefined,
      lane,
      progress,
      boostUntil: 0,
      boostMult: 1,
      boostTier: -1,
      hat: user ? this.hats.has(user.id) : undefined,
      cheerUntil: 0,
      points: this.pointsByUser.get(user?.id ?? "")?.points ?? 0,
      joinedAt: this.st.simClock,
    };
  }

  private join(user: EvUser, midRace: boolean, out: SimEvent[], backOfPack = false): Racer | null {
    if (this.racerOf(user.id)) return this.racerOf(user.id)!;
    const lane = this.freeLane();
    if (lane < 0) {
      if (!this.notedFull.has(user.id)) {
        this.notedFull.add(user.id);
        this.pendingJoin.set(user.id, user);
        this.ticker(S.gridFullNote(user.name));
      }
      return null;
    }
    let progress = 0;
    if (backOfPack) {
      const active = this.st.racers.filter((r) => r.place === undefined);
      const minP = active.length ? Math.min(...active.map((r) => r.progress)) : 0;
      progress = Math.max(0, minP - 0.02);
    }
    const racer = this.makeRacer(user, false, lane, progress);
    this.st.racers.push(racer);
    this.pendingJoin.delete(user.id);
    out.push({ kind: "join", user, lane, midRace });
    this.ticker(S.tickerJoin(user.name));
    return racer;
  }

  private applyBoost(r: Racer, tier: number) {
    const b = SPRINT.TIER_BOOST[tier];
    if (!b) return;
    r.boostUntil = Math.max(r.boostUntil, this.st.simClock + b.ms);
    r.boostMult = Math.max(r.boostMult > 1 && this.st.simClock < r.boostUntil ? r.boostMult : 1, b.mult);
    r.boostTier = Math.max(r.boostTier, tier) as Racer["boostTier"];
  }

  private airlift(r: Racer) {
    if (r.place !== undefined) return;
    const active = this.st.racers.filter((x) => x.place === undefined).sort((a, b) => b.progress - a.progress);
    const idx = active.indexOf(r);
    if (idx <= 0) return;
    const targetIdx = Math.max(0, idx - SPRINT.AIRLIFT_PLACES);
    r.progress = Math.min(0.995, active[targetIdx].progress + 0.003);
  }

  private markHuman(out: SimEvent[], user: EvUser) {
    this.lastHumanAt = this.st.simClock;
    if (this.st.idle) {
      this.st.idle = false;
      out.push({ kind: "firstHuman", user });
      // the returning human gets a lane immediately, even mid-race
      if (this.st.phase === "race") this.join(user, true, out, true);
    }
  }

  /* ── phase machine ────────────────────────────────────────────────────── */

  private startRace(out: SimEvent[]) {
    // fill with clearly-labeled bots to the minimum grid
    while (this.st.racers.length < SPRINT.GRID_MIN) {
      const lane = this.freeLane();
      if (lane < 0) break;
      this.st.racers.push(this.makeRacer(undefined, true, lane));
    }
    for (const r of this.st.racers) {
      r.progress = 0;
      r.place = undefined;
      r.boostUntil = 0;
      r.boostMult = 1;
      r.boostTier = -1;
      r.cheerUntil = 0;
      r.hat = r.user ? this.hats.has(r.user.id) : undefined;
    }
    this.placeCounter = 0;
    this.finishAt = [];
    this.raceStartedAt = this.st.simClock;
    this.st.phase = "race";
    this.st.phaseEndsAt = this.st.simClock + SPRINT.RACE_MAX_MS;
    out.push({ kind: "raceStart", raceNumber: this.st.raceNumber });
  }

  private awardPoints(r: Racer, place: number) {
    if (r.bot || !r.user) return;
    const pts = place <= SPRINT.POINTS.length ? SPRINT.POINTS[place - 1] : SPRINT.POINT_PARTICIPATE;
    const row = this.pointsByUser.get(r.user.id) ?? { user: r.user, points: 0, wins: 0 };
    row.user = r.user;
    row.points += pts;
    if (place === 1) row.wins++;
    this.pointsByUser.set(r.user.id, row);
    r.points = row.points;
  }

  private rebuildBoard() {
    const rows: ScoreRow[] = [...this.pointsByUser.values()]
      .sort((a, b) => b.points - a.points || b.wins - a.wins)
      .slice(0, 5)
      .map((r) => ({ user: r.user, points: r.points, wins: r.wins }));
    this.st.board = rows;
  }

  private endRace(out: SimEvent[]) {
    // rank the unfinished by progress
    const remaining = this.st.racers.filter((r) => r.place === undefined).sort((a, b) => b.progress - a.progress);
    for (const r of remaining) r.place = ++this.placeCounter;

    const ranked = [...this.st.racers].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
    const podium: PodiumRow[] = ranked.slice(0, 3).map((r) => ({
      user: r.user,
      bot: r.bot,
      place: r.place ?? 0,
      points: r.place && r.place <= SPRINT.POINTS.length ? SPRINT.POINTS[r.place - 1] : SPRINT.POINT_PARTICIPATE,
    }));
    for (const r of ranked) this.awardPoints(r, r.place ?? 99);
    this.rebuildBoard();

    this.st.lastPodium = podium;
    const winner = podium[0];
    if (winner) this.ticker(S.tickerWin(winner.user?.name ?? S.botName(Number(String(ranked[0].id).split(":")[1] || 0))));
    out.push({ kind: "raceEnd", podium });
    this.st.phase = "podium";
    this.st.phaseEndsAt = this.st.simClock + SPRINT.PODIUM_MS;
  }

  private startLobby(out: SimEvent[]) {
    this.st.raceNumber++;
    // humans stay on the grid for the next race; bots leave (re-filled at start)
    this.st.racers = this.st.racers.filter((r) => !r.bot);
    for (const r of this.st.racers) {
      r.progress = 0;
      r.place = undefined;
      r.boostUntil = 0;
      r.boostMult = 1;
      r.boostTier = -1;
    }
    // auto-join everyone who commented/gifted while the race was running
    for (const user of [...this.pendingJoin.values()]) {
      if (this.st.racers.length >= SPRINT.GRID_MAX) break;
      this.join(user, false, out);
    }
    this.st.phase = "lobby";
    this.st.phaseEndsAt = this.st.simClock + SPRINT.LOBBY_MS;
  }

  /* ── GameModule: tick ─────────────────────────────────────────────────── */

  tick(dt: number): SimEvent[] {
    const out: SimEvent[] = [];
    const step = Math.max(0, Math.min(250, dt || 0));
    if (step === 0) return out;
    this.st.simClock += step;
    const now = this.st.simClock;

    // idle detection (bots keep the beach alive; board untouched)
    if (!this.st.idle && now - this.lastHumanAt > SPRINT.IDLE_AFTER_MS) this.st.idle = true;

    if (this.st.phase === "lobby") {
      if (now >= this.st.phaseEndsAt) this.startRace(out);
    } else if (this.st.phase === "race") {
      this.moveRacers(step, out);
      if (this.placeCounter >= 3 || now >= this.st.phaseEndsAt) this.endRace(out);
    } else if (this.st.phase === "podium") {
      if (now >= this.st.phaseEndsAt) this.startLobby(out);
    }

    if (this.st.waveUntil && now >= this.st.waveUntil) this.st.waveUntil = 0;
    return out;
  }

  private moveRacers(dt: number, out: SimEvent[]) {
    const now = this.st.simClock;
    const t = now - this.raceStartedAt;
    const active = this.st.racers.filter((r) => r.place === undefined);
    if (!active.length) return;
    const byProgress = [...active].sort((a, b) => b.progress - a.progress);
    const bottom = new Set(byProgress.slice(-3).map((r) => r.id));
    const waveOn = now < this.st.waveUntil;

    for (const r of active) {
      const w = this.wobbles.get(r.id);
      const wob = w ? w.a1 * Math.sin(w.f1 * t + w.p1) + w.a2 * Math.sin(w.f2 * t + w.p2) : 0;
      let mult = 1 + wob;
      if (bottom.has(r.id)) mult += SPRINT.RUBBERBAND;
      if (now < r.boostUntil) mult *= r.boostMult;
      if (now < r.cheerUntil) mult *= SPRINT.CHEER_MULT;
      if (waveOn) mult *= SPRINT.WAVE_MULT;
      r.progress += (dt / SPRINT.BASE_FINISH_MS) * mult;

      if (r.progress >= 1) {
        r.progress = 1;
        r.place = ++this.placeCounter;
        this.finishAt[r.place - 1] = now;
        out.push({ kind: "finish", racer: r, place: r.place });
        if (r.place === 2 && this.finishAt[1] - this.finishAt[0] <= SPRINT.PHOTO_FINISH_MS) {
          out.push({ kind: "photoFinish" });
        }
      }
    }
  }

  /* ── GameModule: events ───────────────────────────────────────────────── */

  onEvent(ev: ShowEvent): SimEvent[] {
    const out: SimEvent[] = [];
    const now = this.st.simClock;

    if (ev.type === "room") {
      this.st.viewers = ev.value;
      return out;
    }
    this.markHuman(out, ev.user);

    switch (ev.type) {
      case "chat": {
        const racer = this.racerOf(ev.user.id);
        if (this.st.phase === "lobby") {
          if (!racer) this.join(ev.user, false, out);
        } else if (racer && racer.place === undefined && this.st.phase === "race") {
          const last = this.cheerAt.get(ev.user.id) ?? -1e9;
          if (now - last >= SPRINT.CHEER_COOLDOWN_MS) {
            this.cheerAt.set(ev.user.id, now);
            racer.cheerUntil = now + SPRINT.CHEER_MS;
            out.push({ kind: "cheer", user: ev.user });
          }
        } else if (!racer) {
          this.pendingJoin.set(ev.user.id, ev.user);
        }
        break;
      }
      case "gift": {
        const tier = tierForCoins(ev.value);
        let racer = this.racerOf(ev.user.id);
        if (!racer && this.st.phase !== "podium") {
          racer = this.join(ev.user, this.st.phase === "race", out, this.st.phase === "race") ?? undefined;
        }
        if (!racer && this.st.phase === "podium") this.pendingJoin.set(ev.user.id, ev.user);
        if (racer) {
          this.applyBoost(racer, tier);
          if (tier === 3 && this.st.phase === "race") this.airlift(racer);
        }
        out.push({ kind: "boost", user: ev.user, tier, coins: ev.value, combo: ev.count });
        if (tier === 4) out.push({ kind: "takeover", user: ev.user, coins: ev.value });
        this.ticker(S.tickerBoost(ev.user.name, TIER_LABEL[tier]), tier);
        break;
      }
      case "like": {
        this.likePool += ev.value;
        while (this.likePool >= SPRINT.LIKES_PER_WAVE) {
          this.likePool -= SPRINT.LIKES_PER_WAVE;
          this.st.waveUntil = now + SPRINT.WAVE_MS;
          out.push({ kind: "wave" });
          this.ticker(S.tickerWave());
        }
        this.st.waveCharge = Math.min(100, Math.round((this.likePool / SPRINT.LIKES_PER_WAVE) * 100));
        break;
      }
      case "follow": {
        this.hats.add(ev.user.id);
        const racer = this.racerOf(ev.user.id);
        if (racer) racer.hat = true;
        out.push({ kind: "welcome", user: ev.user });
        this.ticker(S.tickerHat(ev.user.name));
        break;
      }
      case "share": {
        const racer = this.racerOf(ev.user.id);
        if (racer && racer.place === undefined) {
          racer.boostUntil = Math.max(racer.boostUntil, now + SPRINT.SHARE_MS);
          racer.boostMult = Math.max(racer.boostMult > 1 && now < racer.boostUntil ? racer.boostMult : 1, SPRINT.SHARE_MULT);
        }
        out.push({ kind: "beachball", user: ev.user });
        break;
      }
      case "join":
        break; // room joins are ambient — the ticker would drown
    }
    return out;
  }

  /* ── GameModule: snapshot / restore ───────────────────────────────────── */

  snapshot(): GameSnapshot {
    return {
      game: "sprint",
      v: 1,
      state: {
        st: this.st,
        wobbles: [...this.wobbles.entries()],
        pendingJoin: [...this.pendingJoin.entries()],
        hats: [...this.hats.values()],
        cheerAt: [...this.cheerAt.entries()],
        notedFull: [...this.notedFull.values()],
        points: [...this.pointsByUser.entries()],
        likePool: this.likePool,
        lastHumanAt: this.lastHumanAt,
        botN: this.botN,
        tickerN: this.tickerN,
        placeCounter: this.placeCounter,
        finishAt: this.finishAt,
        raceStartedAt: this.raceStartedAt,
        rng: this.rng.state,
      },
    };
  }

  restore(s: GameSnapshot): boolean {
    if (!s || s.game !== "sprint" || s.v !== 1 || typeof s.state !== "object" || !s.state) return false;
    const d = s.state as Record<string, unknown>;
    const st = d.st as SprintState | undefined;
    if (!st || !Array.isArray(st.racers) || typeof st.simClock !== "number") return false;
    try {
      this.st = st;
      this.wobbles = new Map((d.wobbles as [string, Wobble][]) ?? []);
      this.pendingJoin = new Map((d.pendingJoin as [string, EvUser][]) ?? []);
      this.hats = new Set((d.hats as string[]) ?? []);
      this.cheerAt = new Map((d.cheerAt as [string, number][]) ?? []);
      this.notedFull = new Set((d.notedFull as string[]) ?? []);
      this.pointsByUser = new Map((d.points as [string, PointsRow][]) ?? []);
      this.likePool = (d.likePool as number) ?? 0;
      this.lastHumanAt = (d.lastHumanAt as number) ?? 0;
      this.botN = (d.botN as number) ?? 0;
      this.tickerN = (d.tickerN as number) ?? 0;
      this.placeCounter = (d.placeCounter as number) ?? 0;
      this.finishAt = (d.finishAt as number[]) ?? [];
      this.raceStartedAt = (d.raceStartedAt as number) ?? 0;
      if (typeof d.rng === "number") this.rng.state = d.rng;
      return true;
    } catch {
      return false;
    }
  }
}
