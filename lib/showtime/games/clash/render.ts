"use client";

/**
 * Clunoid Clash — the Canvas2D stage renderer. This is the product's face:
 * a clean, dark, premium arena drawn at a 1080×1920 design resolution and
 * uniformly scaled to whatever canvas it is given (the background is painted
 * across the full canvas in device space, so odd aspect ratios never show
 * letterbox bars). DPR-aware (capped at 2). Every piece of text is sized to
 * survive a 720p stream delivery (~22px+ body, 30px+ names at design scale).
 *
 * Architecture / budgets (contracts):
 *  - Pure sink: the renderer never mutates game state. It draws ClashState,
 *    plays SimEvents as pooled, timeline-based effects, and eases purely
 *    cosmetic values (front line position, MVP slots) toward sim truth.
 *  - Zero per-frame allocations in the steady state: effects (cap 200) and
 *    particles (cap 600) are pooled; gradients and sprites are pre-rendered
 *    per theme/resize; every dynamic string (clock, score, chips, truncated
 *    names, text widths) is cached and rebuilt only when its input changes.
 *    render() is safe to call at 60fps for 24h.
 *  - Tier-4 takeovers queue FIFO and never overlap.
 *  - Choreography is eased (cubic in/out, back-out for entrances) with
 *    anticipation → impact → settle; nothing linear, nothing abrupt.
 *
 * COMPLIANCE: effects key only off GiftTier buckets carried by SimEvents;
 * cosmetic variation uses deterministic seeded LCGs (no randomness in
 * outcomes); bots are always drawn with a visible BOT badge; game copy lives
 * in strings.ts (S) — the LBL table below is fixed UI chrome (scoreboard,
 * phase names, badges) and never solicits anything.
 */

import type {
  ClashState,
  EvUser,
  FeedStatus,
  GifterRow,
  GiftTier,
  MonumentRow,
  SimEvent,
  TeamId,
  UnitKind,
} from "@/lib/showtime/types";
import { TIER_LABEL } from "@/lib/showtime/types";
import { avatarImage } from "@/lib/showtime/avatars";
import { CLASH, THEMES, type ClashTheme } from "./config";
import { S } from "./strings";

/* ── Design space ───────────────────────────────────────────────────────── */

const W = 1080;
const H = 1920;
const TAU = Math.PI * 2;

const FIELD_TOP = 230;
const FIELD_BOT = 1580;
const KEEP_H = 56;
const KEEP_MX = 64; // keep bar horizontal margin
const LINE_TOP = FIELD_TOP + KEEP_H + 30; // front-line travel range
const LINE_BOT = FIELD_BOT - KEEP_H - 30;
const FIELD_L = 88; // unit lane bounds (clear of the surge meters)
const FIELD_R = W - 88;

const FX_CAP = 200;
const PT_CAP = 600;

/** Unit disc radii by kind (diameters 44/48/56/64/80 per spec). */
const UNIT_R: Record<UnitKind, number> = { trooper: 22, squad: 24, recruit: 28, champion: 32, hero: 40 };

/* Accent colors that are deliberately theme-independent (status semantics). */
const AMBER = "#F6A609";
const GOLD = "#F5C518";
const RED = "#FF453A";
const GREEN = "#2FD05E";

/**
 * Fixed UI chrome labels (scoreboard, phase names, badges). Game/host copy
 * lives in strings.ts; these are structural labels that describe state and
 * never solicit an action (compliance-reviewed here in one place).
 */
const LBL = {
  crimson: "CRIMSON",
  cobalt: "COBALT",
  war: "WAR",
  firstTo: "FIRST TO",
  suddenDeath: "SUDDEN DEATH",
  suddenHint: "NEXT PUSH WINS",
  intermission: "INTERMISSION",
  ceremony: "CAMPAIGN CEREMONY",
  campaign: "CAMPAIGN CHAMPIONS",
  takesWar: "TAKES WAR",
  draw: "WAR DRAWN",
  mvp: "MVP",
  warMvps: "WAR MVPS",
  sessionTop: "SESSION TOP 5",
  hallGifters: "HALL OF FAME",
  hallMonuments: "MONUMENTS",
  challenger: "A CHALLENGER JOINS",
  thousandArrows: "THOUSAND ARROWS",
  comeback: "COMEBACK ×1.25",
  coins: "COINS",
  bot: "BOT",
} as const;

const FS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const F = {
  clock: `800 112px ${FS}`,
  score: `800 52px ${FS}`,
  phase: `700 26px ${FS}`,
  banner: `800 64px ${FS}`,
  huge: `900 92px ${FS}`,
  coins: `800 56px ${FS}`,
  nameBig: `800 44px ${FS}`,
  name: `700 30px ${FS}`,
  chip: `700 28px ${FS}`,
  body: `600 26px ${FS}`,
  small: `600 22px ${FS}`,
  idle: `700 40px ${FS}`,
  rank: `800 22px ${FS}`,
  badge: `800 20px ${FS}`,
} as const;

/* ── Math helpers ───────────────────────────────────────────────────────── */

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
/** easeOutCubic */
function eo(t: number): number {
  const u = clamp01(t);
  return 1 - (1 - u) * (1 - u) * (1 - u);
}
/** easeInCubic */
function ei(t: number): number {
  const u = clamp01(t);
  return u * u * u;
}
/** easeInOutCubic */
function eio(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}
/** easeOutBack — entrances with a little overshoot + settle. */
function eb(t: number): number {
  const u = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}
/** FNV-1a → 0..1 (stable cosmetic lane per user). */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}
function stepLcg(s: number): number {
  return (Math.imul(s, 1664525) + 1013904223) >>> 0;
}
function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function teamLabel(t: TeamId): string {
  return t === "crimson" ? LBL.crimson : LBL.cobalt;
}

/* ── Pooled effect + particle records ───────────────────────────────────── */

type FxKind =
  | "arrow"
  | "volley"
  | "storm"
  | "thousand"
  | "champion"
  | "siege"
  | "heroDrop"
  | "takeover"
  | "chip"
  | "linePulse"
  | "coreBreak"
  | "warEnd"
  | "suddenIn"
  | "ceremonyIn"
  | "warStart"
  | "firstHuman";

/** 1 = full-field overlay layer (drawn above everything else). */
const FX_LAYER: Record<FxKind, 0 | 1> = {
  arrow: 0,
  volley: 0,
  storm: 0,
  champion: 0,
  siege: 0,
  chip: 0,
  linePulse: 0,
  thousand: 1,
  heroDrop: 1,
  takeover: 1,
  coreBreak: 1,
  warEnd: 1,
  suddenIn: 1,
  ceremonyIn: 1,
  warStart: 1,
  firstHuman: 1,
};

type Fx = {
  active: boolean;
  kind: FxKind;
  t0: number;
  dur: number;
  team: TeamId;
  tier: GiftTier;
  user: EvUser | null;
  text: string;
  text2: string;
  n: number; // combo / coins / war number / chip y — kind-specific
  lane: number; // 0..1 horizontal lane
  seed: number;
  fired: boolean; // one-shot triggers inside the timeline
  fired2: boolean;
};

type Pt = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  rot: number;
  vr: number;
  size: number;
  t0: number;
  life: number;
  ci: number; // index into pcolors / dot sprites
  shape: 0 | 1; // 0 = soft dot (additive), 1 = confetti rect
};

type Star = { x: number; y: number; r: number; s: number };

/* ── Renderer ───────────────────────────────────────────────────────────── */

export class ClashRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private theme: ClashTheme;
  private disposed = false;

  // viewport (CSS px) + design transform
  private dpr = 1;
  private cw = 0;
  private ch = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;

  private lastNow = 0;
  private dispP = 50; // eased territory display

  // pools
  private readonly fxPool: Fx[] = [];
  private readonly ptPool: Pt[] = [];
  private seedState = 0x9e3779b9;

  // tier-4 FIFO
  private readonly tkQueue: { user: EvUser; team: TeamId; coins: number }[] = [];
  private tkActive: Fx | null = null;

  // camera shake
  private shakeT0 = -1;
  private shakeDur = 1;
  private shakeAmp = 0;

  // theme/viewport-built resources
  private bgGrad: CanvasGradient | null = null;
  private vignette: CanvasGradient | null = null;
  private edgeCrimson: CanvasGradient | null = null;
  private edgeCobalt: CanvasGradient | null = null;
  private glowSprite: HTMLCanvasElement | null = null;
  private beamCrimson: HTMLCanvasElement | null = null;
  private beamCobalt: HTMLCanvasElement | null = null;
  private dots: HTMLCanvasElement[] = [];
  private pcolors: string[] = [];

  private readonly stars: Star[] = [];

  // string / measure caches (rebuilt only when inputs change)
  private clockSec = -1;
  private clockStr = "0:00";
  private phaseKey = "";
  private phaseStr = "";
  private scoreKey = "";
  private scoreSegs: { text: string; c: string; w: number }[] = [];
  private scoreW = 0;
  private chipPKey = -1;
  private chipCrimStr = "50%";
  private chipCobStr = "50%";
  private roomKey = "";
  private roomStr = "";
  private ceremonyKey = "";
  private ceremonyStr = "";
  private readonly truncCache = new Map<string, string>();
  private readonly widthCache = new Map<string, number>();
  private readonly wrapCache = new Map<string, string[]>();

  // MVP row easing
  private readonly mvpX = new Map<string, number>();

  // ticker slide
  private tkrId = -1;
  private tkrText = "";
  private tkrPrev = "";
  private tkrT0 = 0;

  private chipLane = 0;
  private lastWarNumber = 1;
  private lastDrizzle = 0;

  // hall of fame (pre-formatted in setAllTime)
  private hofG: { name: string; coins: string }[] = [];
  private hofM: { name: string; coins: string }[] = [];

  private feed: FeedStatus = "idle";
  private room = "";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
    this.theme = THEMES[0];

    for (let i = 0; i < FX_CAP; i++) {
      this.fxPool.push({
        active: false,
        kind: "arrow",
        t0: 0,
        dur: 1,
        team: "crimson",
        tier: 0,
        user: null,
        text: "",
        text2: "",
        n: 0,
        lane: 0.5,
        seed: 0,
        fired: false,
        fired2: false,
      });
    }
    for (let i = 0; i < PT_CAP; i++) {
      this.ptPool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, size: 4, t0: 0, life: 1, ci: 0, shape: 0 });
    }

    // Ambient starfield — fixed seed, purely cosmetic.
    let rs = 0x1234abcd;
    for (let i = 0; i < 110; i++) {
      rs = stepLcg(rs);
      const x = (rs / 4294967296) * W;
      rs = stepLcg(rs);
      const y = (rs / 4294967296) * H;
      rs = stepLcg(rs);
      const r = 1 + Math.floor((rs / 4294967296) * 3);
      this.stars.push({ x, y, r, s: 0.004 + r * 0.004 });
    }

    this.resize();
  }

  /* ── Public API ─────────────────────────────────────────────────────── */

  resize(): void {
    if (this.disposed) return;
    const el = this.canvas;
    const w = el.clientWidth || 1080;
    const h = el.clientHeight || 1920;
    this.dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const pw = Math.max(2, Math.round(w * this.dpr));
    const ph = Math.max(2, Math.round(h * this.dpr));
    if (el.width !== pw) el.width = pw;
    if (el.height !== ph) el.height = ph;
    this.cw = pw / this.dpr;
    this.ch = ph / this.dpr;
    // Uniform contain scale into the 1080×1920 design space; the background is
    // painted across the whole canvas so nothing ever reads as a letterbox bar.
    this.scale = Math.min(this.cw / W, this.ch / H);
    this.ox = (this.cw - W * this.scale) / 2;
    this.oy = (this.ch - H * this.scale) / 2;
    this.buildResources();
  }

  setTheme(id: string): void {
    if (this.disposed) return;
    let next = THEMES[0];
    for (const t of THEMES) if (t.id === id) next = t;
    if (next.id === this.theme.id) return;
    this.theme = next;
    this.scoreKey = ""; // score seg colors are theme-derived
    this.buildResources();
  }

  setAllTime(g: GifterRow[], m: MonumentRow[]): void {
    if (this.disposed) return;
    this.hofG = g.slice(0, 5).map((r) => ({ name: r.name, coins: r.total_coins.toLocaleString("en-US") }));
    this.hofM = m.slice(0, 5).map((r) => ({ name: r.name, coins: r.coins.toLocaleString("en-US") }));
  }

  setConnection(feed: FeedStatus, room: string): void {
    if (this.disposed) return;
    this.feed = feed;
    this.room = room;
  }

  onSimEvents(evs: SimEvent[]): void {
    if (this.disposed) return;
    const now = this.lastNow || (typeof performance !== "undefined" ? performance.now() : 0);
    for (const ev of evs) {
      switch (ev.kind) {
        case "strike":
          this.spawnStrike(ev.team, ev.tier, ev.user, ev.combo, now);
          break;
        case "takeover":
          this.tkQueue.push({ user: ev.user, team: ev.team, coins: ev.coins });
          break;
        case "surge":
          this.spawnChip(S.tickerSurge(teamLabel(ev.team)), ev.team, now);
          break;
        case "welcome":
          this.spawnChip(S.tickerFollow(ev.user.name), ev.team, now);
          break;
        case "reinforce":
          this.spawnChip(S.tickerShare(ev.user.name), ev.team, now);
          break;
        case "comeback":
          this.spawnChip(LBL.comeback, ev.team, now);
          break;
        case "lineShift": {
          const f = this.alloc(now);
          if (f) {
            f.kind = "linePulse";
            f.dur = 700;
            f.team = ev.team;
          }
          break;
        }
        case "suddenDeath": {
          const f = this.alloc(now);
          if (f) {
            f.kind = "suddenIn";
            f.dur = 2400;
          }
          break;
        }
        case "coreBreak": {
          const f = this.alloc(now);
          if (f) {
            f.kind = "coreBreak";
            f.dur = 1500;
            f.team = ev.team;
          }
          this.shake(now, 500, 4);
          break;
        }
        case "warEnd": {
          const f = this.alloc(now);
          if (f) {
            f.kind = "warEnd";
            f.dur = 3000;
            if (ev.winner) {
              f.team = ev.winner;
              f.text = `${teamLabel(ev.winner)} ${LBL.takesWar} ${this.lastWarNumber}`;
            } else {
              f.text = LBL.draw;
            }
            f.n = ev.winner ? 1 : 0;
            f.user = ev.mvp ? ev.mvp.user : null;
            f.text2 = ev.mvp ? this.trunc(ev.mvp.user.name, 14) : "";
          }
          break;
        }
        case "campaignEnd": {
          const f = this.alloc(now);
          if (f) {
            f.kind = "ceremonyIn";
            f.dur = 8000;
            f.team = ev.winner;
          }
          break;
        }
        case "warStart": {
          const f = this.alloc(now);
          if (f) {
            f.kind = "warStart";
            f.dur = 2400;
            f.n = ev.warNumber;
            f.text = `${LBL.war} ${ev.warNumber}`;
            f.text2 = `${LBL.firstTo} ${CLASH.WINS_TO_CAMPAIGN}`;
          }
          break;
        }
        case "firstHuman": {
          const f = this.alloc(now);
          if (f) {
            f.kind = "firstHuman";
            f.dur = 2200;
            f.user = ev.user;
            f.text = this.trunc(ev.user.name, 14);
          }
          break;
        }
        case "spawn":
          break; // units arrive via state; spawn moment reads through marching
      }
    }
  }

  render(state: ClashState, nowMs: number): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const th = this.theme;
    const dt = this.lastNow > 0 ? Math.min(100, Math.max(0, nowMs - this.lastNow)) : 16;
    this.lastNow = nowMs;
    this.lastWarNumber = state.warNumber;

    // Ease displayed territory toward sim truth (cosmetic only).
    this.dispP += (state.p - this.dispP) * Math.min(1, dt * 0.006);
    if (Math.abs(state.p - this.dispP) < 0.01) this.dispP = state.p;

    // Pump the tier-4 FIFO: next takeover starts as the previous ends.
    if ((!this.tkActive || !this.tkActive.active) && this.tkQueue.length > 0) {
      const q = this.tkQueue.shift();
      if (q) {
        const f = this.alloc(nowMs);
        if (f) {
          f.kind = "takeover";
          f.dur = 8000;
          f.team = q.team;
          f.tier = 4;
          f.user = q.user;
          f.lane = hash01(q.user.id);
          f.text = this.trunc(q.user.name, 14).toUpperCase();
          f.text2 = `${q.coins.toLocaleString("en-US")} ${LBL.coins}`;
          f.n = q.coins;
          this.tkActive = f;
        }
      }
    }

    // Full-bleed background in device space.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = this.bgGrad ?? th.skyDeep;
    ctx.fillRect(0, 0, this.cw, this.ch);

    // Design-space transform (+ camera shake).
    let sx = 0;
    let sy = 0;
    if (this.shakeT0 >= 0) {
      const st = (nowMs - this.shakeT0) / this.shakeDur;
      if (st >= 1) this.shakeT0 = -1;
      else {
        const decay = 1 - eo(st);
        sx = Math.sin(nowMs * 0.11) * this.shakeAmp * decay;
        sy = Math.cos(nowMs * 0.13) * this.shakeAmp * decay;
      }
    }
    ctx.translate(this.ox + sx * this.scale, this.oy + sy * this.scale);
    ctx.scale(this.scale, this.scale);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    this.drawStars(nowMs);
    this.drawField(state, nowMs);
    this.drawUnits(state, nowMs);
    this.drawTopBand(state, nowMs);
    this.drawBottomBand(state, nowMs, dt);
    if (state.phase === "ceremony") this.drawCeremony(state, nowMs);

    this.drawEffects(nowMs, 0);
    this.drawEffects(nowMs, 1);
    this.drawParticles(nowMs, dt);

    if (state.idle) this.drawIdle(nowMs);
    if (state.phase === "suddenDeath") this.drawSuddenBorder(nowMs);
  }

  dispose(): void {
    this.disposed = true;
    for (const f of this.fxPool) f.active = false;
    for (const p of this.ptPool) p.active = false;
    this.tkQueue.length = 0;
    this.tkActive = null;
    this.mvpX.clear();
    this.truncCache.clear();
    this.widthCache.clear();
    this.wrapCache.clear();
  }

  /* ── Resources (pre-rendered per theme/resize) ──────────────────────── */

  private buildResources(): void {
    const ctx = this.ctx;
    const th = this.theme;

    this.bgGrad = ctx.createLinearGradient(0, 0, 0, Math.max(1, this.ch));
    this.bgGrad.addColorStop(0, th.sky);
    this.bgGrad.addColorStop(1, th.skyDeep);

    this.vignette = ctx.createRadialGradient(W / 2, 900, 220, W / 2, 900, 1150);
    this.vignette.addColorStop(0, hexA(th.skyDeep, 0));
    this.vignette.addColorStop(1, hexA(th.skyDeep, 0.92));

    this.edgeCrimson = ctx.createLinearGradient(0, 0, 150, 0);
    this.edgeCrimson.addColorStop(0, hexA(th.crimson, 0.55));
    this.edgeCrimson.addColorStop(1, hexA(th.crimson, 0));
    this.edgeCobalt = ctx.createLinearGradient(W, 0, W - 150, 0);
    this.edgeCobalt.addColorStop(0, hexA(th.cobalt, 0.55));
    this.edgeCobalt.addColorStop(1, hexA(th.cobalt, 0));

    this.pcolors = [th.line, th.crimson, th.cobalt, AMBER, GOLD];
    this.dots = [];
    for (const c of this.pcolors) this.dots.push(makeDot(c));
    this.glowSprite = makeGlow(th.line);
    this.beamCrimson = makeBeam(th.crimson);
    this.beamCobalt = makeBeam(th.cobalt);
    this.widthCache.clear(); // fonts unchanged, but keep the cache honest across DPR swaps
  }

  /* ── Background layers ──────────────────────────────────────────────── */

  private drawStars(now: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.theme.ink;
    for (const s of this.stars) {
      const y = (s.y + now * s.s) % (H + 40);
      ctx.globalAlpha = 0.05 + s.r * 0.035;
      ctx.fillRect(s.x, y - 20, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  /* ── Field ──────────────────────────────────────────────────────────── */

  private lineY(): number {
    return lerp(LINE_TOP, LINE_BOT, this.dispP / 100);
  }

  private drawField(state: ClashState, now: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const lineY = this.lineY();
    const fieldW = FIELD_R - FIELD_L;

    // Territory tints — the held halves read instantly.
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = th.crimson;
    ctx.fillRect(FIELD_L, FIELD_TOP + KEEP_H, fieldW, Math.max(0, lineY - FIELD_TOP - KEEP_H));
    ctx.fillStyle = th.cobalt;
    ctx.fillRect(FIELD_L, lineY, fieldW, Math.max(0, FIELD_BOT - KEEP_H - lineY));
    ctx.globalAlpha = 1;

    // Faint center meridian (the 50% mark).
    const midY = lerp(LINE_TOP, LINE_BOT, 0.5);
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = th.inkDim;
    ctx.lineWidth = 2;
    ctx.setLineDash(DASH_MERIDIAN);
    ctx.beginPath();
    ctx.moveTo(FIELD_L, midY);
    ctx.lineTo(FIELD_R, midY);
    ctx.stroke();
    ctx.setLineDash(DASH_NONE);
    ctx.globalAlpha = 1;

    // Keeps.
    this.drawKeep("crimson", FIELD_TOP, now, state);
    this.drawKeep("cobalt", FIELD_BOT - KEEP_H, now, state);

    // Surge edge pulses while a surge is live.
    const surgeC = state.surge.crimson.activeUntil > state.simClock;
    const surgeB = state.surge.cobalt.activeUntil > state.simClock;
    if (surgeC && this.edgeCrimson) {
      ctx.globalAlpha = 0.3 + 0.16 * Math.sin(now * 0.012);
      ctx.fillStyle = this.edgeCrimson;
      ctx.fillRect(0, FIELD_TOP, 150, FIELD_BOT - FIELD_TOP);
      ctx.globalAlpha = 1;
    }
    if (surgeB && this.edgeCobalt) {
      ctx.globalAlpha = 0.3 + 0.16 * Math.sin(now * 0.012);
      ctx.fillStyle = this.edgeCobalt;
      ctx.fillRect(W - 150, FIELD_TOP, 150, FIELD_BOT - FIELD_TOP);
      ctx.globalAlpha = 1;
    }

    // Front line: soft glow band (additive) + crisp 6px line.
    if (this.glowSprite) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.42 + 0.12 * Math.sin(now * 0.003);
      ctx.drawImage(this.glowSprite, FIELD_L - 26, lineY - 44, fieldW + 52, 88);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = th.line;
    ctx.fillRect(FIELD_L - 14, lineY - 3, fieldW + 28, 6);

    // Territory % chips on both sides of the line.
    const pc = Math.round(this.dispP);
    if (pc !== this.chipPKey) {
      this.chipPKey = pc;
      this.chipCrimStr = `${pc}%`;
      this.chipCobStr = `${100 - pc}%`;
    }
    this.pctChip(FIELD_L + 52, lineY - 40, this.chipCrimStr, th.crimson);
    this.pctChip(FIELD_R - 52, lineY + 40, this.chipCobStr, th.cobalt);

    // Surge meters (vertical capsules on the field edges).
    this.drawMeter("crimson", 30, state, now);
    this.drawMeter("cobalt", W - 50, state, now);
  }

  private drawKeep(team: TeamId, y: number, now: number, state: ClashState): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = team === "crimson" ? th.crimson : th.cobalt;
    const w = W - KEEP_MX * 2;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = col;
    rr(ctx, KEEP_MX, y, w, KEEP_H, 16);
    ctx.fill();
    // Subtle crenellation teeth on the field-facing edge.
    const toothY = team === "crimson" ? y + KEEP_H : y - 12;
    for (let i = 0; i < 10; i++) {
      const tx = KEEP_MX + 44 + i * ((w - 88) / 9) - 13;
      ctx.fillRect(tx, toothY, 26, 12);
    }
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = th.skyDeep;
    ctx.lineWidth = 2;
    rr(ctx, KEEP_MX, y, w, KEEP_H, 16);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Threatened-core pulse when the line is near a break.
    const threatened = (team === "cobalt" && this.dispP >= CLASH.CORE_BREAK_PCT - 8) || (team === "crimson" && this.dispP <= 100 - CLASH.CORE_BREAK_PCT + 8);
    if (threatened && state.phase === "war") {
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(now * 0.015);
      ctx.strokeStyle = th.line;
      ctx.lineWidth = 4;
      rr(ctx, KEEP_MX - 5, y - 5, w + 10, KEEP_H + 10, 20);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private pctChip(cx: number, cy: number, text: string, col: string): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = this.theme.skyDeep;
    rr(ctx, cx - 48, cy - 22, 96, 44, 22);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = F.chip;
    ctx.fillStyle = col;
    ctx.fillText(text, cx, cy + 1);
  }

  private drawMeter(team: TeamId, x: number, state: ClashState, now: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = team === "crimson" ? th.crimson : th.cobalt;
    const su = state.surge[team];
    const active = su.activeUntil > state.simClock;
    const top = FIELD_TOP + KEEP_H + 44;
    const bot = FIELD_BOT - KEEP_H - 44;
    const wpx = 20;

    ctx.globalAlpha = 0.6;
    ctx.fillStyle = th.skyDeep;
    rr(ctx, x, top, wpx, bot - top, 10);
    ctx.fill();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = th.ink;
    ctx.lineWidth = 2;
    rr(ctx, x, top, wpx, bot - top, 10);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const charge = active ? 100 : clamp01(su.charge / 100) * 100;
    const fillH = Math.max(0, (bot - top - 8) * (charge / 100));
    if (fillH > 2) {
      ctx.fillStyle = col;
      ctx.globalAlpha = active ? 0.75 + 0.25 * Math.sin(now * 0.02) : 0.85;
      rr(ctx, x + 4, bot - 4 - fillH, wpx - 8, fillH, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (active) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(now * 0.02);
      ctx.strokeStyle = col;
      ctx.lineWidth = 5;
      rr(ctx, x - 3, top - 3, wpx + 6, bot - top + 6, 13);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }

  /* ── Units ──────────────────────────────────────────────────────────── */

  private drawUnits(state: ClashState, now: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const surgeC = state.surge.crimson.activeUntil > state.simClock;
    const surgeB = state.surge.cobalt.activeUntil > state.simClock;

    for (const u of state.units) {
      const r = UNIT_R[u.kind];
      const x = lerp(FIELD_L + 34, FIELD_R - 34, u.x);
      const y = lerp(LINE_TOP, LINE_BOT, u.y) + Math.sin(now * 0.004 + u.id * 1.7) * 3;
      const col = u.team === "crimson" ? th.crimson : th.cobalt;
      const surging = u.team === "crimson" ? surgeC : surgeB;

      // Speed lines behind surging units (trail opposite the march direction).
      if (surging) {
        const trail = u.speed >= 0 ? -1 : 1;
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.55, y + trail * r);
        ctx.lineTo(x - r * 0.55, y + trail * (r + 26));
        ctx.moveTo(x + r * 0.55, y + trail * (r + 6));
        ctx.lineTo(x + r * 0.55, y + trail * (r + 34));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      this.disc(avatarImage(u.user, u.bot), x, y, r, col, 3);

      if ((u.kind === "champion" || u.kind === "hero") && u.user) {
        this.namePill(x, y - r - 28, this.trunc(u.user.name, 14), col);
      }
      if (u.bot) {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "#3A404C";
        rr(ctx, x - 27, y + r - 10, 54, 26, 13);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.font = F.badge;
        ctx.fillStyle = "#C9CDD4";
        ctx.fillText(LBL.bot, x, y + r + 4);
      }
    }
  }

  private disc(img: CanvasImageSource, x: number, y: number, r: number, ring: string, ringW: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r + ringW / 2, 0, TAU);
    ctx.strokeStyle = ring;
    ctx.lineWidth = ringW;
    ctx.stroke();
  }

  private namePill(cx: number, cy: number, text: string, accent: string, alpha = 1): void {
    const ctx = this.ctx;
    const w = this.textW(text, F.name) + 36;
    ctx.globalAlpha = 0.78 * alpha;
    ctx.fillStyle = this.theme.skyDeep;
    rr(ctx, cx - w / 2, cy - 22, w, 44, 22);
    ctx.fill();
    ctx.globalAlpha = 0.6 * alpha;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    rr(ctx, cx - w / 2, cy - 22, w, 44, 22);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.font = F.name;
    ctx.fillStyle = this.theme.ink;
    ctx.fillText(text, cx, cy + 1);
    ctx.globalAlpha = 1;
  }

  /* ── Top band ───────────────────────────────────────────────────────── */

  private drawTopBand(state: ClashState, now: number): void {
    const ctx = this.ctx;
    const th = this.theme;

    // Campaign score, team-colored.
    const sk = `${state.wins.crimson}:${state.wins.cobalt}:${th.id}`;
    if (sk !== this.scoreKey) {
      this.scoreKey = sk;
      this.scoreSegs = [
        { text: `${LBL.crimson} ${state.wins.crimson}`, c: th.crimson, w: 0 },
        { text: " — ", c: th.inkDim, w: 0 },
        { text: `${state.wins.cobalt} ${LBL.cobalt}`, c: th.cobalt, w: 0 },
      ];
      this.scoreW = 0;
      for (const seg of this.scoreSegs) {
        seg.w = this.textW(seg.text, F.score);
        this.scoreW += seg.w;
      }
    }
    ctx.font = F.score;
    ctx.textAlign = "left";
    let x = W / 2 - this.scoreW / 2;
    for (const seg of this.scoreSegs) {
      ctx.fillStyle = seg.c;
      ctx.fillText(seg.text, x, 58);
      x += seg.w;
    }
    ctx.textAlign = "center";

    // Phase line.
    const pk = `${state.phase}:${state.warNumber}`;
    if (pk !== this.phaseKey) {
      this.phaseKey = pk;
      if (state.phase === "war") this.phaseStr = `${LBL.war} ${state.warNumber} · ${LBL.firstTo} ${CLASH.WINS_TO_CAMPAIGN}`;
      else if (state.phase === "suddenDeath") this.phaseStr = `${LBL.suddenDeath} · ${LBL.suddenHint}`;
      else if (state.phase === "intermission") this.phaseStr = `${LBL.intermission} · ${LBL.war} ${state.warNumber + 1}`;
      else this.phaseStr = LBL.ceremony;
    }
    ctx.font = F.phase;
    ctx.fillStyle = state.phase === "suddenDeath" ? RED : th.inkDim;
    ctx.fillText(this.phaseStr, W / 2, 100);

    // The war clock — huge, always visible.
    const remain = Math.max(0, state.phaseEndsAt - state.simClock);
    const secs = Math.ceil(remain / 1000);
    if (secs !== this.clockSec) {
      this.clockSec = secs;
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      this.clockStr = `${m}:${s < 10 ? "0" : ""}${s}`;
    }
    const sudden = state.phase === "suddenDeath";
    const amber = state.phase === "war" && remain < 30000;
    ctx.save();
    if (sudden) {
      const pulse = 1 + 0.035 * Math.sin(now * 0.02);
      ctx.translate(W / 2, 174);
      ctx.scale(pulse, pulse);
      ctx.translate(-W / 2, -174);
    }
    ctx.font = F.clock;
    ctx.fillStyle = sudden ? RED : amber ? AMBER : th.ink;
    ctx.fillText(this.clockStr, W / 2, 174);
    ctx.restore();
  }

  /* ── Bottom band ────────────────────────────────────────────────────── */

  private drawBottomBand(state: ClashState, now: number, dt: number): void {
    const ctx = this.ctx;
    const th = this.theme;

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = th.ink;
    ctx.fillRect(KEEP_MX, 1584, W - KEEP_MX * 2, 2);
    ctx.globalAlpha = 1;

    // MVP row — live-reordering with eased slots.
    ctx.font = F.small;
    ctx.textAlign = "left";
    ctx.fillStyle = th.inkDim;
    ctx.fillText(LBL.warMvps, KEEP_MX, 1612);
    ctx.textAlign = "center";
    const list = state.warMvps;
    const nSlots = Math.min(5, list.length);
    if (nSlots > 0) {
      const spacing = 170;
      const startX = W / 2 - ((nSlots - 1) * spacing) / 2;
      if (this.mvpX.size > 24) this.mvpX.clear();
      for (let i = 0; i < nSlots; i++) {
        const m = list[i];
        const target = startX + i * spacing;
        let ax = this.mvpX.get(m.user.id);
        if (ax === undefined) ax = W + 120; // new entries glide in from the right
        ax += (target - ax) * Math.min(1, dt * 0.01);
        this.mvpX.set(m.user.id, ax);
        const col = m.team === "crimson" ? th.crimson : th.cobalt;
        this.disc(avatarImage(m.user), ax, 1682, 40, col, 3);
        ctx.beginPath();
        ctx.arc(ax - 32, 1650, 16, 0, TAU);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.font = F.rank;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(RANKS[i], ax - 32, 1651);
      }
    }

    // Ticker — the newest moment slides in.
    const top = state.ticker.length > 0 ? state.ticker[0] : null;
    if (top && top.id !== this.tkrId) {
      this.tkrPrev = this.tkrText;
      this.tkrText = top.text;
      this.tkrId = top.id;
      this.tkrT0 = now;
    }
    if (this.tkrText) {
      const tt = clamp01((now - this.tkrT0) / 380);
      const rise = eo(tt);
      if (this.tkrPrev && tt < 1) {
        ctx.globalAlpha = (1 - tt) * 0.7;
        ctx.font = F.body;
        ctx.fillStyle = th.inkDim;
        ctx.fillText(this.tkrPrev, W / 2, 1766 - rise * 30);
      }
      ctx.globalAlpha = 0.4 + 0.6 * tt;
      ctx.font = F.body;
      ctx.fillStyle = th.ink;
      ctx.fillText(this.tkrText, W / 2, 1766 + (1 - rise) * 30);
      ctx.globalAlpha = 1;
    }

    // Rotating signage — quiet, informational, never a CTA.
    if (S.signage.length > 0) {
      const idx = Math.floor(now / 8000) % S.signage.length;
      const local = (now % 8000) / 8000;
      const a = Math.min(1, local * 6, (1 - local) * 6);
      const text = S.signage[idx];
      const w = this.textW(text, F.small) + 52;
      ctx.globalAlpha = 0.45 * a;
      ctx.fillStyle = th.skyDeep;
      rr(ctx, W / 2 - w / 2, 1816, w, 46, 23);
      ctx.fill();
      ctx.globalAlpha = 0.1 * a;
      ctx.strokeStyle = th.ink;
      ctx.lineWidth = 2;
      rr(ctx, W / 2 - w / 2, 1816, w, 46, 23);
      ctx.stroke();
      ctx.globalAlpha = 0.9 * a;
      ctx.font = F.small;
      ctx.fillStyle = th.inkDim;
      ctx.fillText(text, W / 2, 1840);
      ctx.globalAlpha = 1;
    }

    // Connection dot + room handle, bottom-right.
    if (this.room !== this.roomKey) {
      this.roomKey = this.room;
      this.roomStr = this.room ? `@${this.room}` : "";
    }
    const dotCol = this.feed === "live" ? GREEN : this.feed === "connecting" ? AMBER : this.feed === "error" ? RED : th.inkDim;
    ctx.beginPath();
    ctx.arc(W - 44, 1890, 7, 0, TAU);
    ctx.fillStyle = dotCol;
    ctx.globalAlpha = this.feed === "live" ? 0.7 + 0.3 * Math.sin(now * 0.004) : 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (this.roomStr) {
      ctx.font = F.small;
      ctx.textAlign = "right";
      ctx.fillStyle = th.inkDim;
      ctx.globalAlpha = 0.8;
      ctx.fillText(this.roomStr, W - 62, 1891);
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
    }
  }

  /* ── Ceremony (sustained scene while phase === "ceremony") ──────────── */

  private drawCeremony(state: ClashState, now: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const winner = state.campaignWinner;
    if (!winner) return;
    const col = winner === "crimson" ? th.crimson : th.cobalt;

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = th.skyDeep;
    ctx.fillRect(FIELD_L - 40, FIELD_TOP + KEEP_H, FIELD_R - FIELD_L + 80, FIELD_BOT - FIELD_TOP - KEEP_H * 2);
    ctx.globalAlpha = 1;

    const ck = `${winner}:${th.id}`;
    if (ck !== this.ceremonyKey) {
      this.ceremonyKey = ck;
      this.ceremonyStr = `${teamLabel(winner)} — ${LBL.campaign}`;
    }
    ctx.font = F.banner;
    ctx.fillStyle = col;
    ctx.fillText(this.ceremonyStr, W / 2, 560);

    // Campaign MVP, crowned, center stage.
    const mvp = state.sessionMvps.length > 0 ? state.sessionMvps[0] : null;
    if (mvp) {
      const bob = Math.sin(now * 0.002) * 6;
      this.disc(avatarImage(mvp.user), W / 2, 820 + bob, 90, GOLD, 6);
      this.crown(W / 2, 706 + bob, 52);
      ctx.font = F.nameBig;
      ctx.fillStyle = th.ink;
      ctx.fillText(this.trunc(mvp.user.name, 14), W / 2, 970);
      ctx.font = F.small;
      ctx.fillStyle = th.inkDim;
      ctx.fillText(LBL.mvp, W / 2, 1012);
    }

    // Session top-5 podium row.
    const n = Math.min(5, state.sessionMvps.length);
    if (n > 0) {
      ctx.font = F.small;
      ctx.fillStyle = th.inkDim;
      ctx.fillText(LBL.sessionTop, W / 2, 1110);
      const spacing = 180;
      const startX = W / 2 - ((n - 1) * spacing) / 2;
      for (let i = 0; i < n; i++) {
        const m = state.sessionMvps[i];
        const x = startX + i * spacing;
        const y = 1210 + (i === 0 ? -22 : i * 8);
        const c = m.team === "crimson" ? th.crimson : th.cobalt;
        this.disc(avatarImage(m.user), x, y, i === 0 ? 48 : 40, c, 3);
        ctx.beginPath();
        ctx.arc(x - 34, y - 34, 15, 0, TAU);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.font = F.rank;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(RANKS[i], x - 34, y - 33);
      }
    }

    // Gentle celebratory drizzle (pooled).
    if (now - this.lastDrizzle > 140) {
      this.lastDrizzle = now;
      this.seedState = stepLcg(this.seedState);
      const rx = FIELD_L + (this.seedState / 4294967296) * (FIELD_R - FIELD_L);
      this.spawnPt(rx, FIELD_TOP + 80, (this.seedState % 120) - 60, 130, 90, 9, now, 2600, (this.seedState % 4) + 1, 1, 3);
    }
  }

  private crown(cx: number, cy: number, s: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy);
    ctx.lineTo(cx - s, cy - s * 0.72);
    ctx.lineTo(cx - s * 0.5, cy - s * 0.3);
    ctx.lineTo(cx, cy - s);
    ctx.lineTo(cx + s * 0.5, cy - s * 0.3);
    ctx.lineTo(cx + s, cy - s * 0.72);
    ctx.lineTo(cx + s, cy);
    ctx.closePath();
    ctx.fill();
  }

  /* ── Idle / attract overlay ─────────────────────────────────────────── */

  private drawIdle(now: number): void {
    const ctx = this.ctx;
    const th = this.theme;

    ctx.globalAlpha = 0.74;
    ctx.fillStyle = th.skyDeep;
    rr(ctx, 110, 660, W - 220, 700, 32);
    ctx.fill();
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = th.ink;
    ctx.lineWidth = 2;
    rr(ctx, 110, 660, W - 220, 700, 32);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const prompt = this.wrap(S.idlePrompt, F.idle, W - 320);
    let y = 748;
    ctx.font = F.idle;
    ctx.fillStyle = th.ink;
    for (const line of prompt) {
      ctx.fillText(line, W / 2, y);
      y += 54;
    }
    const hint = this.wrap(S.joinHint, F.body, W - 320);
    y += 10;
    ctx.font = F.body;
    ctx.fillStyle = th.inkDim;
    for (const line of hint) {
      ctx.fillText(line, W / 2, y);
      y += 38;
    }

    // Hall of Fame — cycles between all-time gifters and monuments.
    const hasG = this.hofG.length > 0;
    const hasM = this.hofM.length > 0;
    if (hasG || hasM) {
      const both = hasG && hasM;
      const local = (now % 6000) / 6000;
      const a = both ? Math.min(1, local * 5, (1 - local) * 5) : 1;
      const showG = !hasM || (hasG && Math.floor(now / 6000) % 2 === 0);
      const rows = showG ? this.hofG : this.hofM;
      const title = showG ? LBL.hallGifters : LBL.hallMonuments;

      ctx.globalAlpha = a;
      ctx.font = F.small;
      ctx.fillStyle = th.inkDim;
      ctx.fillText(title, W / 2, 1035);
      let ry = 1090;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        ctx.font = F.body;
        ctx.textAlign = "left";
        ctx.fillStyle = th.inkDim;
        ctx.fillText(RANKS[i], 240, ry);
        ctx.fillStyle = th.ink;
        ctx.fillText(this.trunc(row.name, 18), 296, ry);
        ctx.textAlign = "right";
        ctx.fillStyle = AMBER;
        ctx.fillText(row.coins, W - 240, ry);
        ctx.textAlign = "center";
        ry += 52;
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawSuddenBorder(now: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(now * 0.01);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 10;
    rr(ctx, 10, 10, W - 20, H - 20, 26);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ── Effect spawning ────────────────────────────────────────────────── */

  private nextSeed(): number {
    this.seedState = stepLcg(this.seedState);
    return this.seedState;
  }

  private alloc(now: number): Fx | null {
    let f: Fx | null = null;
    for (const e of this.fxPool) {
      if (!e.active) {
        f = e;
        break;
      }
    }
    if (!f) {
      // Overflow: recycle the oldest non-takeover effect.
      for (const e of this.fxPool) {
        if (e.kind === "takeover") continue;
        if (!f || e.t0 < f.t0) f = e;
      }
    }
    if (!f) return null;
    f.active = true;
    f.kind = "arrow";
    f.t0 = now;
    f.dur = 1000;
    f.team = "crimson";
    f.tier = 0;
    f.user = null;
    f.text = "";
    f.text2 = "";
    f.n = 0;
    f.lane = 0.5;
    f.seed = this.nextSeed();
    f.fired = false;
    f.fired2 = false;
    return f;
  }

  private spawnStrike(team: TeamId, tier: GiftTier, user: EvUser, combo: number, now: number): void {
    const lane = hash01(user.id);
    if (tier === 0) {
      if (combo >= 100) {
        const f = this.alloc(now);
        if (f) {
          f.kind = "thousand";
          f.dur = 2600;
          f.team = team;
          f.user = user;
          f.text2 = `${LBL.thousandArrows} — ${this.trunc(user.name, 14).toUpperCase()}`;
        }
        const g = this.alloc(now);
        if (g) {
          g.kind = "storm";
          g.dur = 1600;
          g.team = team;
        }
      } else if (combo >= 50) {
        const f = this.alloc(now);
        if (f) {
          f.kind = "storm";
          f.dur = 1200;
          f.team = team;
        }
      } else if (combo >= 10) {
        const f = this.alloc(now);
        if (f) {
          f.kind = "volley";
          f.dur = 1500;
          f.team = team;
          f.user = user;
          f.lane = lane;
          f.n = Math.min(12, 3 + Math.floor(combo / 8));
        }
      } else {
        const f = this.alloc(now);
        if (f) {
          f.kind = "arrow";
          f.dur = 950;
          f.team = team;
          f.user = user;
          f.lane = lane;
        }
      }
    } else if (tier === 1) {
      const f = this.alloc(now);
      if (f) {
        f.kind = "champion";
        f.dur = 2000;
        f.team = team;
        f.tier = 1;
        f.user = user;
        f.lane = lane;
        f.text = `${this.trunc(user.name, 14)} · ${TIER_LABEL[1].toUpperCase()}`;
      }
    } else if (tier === 2) {
      const f = this.alloc(now);
      if (f) {
        f.kind = "siege";
        f.dur = 3200;
        f.team = team;
        f.tier = 2;
        f.user = user;
        f.lane = lane;
        f.text = `${this.trunc(user.name, 14)} · ${TIER_LABEL[2].toUpperCase()}`;
      }
    } else if (tier === 3) {
      const f = this.alloc(now);
      if (f) {
        f.kind = "heroDrop";
        f.dur = 4200;
        f.team = team;
        f.tier = 3;
        f.user = user;
        f.lane = lane;
        f.text = this.trunc(user.name, 14);
        f.text2 = TIER_LABEL[3].toUpperCase();
      }
    }
    // tier 4 arrives as its own "takeover" SimEvent and is queued there.
  }

  private spawnChip(text: string, team: TeamId, now: number): void {
    const f = this.alloc(now);
    if (!f) return;
    f.kind = "chip";
    f.dur = 2800;
    f.team = team;
    f.text = text;
    f.n = 430 + this.chipLane * 76;
    this.chipLane = (this.chipLane + 1) % 3;
  }

  private shake(now: number, dur: number, amp: number): void {
    this.shakeT0 = now;
    this.shakeDur = dur;
    this.shakeAmp = amp;
  }

  /* ── Effect drawing ─────────────────────────────────────────────────── */

  private drawEffects(now: number, layer: 0 | 1): void {
    for (const f of this.fxPool) {
      if (!f.active) continue;
      const t = (now - f.t0) / f.dur;
      if (t >= 1) {
        f.active = false;
        if (f === this.tkActive) this.tkActive = null;
        continue;
      }
      if (FX_LAYER[f.kind] !== layer) continue;
      switch (f.kind) {
        case "arrow":
          this.fxArrow(f, t, now, 0, f.lane, 1);
          break;
        case "volley":
          this.fxVolley(f, t, now);
          break;
        case "storm":
          this.fxStorm(f, t);
          break;
        case "thousand":
          this.fxThousand(f, t);
          break;
        case "champion":
          this.fxChampion(f, t);
          break;
        case "siege":
          this.fxSiege(f, t, now);
          break;
        case "heroDrop":
          this.fxHeroDrop(f, t, now);
          break;
        case "takeover":
          this.fxTakeover(f, t, now);
          break;
        case "chip":
          this.fxChip(f, t);
          break;
        case "linePulse":
          this.fxLinePulse(f, t);
          break;
        case "coreBreak":
          this.fxCoreBreak(f, t);
          break;
        case "warEnd":
          this.fxWarEnd(f, t);
          break;
        case "suddenIn":
          this.fxSuddenIn(f, t, now);
          break;
        case "ceremonyIn":
          this.fxCeremonyIn(f, t, now);
          break;
        case "warStart":
          this.fxWarStart(f, t);
          break;
        case "firstHuman":
          this.fxFirstHuman(f, t);
          break;
      }
    }
  }

  /** One avatar-headed arrow lobbed from the keep to the front line. */
  private fxArrow(f: Fx, t: number, now: number, seedOff: number, lane: number, alpha: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = f.team === "crimson" ? th.crimson : th.cobalt;
    const lineY = this.lineY();
    const startY = f.team === "crimson" ? FIELD_TOP + KEEP_H + 10 : FIELD_BOT - KEEP_H - 10;
    let rs = stepLcg(f.seed + seedOff);
    const bow = ((rs / 4294967296) * 2 - 1) * 130;
    rs = stepLcg(rs);
    const drift = ((rs / 4294967296) * 2 - 1) * 70;
    const sx = lerp(FIELD_L + 60, FIELD_R - 60, lane);
    const exd = Math.min(FIELD_R - 60, Math.max(FIELD_L + 60, sx + drift));
    const cx = (sx + exd) / 2 + bow;
    const cy = (startY + lineY) / 2;
    const p = eio(t);

    // Trail (additive).
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = col;
    ctx.beginPath();
    const back = Math.max(0, p - 0.26);
    for (let i = 0; i <= 8; i++) {
      const u = lerp(back, p, i / 8);
      const qx = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cx + u * u * exd;
      const qy = (1 - u) * (1 - u) * startY + 2 * (1 - u) * u * cy + u * u * lineY;
      if (i === 0) ctx.moveTo(qx, qy);
      else ctx.lineTo(qx, qy);
    }
    ctx.globalAlpha = 0.55 * alpha;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;

    // Avatar head at the tip.
    const hx = (1 - p) * (1 - p) * sx + 2 * (1 - p) * p * cx + p * p * exd;
    const hy = (1 - p) * (1 - p) * startY + 2 * (1 - p) * p * cy + p * p * lineY;
    this.disc(avatarImage(f.user ?? undefined), hx, hy, 16, col, 2);
    ctx.globalAlpha = 1;

    if (f.kind === "arrow" && !f.fired && t > 0.92) {
      f.fired = true;
      this.burst(exd, lineY, 6, f.team === "crimson" ? 1 : 2, 190, 6, now);
    }
  }

  /** Parallel arrows with flame trails (tier-0 combo ≥ 10). */
  private fxVolley(f: Fx, t: number, now: number): void {
    const ctx = this.ctx;
    const n = Math.max(3, f.n);
    const e = t * f.dur;
    for (let i = 0; i < n; i++) {
      const li = clamp01((e - i * 55) / (f.dur - n * 55));
      if (li <= 0 || li >= 1) continue;
      const lane = clamp01(f.lane + (i - (n - 1) / 2) * 0.055);
      this.fxArrow(f, li, now, i * 7 + 1, lane, 0.85);
      // Flame speck at each tip.
      const dot = this.dots[3];
      if (dot) {
        const lineY = this.lineY();
        const startY = f.team === "crimson" ? FIELD_TOP + KEEP_H + 10 : FIELD_BOT - KEEP_H - 10;
        const x = lerp(FIELD_L + 60, FIELD_R - 60, lane);
        const y = lerp(startY, lineY, eio(li));
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.5;
        ctx.drawImage(dot, x - 14, y - 14, 28, 28);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
    }
    if (!f.fired && t > 0.85) {
      f.fired = true;
      const lineY = this.lineY();
      const ci = f.team === "crimson" ? 1 : 2;
      for (let i = 0; i < 5; i++) {
        this.burst(lerp(FIELD_L + 80, FIELD_R - 80, clamp01(f.lane + (i - 2) * 0.08)), lineY, 4, ci, 170, 5, now);
      }
    }
  }

  /** Screen-width arrow rain + horn flash (tier-0 combo ≥ 50). */
  private fxStorm(f: Fx, t: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = f.team === "crimson" ? th.crimson : th.cobalt;
    const lineY = this.lineY();
    const fromTop = f.team === "crimson";
    const startY = fromTop ? FIELD_TOP + KEEP_H + 20 : FIELD_BOT - KEEP_H - 20;

    if (t < 0.16) {
      ctx.globalAlpha = (1 - t / 0.16) * 0.28;
      ctx.fillStyle = th.line;
      ctx.fillRect(FIELD_L - 40, FIELD_TOP, FIELD_R - FIELD_L + 80, FIELD_BOT - FIELD_TOP);
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    let rs = f.seed;
    for (let i = 0; i < 44; i++) {
      rs = stepLcg(rs);
      const x = FIELD_L + (rs / 4294967296) * (FIELD_R - FIELD_L);
      rs = stepLcg(rs);
      const phase = rs / 4294967296;
      const prog = (t * 2.2 + phase) % 1;
      const y = lerp(startY, lineY, prog);
      const len = 84 * (fromTop ? 1 : -1);
      ctx.globalAlpha = 0.5 * (1 - prog * 0.4);
      ctx.beginPath();
      ctx.moveTo(x, y - len);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  /** Sky darkens; the sender's name written across the top of the field. */
  private fxThousand(f: Fx, t: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = f.team === "crimson" ? th.crimson : th.cobalt;
    const env = Math.min(1, t * 5, (1 - t) * 4);
    ctx.globalAlpha = 0.45 * env;
    ctx.fillStyle = th.skyDeep;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = env;
    ctx.save();
    const sc = 0.9 + 0.1 * eb(clamp01(t * 4));
    ctx.translate(W / 2, 460);
    ctx.scale(sc, sc);
    ctx.font = F.banner;
    ctx.shadowColor = col;
    ctx.shadowBlur = 30 * env;
    ctx.fillStyle = col;
    ctx.fillText(f.text2, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Tier 1 — champion lands: shockwave rings + name banner. */
  private fxChampion(f: Fx, t: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = f.team === "crimson" ? th.crimson : th.cobalt;
    const lineY = this.lineY();
    const x = lerp(FIELD_L + 80, FIELD_R - 80, f.lane);
    const side = f.team === "crimson" ? -1 : 1;
    const y = lineY + side * 64;

    if (!f.fired) {
      f.fired = true;
      this.burst(x, y, 10, f.team === "crimson" ? 1 : 2, 230, 6, f.t0);
    }
    const r1 = eo(t) * 170;
    ctx.strokeStyle = col;
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.lineWidth = 8 * (1 - t) + 2;
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, TAU);
    ctx.stroke();
    const t2 = clamp01(t * 1.5 - 0.25);
    if (t2 > 0 && t2 < 1) {
      const r2 = eo(t2) * 118;
      ctx.globalAlpha = (1 - t2) * 0.6;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, r2, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const pop = eb(clamp01(t * 3.2));
    this.disc(avatarImage(f.user ?? undefined), x, y, 32 * pop, col, 3);
    this.namePill(x, y - 96, f.text, col, Math.min(1, t * 4, (1 - t) * 4));
  }

  /** Tier 2 — siege engine rolls in, fires one heavy bolt (slow-mo ease). */
  private fxSiege(f: Fx, t: number, now: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = f.team === "crimson" ? th.crimson : th.cobalt;
    const lineY = this.lineY();
    const side = (f.seed & 1) === 0 ? -1 : 1;
    const y = lineY + (f.team === "crimson" ? -130 : 130);
    const targetX = lerp(FIELD_L + 150, FIELD_R - 150, f.lane);
    const enter = eo(clamp01(t / 0.32));
    const x = lerp(side < 0 ? -190 : W + 190, targetX, enter);
    const env = Math.min(1, t * 8, (1 - t) * 5);

    // Slow-mo dim around the shot.
    if (t > 0.4 && t < 0.68) {
      ctx.globalAlpha = 0.16 * Math.min(1, (t - 0.4) * 12, (0.68 - t) * 12);
      ctx.fillStyle = th.skyDeep;
      ctx.fillRect(FIELD_L - 40, FIELD_TOP, FIELD_R - FIELD_L + 80, FIELD_BOT - FIELD_TOP);
      ctx.globalAlpha = 1;
    }

    const shotT = clamp01((t - 0.46) / 0.12); // ~380ms bolt, heavily eased
    const recoil = shotT > 0 && shotT < 1 ? Math.sin(shotT * Math.PI) * 8 * -side : 0;

    // Engine silhouette: body + wheels + arm.
    ctx.globalAlpha = env;
    ctx.fillStyle = "#161922";
    rr(ctx, x - 70 + recoil, y - 34, 140, 60, 14);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    rr(ctx, x - 70 + recoil, y - 34, 140, 60, 14);
    ctx.stroke();
    ctx.fillStyle = "#0E1016";
    ctx.beginPath();
    ctx.arc(x - 42 + recoil, y + 30, 20, 0, TAU);
    ctx.arc(x + 42 + recoil, y + 30, 20, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x - 42 + recoil, y + 30, 20, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 42 + recoil, y + 30, 20, 0, TAU);
    ctx.stroke();
    // Arm angled toward the line.
    const armDir = f.team === "crimson" ? 1 : -1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + recoil, y - 30);
    ctx.lineTo(x + recoil, y - 30 + armDir * 44);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // The heavy bolt.
    if (shotT > 0) {
      const bp = eio(shotT);
      const tail = lerp(y, lineY, Math.max(0, bp - 0.3));
      const head = lerp(y, lineY, bp);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = col;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(x, tail);
      ctx.lineTo(x, head);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (!f.fired && shotT >= 1) {
        f.fired = true;
        this.burst(x, lineY, 16, f.team === "crimson" ? 1 : 2, 300, 7, now);
        this.shake(now, 260, 2);
      }
    }

    this.namePill(Math.min(W - 160, Math.max(160, x)), y - 92, f.text, col, env);
  }

  /** Tier 3 — HERO DROP: vignette, giant disc descends, impact + lights. */
  private fxHeroDrop(f: Fx, t: number, now: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = f.team === "crimson" ? th.crimson : th.cobalt;
    const env = Math.min(1, t * 6, (1 - t) * 3);

    if (this.vignette) {
      ctx.globalAlpha = 0.68 * env;
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    const dropT = clamp01(t / 0.32);
    const y = lerp(140, 930, ei(dropT));
    if (!f.fired && dropT >= 1) {
      f.fired = true;
      this.shake(now, 420, 3);
      this.burst(W / 2, 960, 26, f.team === "crimson" ? 1 : 2, 380, 8, now);
      this.burst(W / 2, 960, 12, 0, 260, 5, now);
    }
    const rt = clamp01((t - 0.32) / 0.5);
    if (rt > 0 && rt < 1) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = (1 - rt) * 0.85;
      ctx.lineWidth = 12 * (1 - rt) + 2;
      ctx.beginPath();
      ctx.arc(W / 2, 950, eo(rt) * 320, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Settle: a tiny overshoot after impact.
    const settle = dropT >= 1 ? 1 + 0.04 * (1 - eo(clamp01((t - 0.32) / 0.2))) : 1;
    this.disc(avatarImage(f.user ?? undefined), W / 2, y, 100 * settle, col, 6);

    if (t > 0.38) {
      const a = env * (0.85 + 0.15 * Math.sin(now * 0.02));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = F.small;
      ctx.fillStyle = th.inkDim;
      ctx.fillText(f.text2, W / 2, 1082);
      ctx.font = F.nameBig;
      ctx.shadowColor = col;
      ctx.shadowBlur = 34;
      ctx.fillStyle = th.ink;
      ctx.fillText(f.text, W / 2, 1140);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  /** Tier 4 — TAKEOVER: 8s scripted, queued FIFO, full-field. */
  private fxTakeover(f: Fx, t: number, now: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = f.team === "crimson" ? th.crimson : th.cobalt;
    const env = Math.min(1, t * 10, (1 - t) * 8);

    ctx.globalAlpha = 0.8 * env;
    ctx.fillStyle = th.skyDeep;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // Radiating beams.
    const beam = f.team === "crimson" ? this.beamCrimson : this.beamCobalt;
    if (beam && t > 0.04 && t < 0.86) {
      const ba = 0.4 * Math.min(1, (t - 0.04) * 8, (0.86 - t) * 8);
      ctx.save();
      ctx.translate(W / 2, 810);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = ba;
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate(now * 0.0005 + (i * TAU) / 8);
        ctx.drawImage(beam, -80, -900);
        ctx.restore();
      }
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    // The sender, monumental.
    const as = eb(clamp01((t - 0.05) / 0.12));
    if (as > 0.01) this.disc(avatarImage(f.user ?? undefined), W / 2, 800, 180 * as, col, 8);

    if (t > 0.14) {
      const ta = Math.min(1, (t - 0.14) * 8) * env;
      ctx.save();
      ctx.globalAlpha = ta;
      ctx.font = F.huge;
      ctx.shadowColor = col;
      ctx.shadowBlur = 40;
      ctx.fillStyle = th.ink;
      ctx.fillText(f.text, W / 2, 1130);
      ctx.shadowBlur = 0;
      ctx.font = F.coins;
      ctx.fillStyle = GOLD;
      ctx.fillText(f.text2, W / 2, 1240);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (!f.fired && t > 0.16) {
      f.fired = true;
      this.confetti(W / 2, 740, 64, now);
    }
    if (!f.fired2 && t > 0.42) {
      f.fired2 = true;
      this.confetti(W / 2, 690, 64, now);
    }

    // Finale: a fast surge of light along the front line.
    if (t > 0.82) {
      const ft = clamp01((t - 0.82) / 0.18);
      const lineY = this.lineY();
      const x = lerp(FIELD_L, FIELD_R, eio(ft));
      const dot = this.dots[f.team === "crimson" ? 1 : 2];
      if (dot) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.9 * (1 - ft * 0.5);
        ctx.drawImage(dot, x - 90, lineY - 90, 180, 180);
        ctx.globalAlpha = 0.5 * (1 - ft);
        ctx.fillStyle = th.line;
        ctx.fillRect(FIELD_L - 14, lineY - 5, FIELD_R - FIELD_L + 28, 10);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
    }
  }

  /** Small side banner chips (welcome / reinforce / surge / comeback). */
  private fxChip(f: Fx, t: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = f.team === "crimson" ? th.crimson : th.cobalt;
    const inA = eo(clamp01(t / 0.18));
    const outA = ei(clamp01((t - 0.82) / 0.18));
    const alpha = inA * (1 - outA);
    if (alpha <= 0.01) return;
    const w = this.textW(f.text, F.chip) + 64;
    const y = f.n;
    const fromLeft = f.team === "crimson";
    const off = (1 - inA + outA) * (w + 90);
    const x = fromLeft ? 56 - off : W - 56 - w + off;

    ctx.globalAlpha = 0.85 * alpha;
    ctx.fillStyle = th.skyDeep;
    rr(ctx, x, y, w, 52, 26);
    ctx.fill();
    ctx.fillStyle = col;
    rr(ctx, fromLeft ? x : x + w - 8, y + 8, 8, 36, 4);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.font = F.chip;
    ctx.fillStyle = th.ink;
    ctx.fillText(f.text, x + w / 2 + (fromLeft ? 4 : -4), y + 27);
    ctx.globalAlpha = 1;
  }

  /** Bright pulse traveling along the front line after a push. */
  private fxLinePulse(f: Fx, t: number): void {
    const ctx = this.ctx;
    const lineY = this.lineY();
    const fromLeft = f.team === "crimson";
    const x = lerp(fromLeft ? FIELD_L : FIELD_R, fromLeft ? FIELD_R : FIELD_L, eo(t));
    const dot = this.dots[f.team === "crimson" ? 1 : 2];
    if (!dot) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.75 * (1 - t);
    ctx.drawImage(dot, x - 60, lineY - 60, 120, 120);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  /** Core break — white-out crack at the broken keep. */
  private fxCoreBreak(f: Fx, t: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const keepCY = f.team === "crimson" ? FIELD_TOP + KEEP_H / 2 : FIELD_BOT - KEEP_H / 2;
    const fade = 1 - t;

    ctx.globalAlpha = fade * 0.8;
    ctx.fillStyle = th.line;
    ctx.fillRect(KEEP_MX - 20, keepCY - KEEP_H, W - KEEP_MX * 2 + 40, KEEP_H * 2);
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = th.line;
    ctx.globalAlpha = fade;
    let rs = f.seed;
    const dir = f.team === "crimson" ? 1 : -1;
    for (let c = 0; c < 7; c++) {
      rs = stepLcg(rs);
      let cx = KEEP_MX + 80 + (rs / 4294967296) * (W - KEEP_MX * 2 - 160);
      let cy = keepCY;
      ctx.lineWidth = fade * 6 + 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let sgm = 0; sgm < 5; sgm++) {
        rs = stepLcg(rs);
        cx += ((rs / 4294967296) * 2 - 1) * 70;
        rs = stepLcg(rs);
        cy += dir * (30 + (rs / 4294967296) * 55) * eo(t + 0.2);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  /** War end — banner + MVP spotlight. */
  private fxWarEnd(f: Fx, t: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = f.n === 1 ? (f.team === "crimson" ? th.crimson : th.cobalt) : th.ink;
    const inA = eb(clamp01(t / 0.15));
    const alpha = Math.min(1, t * 8, (1 - t) * 5);

    ctx.globalAlpha = 0.4 * alpha;
    ctx.fillStyle = th.skyDeep;
    ctx.fillRect(0, FIELD_TOP, W, FIELD_BOT - FIELD_TOP);
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(W / 2, 860);
    ctx.scale(inA, inA);
    ctx.globalAlpha = alpha;
    ctx.font = F.banner;
    ctx.fillStyle = col;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (f.user) {
      ctx.globalAlpha = alpha;
      this.disc(avatarImage(f.user), W / 2, 1010, 56, GOLD, 4);
      ctx.font = F.name;
      ctx.fillStyle = th.ink;
      ctx.fillText(`${LBL.mvp} — ${f.text2}`, W / 2, 1108);
      ctx.globalAlpha = 1;
    }
  }

  private fxSuddenIn(f: Fx, t: number, now: number): void {
    const ctx = this.ctx;
    const alpha = Math.min(1, t * 8, (1 - t) * 4) * (0.8 + 0.2 * Math.sin(now * 0.02));
    ctx.save();
    ctx.globalAlpha = alpha;
    const sc = eb(clamp01(t * 5));
    ctx.translate(W / 2, 880);
    ctx.scale(sc, sc);
    ctx.font = F.banner;
    ctx.shadowColor = RED;
    ctx.shadowBlur = 34;
    ctx.fillStyle = RED;
    ctx.fillText(LBL.suddenDeath, 0, 0);
    ctx.shadowBlur = 0;
    ctx.font = F.name;
    ctx.fillStyle = this.theme.ink;
    ctx.fillText(LBL.suddenHint, 0, 72);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Campaign end intro — the winning color floods, confetti. */
  private fxCeremonyIn(f: Fx, t: number, now: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const col = f.team === "crimson" ? th.crimson : th.cobalt;
    ctx.globalAlpha = 0.32 * Math.min(1, t * 4, (1 - t) * 1.6);
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    if (!f.fired && t > 0.08) {
      f.fired = true;
      this.confetti(W / 2, 620, 80, now);
    }
    if (!f.fired2 && t > 0.4) {
      f.fired2 = true;
      this.confetti(W / 2, 520, 80, now);
    }
  }

  private fxWarStart(f: Fx, t: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const alpha = Math.min(1, t * 8, (1 - t) * 5);
    const sc = eb(clamp01(t * 4));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, 880);
    ctx.scale(sc, sc);
    ctx.font = F.huge;
    ctx.fillStyle = th.ink;
    ctx.fillText(f.text, 0, 0);
    ctx.font = F.name;
    ctx.fillStyle = th.inkDim;
    ctx.fillText(f.text2, 0, 84);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private fxFirstHuman(f: Fx, t: number): void {
    const ctx = this.ctx;
    const th = this.theme;
    const alpha = Math.min(1, t * 6, (1 - t) * 4);
    const sc = eb(clamp01(t * 4));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, 700);
    ctx.scale(sc, sc);
    this.disc(avatarImage(f.user ?? undefined), 0, -80, 44, GOLD, 4);
    ctx.font = F.nameBig;
    ctx.fillStyle = th.ink;
    ctx.fillText(LBL.challenger, 0, 20);
    ctx.font = F.name;
    ctx.fillStyle = th.inkDim;
    ctx.fillText(f.text, 0, 72);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ── Particles ──────────────────────────────────────────────────────── */

  private spawnPt(x: number, y: number, vx: number, vy: number, g: number, size: number, now: number, life: number, ci: number, shape: 0 | 1, vr: number): void {
    for (const p of this.ptPool) {
      if (p.active) continue;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.g = g;
      p.rot = 0;
      p.vr = vr;
      p.size = size;
      p.t0 = now;
      p.life = life;
      p.ci = ci;
      p.shape = shape;
      return;
    }
  }

  private burst(x: number, y: number, n: number, ci: number, speed: number, size: number, now: number): void {
    let rs = this.nextSeed();
    for (let i = 0; i < n; i++) {
      rs = stepLcg(rs);
      const a = (i / n) * TAU + (rs / 4294967296) * 0.8;
      rs = stepLcg(rs);
      const sp = speed * (0.5 + (rs / 4294967296) * 0.6);
      this.spawnPt(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 60, size, now, 550 + (rs % 350), ci, 0, 0);
    }
  }

  private confetti(x: number, y: number, n: number, now: number): void {
    let rs = this.nextSeed();
    for (let i = 0; i < n; i++) {
      rs = stepLcg(rs);
      const a = -Math.PI / 2 + ((rs / 4294967296) * 2 - 1) * 1.1;
      rs = stepLcg(rs);
      const sp = 380 + (rs / 4294967296) * 480;
      rs = stepLcg(rs);
      const vr = ((rs / 4294967296) * 2 - 1) * 10;
      this.spawnPt(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 900, 8 + (rs % 8), now, 1500 + (rs % 900), 1 + (i % 4), 1, vr);
    }
  }

  private drawParticles(now: number, dt: number): void {
    const ctx = this.ctx;
    const ds = dt / 1000;
    for (const p of this.ptPool) {
      if (!p.active) continue;
      const a = (now - p.t0) / p.life;
      if (a >= 1) {
        p.active = false;
        continue;
      }
      p.x += p.vx * ds;
      p.y += p.vy * ds;
      p.vy += p.g * ds;
      p.rot += p.vr * ds;
      const alpha = 1 - a;
      if (p.shape === 0) {
        const dot = this.dots[p.ci];
        if (!dot) continue;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * 0.9;
        ctx.drawImage(dot, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        ctx.globalCompositeOperation = "source-over";
      } else {
        const col = this.pcolors[p.ci];
        if (!col) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = col;
        ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ── Cached text helpers ────────────────────────────────────────────── */

  private textW(text: string, font: string): number {
    const key = `${font}|${text}`;
    let w = this.widthCache.get(key);
    if (w === undefined) {
      if (this.widthCache.size > 700) this.widthCache.clear();
      this.ctx.font = font;
      w = this.ctx.measureText(text).width;
      this.widthCache.set(key, w);
    }
    return w;
  }

  private trunc(name: string, max: number): string {
    const key = `${max}|${name}`;
    let v = this.truncCache.get(key);
    if (v === undefined) {
      if (this.truncCache.size > 500) this.truncCache.clear();
      v = name.length <= max ? name : `${name.slice(0, max - 1)}…`;
      this.truncCache.set(key, v);
    }
    return v;
  }

  private wrap(text: string, font: string, maxW: number): string[] {
    const key = `${font}|${maxW}|${text}`;
    let lines = this.wrapCache.get(key);
    if (lines === undefined) {
      if (this.wrapCache.size > 60) this.wrapCache.clear();
      lines = [];
      const words = text.split(" ");
      let cur = "";
      for (const word of words) {
        const probe = cur ? `${cur} ${word}` : word;
        if (cur && this.textW(probe, font) > maxW) {
          lines.push(cur);
          cur = word;
        } else {
          cur = probe;
        }
      }
      if (cur) lines.push(cur);
      this.wrapCache.set(key, lines);
    }
    return lines;
  }
}

/* ── Module-level helpers + sprite factories ────────────────────────────── */

const RANKS = ["1", "2", "3", "4", "5"];
const DASH_MERIDIAN = [4, 14];
const DASH_NONE: number[] = [];

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

/** 64×64 soft additive dot. */
function makeDot(color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, hexA(color, 0.9));
    grad.addColorStop(0.35, hexA(color, 0.45));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return c;
}

/** 16×96 vertical glow band, stretched wide under the front line. */
function makeGlow(color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 96;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 96);
    grad.addColorStop(0, hexA(color, 0));
    grad.addColorStop(0.5, hexA(color, 0.55));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 96);
  }
  return c;
}

/** 160×900 tapering light beam (drawn rotated around the takeover center). */
function makeBeam(color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 900;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 900, 0, 0);
    grad.addColorStop(0, hexA(color, 0.55));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(80, 900);
    g.lineTo(0, 0);
    g.lineTo(160, 0);
    g.closePath();
    g.fill();
  }
  return c;
}
