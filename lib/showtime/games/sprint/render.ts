"use client";

/**
 * BEACH RACE — the renderer. Bright, clean, summery, instantly legible.
 *
 * Design goals (the reason this game exists): a scroller understands the whole thing
 * in under two seconds — a sunny beach, faces racing down a sand track toward the
 * sea, a huge countdown, a podium. Flat shapes, chunky rounded corners, dark ink
 * text on white cards, sky/sun/sand/sea palette. NEVER dark, NEVER cluttered.
 *
 * Rendering contract: Canvas2D, 1080×1920 design space scaled to COVER the canvas
 * (full-bleed, no letterbox), DPR-capped at 2, pooled effects/particles with hard
 * caps, pre-rendered sky + sand layers per theme/resize, safe at 60fps for 24h.
 */
import { avatarImage } from "@/lib/showtime/avatars";
import type { EvUser, FeedStatus, GifterRow, MonumentRow, Racer, SimEvent, SprintState } from "@/lib/showtime/types";
import { SPRINT, THEMES, themeById, type SprintTheme } from "./config";
import { S } from "./strings";

const W = 1080;
const H = 1920;
const TRACK_TOP = 470; // start line
const TRACK_BOTTOM = 1500; // finish line
const FX_CAP = 200;
const PARTICLE_CAP = 600;

type Fx = {
  kind:
    | "puff"
    | "chip"
    | "heart"
    | "burst"
    | "plane"
    | "stamp"
    | "wavesweep"
    | "splash"
    | "placestamp"
    | "photoflash"
    | "go"
    | "parade"
    | "hatdrop"
    | "beachball"
    | "herocard";
  t0: number;
  dur: number;
  x: number;
  y: number;
  text?: string;
  userId?: string;
  user?: EvUser;
  tier?: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  age: number;
  life: number;
  size: number;
  color: string;
  kind: "dot" | "rect" | "spark";
};

const PLACE_WORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];

export class SprintRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private theme: SprintTheme = THEMES[0];
  private dpr = 1;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private skyLayer: HTMLCanvasElement | null = null;
  private sandLayer: HTMLCanvasElement | null = null;
  private fx: Fx[] = [];
  private particles: Particle[] = [];
  private allTime: GifterRow[] = [];
  private monuments: MonumentRow[] = [];
  private conn: { feed: FeedStatus; room: string } = { feed: "idle", room: "" };
  private lastNow = 0;
  private lastTickerId = -1;
  private tickerShownAt = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }

  dispose(): void {
    this.disposed = true;
    this.fx.length = 0;
    this.particles.length = 0;
  }

  setTheme(id: string): void {
    this.theme = themeById(id);
    this.prerender();
  }

  setAllTime(g: GifterRow[], m: MonumentRow[]): void {
    this.allTime = g.slice(0, 5);
    this.monuments = m.slice(0, 5);
  }

  setConnection(feed: FeedStatus, room: string): void {
    this.conn = { feed, room };
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(2, Math.round((r.width || 540) * this.dpr));
    this.canvas.height = Math.max(2, Math.round((r.height || 960) * this.dpr));
    // contain: the full 1080×1920 stage is ALWAYS visible (nothing ever cropped in a
    // capture window); any letterbox bands are painted sky-colored so they blend in
    this.scale = Math.min(this.canvas.width / W, this.canvas.height / H);
    this.ox = (this.canvas.width - W * this.scale) / 2;
    this.oy = (this.canvas.height - H * this.scale) / 2;
    this.prerender();
  }

  /* ── pre-rendered layers (sky gradient, sand + lanes) ─────────────────── */

  private prerender() {
    const t = this.theme;
    const sky = document.createElement("canvas");
    sky.width = W;
    sky.height = H;
    const sc = sky.getContext("2d")!;
    const g = sc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.skyTop);
    g.addColorStop(1, t.skyBottom);
    sc.fillStyle = g;
    sc.fillRect(0, 0, W, H);
    this.skyLayer = sky;

    const sand = document.createElement("canvas");
    sand.width = W;
    sand.height = TRACK_BOTTOM + 40 - 430;
    const x = sand.getContext("2d")!;
    x.fillStyle = t.sand;
    x.fillRect(0, 0, W, sand.height);
    // edge bands
    x.fillStyle = t.sandDark;
    x.globalAlpha = 0.55;
    x.fillRect(0, 0, 84, sand.height);
    x.fillRect(W - 84, 0, 84, sand.height);
    x.globalAlpha = 1;
    // deterministic speckle texture
    let s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
    x.fillStyle = t.sandDark;
    for (let i = 0; i < 520; i++) {
      const px = 90 + rnd() * (W - 180);
      const py = rnd() * sand.height;
      x.globalAlpha = 0.25 + rnd() * 0.3;
      x.beginPath();
      x.arc(px, py, 1.6 + rnd() * 2.4, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;
    // lane separators (dashed)
    x.strokeStyle = t.laneLine;
    x.globalAlpha = 0.5;
    x.lineWidth = 4;
    x.setLineDash([26, 30]);
    for (let i = 0; i <= SPRINT.GRID_MAX; i++) {
      const lx = this.laneX(i) - this.laneGap() / 2;
      if (lx < 100 || lx > W - 100) continue;
      x.beginPath();
      x.moveTo(lx, 30);
      x.lineTo(lx, sand.height - 10);
      x.stroke();
    }
    x.setLineDash([]);
    x.globalAlpha = 1;
    // start line
    x.strokeStyle = t.laneLine;
    x.globalAlpha = 0.9;
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(90, TRACK_TOP - 430);
    x.lineTo(W - 90, TRACK_TOP - 430);
    x.stroke();
    x.globalAlpha = 1;
    this.sandLayer = sand;
  }

  private laneGap(): number {
    return 880 / SPRINT.GRID_MAX;
  }

  private laneX(i: number): number {
    return 100 + this.laneGap() * (i + 0.5);
  }

  private racerY(progress: number): number {
    return TRACK_TOP + progress * (TRACK_BOTTOM - TRACK_TOP - 26);
  }

  /* ── sim events → effects ─────────────────────────────────────────────── */

  onSimEvents(evs: SimEvent[]): void {
    const now = this.lastNow || performance.now();
    const push = (f: Fx) => {
      if (this.fx.length >= FX_CAP) this.fx.shift();
      this.fx.push(f);
    };
    for (const e of evs) {
      switch (e.kind) {
        case "join":
          push({ kind: "puff", t0: now, dur: 700, x: this.laneX(e.lane), y: TRACK_TOP + 10 });
          push({ kind: "chip", t0: now, dur: 2200, x: this.laneX(e.lane), y: TRACK_TOP - 44, text: e.user.name });
          break;
        case "cheer":
          push({ kind: "heart", t0: now, dur: 900, x: 0, y: 0, userId: e.user.id });
          break;
        case "boost": {
          push({ kind: "burst", t0: now, dur: 800, x: 0, y: 0, userId: e.user.id, tier: e.tier });
          if (e.tier === 3) push({ kind: "stamp", t0: now, dur: 1400, x: W / 2, y: 760, text: "AIRLIFT!" });
          if (e.combo >= 10) {
            push({ kind: "plane", t0: now, dur: e.combo >= 100 ? 6000 : 4200, x: 0, y: 360, text: `${e.user.name} ×${e.combo}` });
          }
          break;
        }
        case "wave":
          push({ kind: "wavesweep", t0: now, dur: 1400, x: 0, y: 0 });
          break;
        case "finish": {
          const x = this.laneX(e.racer.lane);
          push({ kind: "splash", t0: now, dur: 900, x, y: TRACK_BOTTOM + 40 });
          if (e.place <= 3) push({ kind: "placestamp", t0: now, dur: 1600, x, y: TRACK_BOTTOM - 60, text: PLACE_WORD[e.place - 1] });
          break;
        }
        case "photoFinish":
          push({ kind: "photoflash", t0: now, dur: 1500, x: 0, y: 0 });
          break;
        case "raceStart":
          push({ kind: "go", t0: now, dur: 950, x: W / 2, y: 950 });
          break;
        case "takeover":
          push({ kind: "parade", t0: now, dur: 8000, x: 0, y: 0, user: e.user, text: e.user.name });
          break;
        case "welcome":
          push({ kind: "hatdrop", t0: now, dur: 1400, x: 0, y: 0, userId: e.user.id, text: e.user.name });
          break;
        case "beachball":
          push({ kind: "beachball", t0: now, dur: 2100, x: 0, y: 0 });
          break;
        case "firstHuman":
          push({ kind: "herocard", t0: now, dur: 2600, x: W / 2, y: 860, text: `${e.user.name} joins the beach!` });
          break;
        case "raceEnd":
          break; // ceremony renders from state.phase
      }
    }
  }

  /* ── particles ────────────────────────────────────────────────────────── */

  private spawn(p: Particle) {
    if (this.particles.length >= PARTICLE_CAP) this.particles.shift();
    this.particles.push(p);
  }

  private burst(x: number, y: number, color: string, n: number, speed = 3.2, kind: Particle["kind"] = "dot") {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
      const v = speed * (0.5 + Math.random() * 0.7);
      this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.06, age: 0, life: 500 + Math.random() * 400, size: 3 + Math.random() * 4, color, kind });
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, dt: number) {
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.x += p.vx * (dt / 16.7);
      p.y += p.vy * (dt / 16.7);
      p.vy += p.g * (dt / 16.7);
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === "rect") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.age / 200) * (p.vx > 0 ? 1 : -1));
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === "spark" ? a : 1), 0, Math.PI * 2);
        ctx.fill();
      }
      alive.push(p);
    }
    ctx.globalAlpha = 1;
    this.particles = alive;
  }

  /* ── small drawing helpers ────────────────────────────────────────────── */

  private font(px: number, weight = 700): string {
    return `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  }

  private rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 28, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.theme.card;
    ctx.shadowColor = "rgba(31,41,51,0.18)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    this.rr(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.restore();
  }

  private pill(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, px: number, fg: string, bg: string, padX = 18, alpha = 1) {
    ctx.font = this.font(px);
    const w = ctx.measureText(text).width + padX * 2;
    const h = px + 18;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = bg;
    this.rr(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy + 1);
    ctx.restore();
    return w;
  }

  private trunc(name: string, max = 14): string {
    return name.length > max ? name.slice(0, max - 1) + "…" : name;
  }

  private ease(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private pop(t: number): number {
    // quick scale-in with a soft overshoot, then settle
    if (t < 0.25) return this.ease(t / 0.25) * 1.08;
    if (t < 0.4) return 1.08 - 0.08 * this.ease((t - 0.25) / 0.15);
    return 1;
  }

  private findRacer(state: SprintState, userId?: string): Racer | undefined {
    if (!userId) return undefined;
    return state.racers.find((r) => r.id === userId);
  }

  /* ── the frame ────────────────────────────────────────────────────────── */

  render(state: SprintState, now: number): void {
    if (this.disposed) return;
    const dt = Math.min(100, this.lastNow ? now - this.lastNow : 16.7);
    this.lastNow = now;
    const ctx = this.ctx;
    const t = this.theme;

    // letterbox fill first (identity space), then enter the 1080×1920 design space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = t.skyTop;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    ctx.textBaseline = "alphabetic";

    /* sky + sun + clouds */
    if (this.skyLayer) ctx.drawImage(this.skyLayer, 0, 0);
    this.drawSun(ctx, now);
    this.drawClouds(ctx, now);

    /* track */
    if (this.sandLayer) ctx.drawImage(this.sandLayer, 0, 430);
    this.drawDecor(ctx, now);
    this.drawFinishBand(ctx);
    this.drawSea(ctx, now);

    /* wave sweep behind racers */
    this.drawFx(ctx, state, now, "behind");

    /* racers + tower */
    this.drawRacers(ctx, state, now);
    if (state.phase === "race") this.drawPositionTower(ctx, state, now);

    /* lobby countdown + ceremony */
    if (state.phase === "lobby") this.drawLobbyCountdown(ctx, state, now);
    if (state.phase === "podium") this.drawCeremony(ctx, state, now);

    /* header + footer chrome */
    this.drawHeader(ctx, state, now);
    this.drawFooter(ctx, state, now);

    /* idle attract */
    if (state.idle) this.drawAttract(ctx, now);

    /* foreground effects + particles */
    this.drawFx(ctx, state, now, "front");
    this.drawParticles(ctx, dt);

    /* connection dot */
    this.drawConnection(ctx);
  }

  /* ── scenery ──────────────────────────────────────────────────────────── */

  private drawSun(ctx: CanvasRenderingContext2D, now: number) {
    const t = this.theme;
    const cx = 150;
    const cy = 150;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(now / 24000);
    ctx.fillStyle = t.sun;
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 * i) / 8);
      this.rr(ctx, -9, 78, 18, 34, 9);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(-18, -20, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawClouds(ctx: CanvasRenderingContext2D, now: number) {
    const t = this.theme;
    ctx.fillStyle = t.cloud;
    const clouds = [
      { y: 110, s: 1, v: 14000, o: 0.95 },
      { y: 250, s: 0.72, v: 21000, o: 0.8 },
      { y: 360, s: 0.55, v: 30000, o: 0.65 },
    ];
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const x = ((now / c.v + i * 0.37) % 1.3) * (W + 400) - 200;
      ctx.globalAlpha = c.o;
      ctx.save();
      ctx.translate(x, c.y);
      ctx.scale(c.s, c.s);
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, Math.PI * 2);
      ctx.arc(48, -14, 34, 0, Math.PI * 2);
      ctx.arc(94, 2, 40, 0, Math.PI * 2);
      ctx.arc(46, 16, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawDecor(ctx: CanvasRenderingContext2D, now: number) {
    const t = this.theme;
    const items: { kind: number; x: number; y: number; ph: number }[] = [
      { kind: 0, x: 46, y: 560, ph: 0 },
      { kind: 1, x: W - 46, y: 700, ph: 1.4 },
      { kind: 2, x: 46, y: 880, ph: 2.2 },
      { kind: 0, x: W - 46, y: 1030, ph: 3.1 },
      { kind: 3, x: 46, y: 1180, ph: 4.0 },
      { kind: 1, x: 46, y: 1380, ph: 5.3 },
      { kind: 2, x: W - 46, y: 1300, ph: 0.7 },
    ];
    for (const it of items) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(Math.sin(now / 1400 + it.ph) * 0.045);
      if (it.kind === 0) {
        // palm
        ctx.fillStyle = "#B07D4F";
        this.rr(ctx, -7, -10, 14, 66, 7);
        ctx.fill();
        ctx.fillStyle = t.mint;
        for (let i = 0; i < 5; i++) {
          ctx.save();
          ctx.rotate(-Math.PI / 2 + (i - 2) * 0.55);
          ctx.beginPath();
          ctx.ellipse(30, 0, 32, 11, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (it.kind === 1) {
        // umbrella
        ctx.fillStyle = "#C8CFD6";
        this.rr(ctx, -3, -4, 6, 58, 3);
        ctx.fill();
        ctx.fillStyle = t.coral;
        ctx.beginPath();
        ctx.arc(0, -6, 40, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.moveTo(-40, -6);
        ctx.arc(0, -6, 40, Math.PI, Math.PI + 0.62);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(40, -6);
        ctx.arc(0, -6, 40, 0, -0.62, true);
        ctx.closePath();
        ctx.fill();
      } else if (it.kind === 2) {
        // beach ball
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = t.coral;
        ctx.beginPath();
        ctx.arc(0, 0, 26, -0.5, 0.9);
        ctx.lineTo(0, 0);
        ctx.fill();
        ctx.fillStyle = t.sea;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 1.6, 2.9);
        ctx.lineTo(0, 0);
        ctx.fill();
        ctx.fillStyle = t.gold;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 3.6, 4.9);
        ctx.lineTo(0, 0);
        ctx.fill();
      } else {
        // starfish
        ctx.fillStyle = t.gold;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
          const b = a + Math.PI / 5;
          ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26);
          ctx.lineTo(Math.cos(b) * 11, Math.sin(b) * 11);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawFinishBand(ctx: CanvasRenderingContext2D) {
    const t = this.theme;
    const y = TRACK_BOTTOM;
    const cell = (W - 180) / 16;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = (i + row) % 2 === 0 ? t.ink : "#FFFFFF";
        ctx.globalAlpha = 0.85;
        ctx.fillRect(90 + i * cell, y + row * 16, cell, 16);
      }
    }
    ctx.globalAlpha = 1;
    // flags
    for (const fx of [64, W - 64]) {
      ctx.fillStyle = "#C8CFD6";
      this.rr(ctx, fx - 3, y - 58, 6, 90, 3);
      ctx.fill();
      ctx.fillStyle = t.coral;
      ctx.beginPath();
      ctx.moveTo(fx + 3, y - 58);
      ctx.lineTo(fx + 46, y - 44);
      ctx.lineTo(fx + 3, y - 30);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawSea(ctx: CanvasRenderingContext2D, now: number) {
    const t = this.theme;
    ctx.fillStyle = t.sea;
    ctx.fillRect(0, TRACK_BOTTOM + 32, W, H - TRACK_BOTTOM - 32);
    ctx.strokeStyle = t.seaFoam;
    ctx.lineWidth = 5;
    for (let row = 0; row < 3; row++) {
      const y = TRACK_BOTTOM + 60 + row * 46;
      const drift = ((now / (2600 + row * 700)) % 1) * 88 * (row % 2 === 0 ? 1 : -1);
      ctx.globalAlpha = 0.75 - row * 0.18;
      ctx.beginPath();
      for (let x = -88; x < W + 88; x += 88) {
        ctx.moveTo(x + drift, y);
        ctx.arc(x + drift + 22, y, 22, Math.PI, 0, true);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ── racers ───────────────────────────────────────────────────────────── */

  private drawRacers(ctx: CanvasRenderingContext2D, state: SprintState, now: number) {
    const t = this.theme;
    const simNow = state.simClock;
    const racing = state.phase === "race";
    const sorted = [...state.racers].sort((a, b) => a.progress - b.progress);
    for (const r of sorted) {
      const x = this.laneX(r.lane);
      const bob = racing && r.place === undefined ? Math.sin(now / 95 + r.lane * 1.3) * 3.5 : 0;
      const y = this.racerY(r.progress) + bob;
      const boosted = simNow < r.boostUntil;

      // trails (drawn behind the disc)
      if (boosted && racing) this.drawTrail(ctx, r, x, y, now);

      // shadow
      ctx.fillStyle = "rgba(31,41,51,0.14)";
      ctx.beginPath();
      ctx.ellipse(x, y + 40, 30, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // jet ski under the racer (tier 2)
      if (boosted && r.boostTier === 2) {
        ctx.save();
        ctx.translate(x, y + 26);
        ctx.fillStyle = "#FFFFFF";
        this.rr(ctx, -46, 0, 92, 22, 11);
        ctx.fill();
        ctx.fillStyle = t.coral;
        this.rr(ctx, -46, 12, 92, 10, 5);
        ctx.fill();
        ctx.restore();
        if (Math.random() < 0.5) this.spawn({ x: x + (Math.random() - 0.5) * 30, y: y + 38, vx: (Math.random() - 0.5) * 1.4, vy: -1.6 - Math.random(), g: 0.09, age: 0, life: 420, size: 3.4, color: "#FFFFFF", kind: "dot" });
      }

      // seagull above (tier 3)
      if (boosted && r.boostTier === 3) {
        ctx.save();
        ctx.translate(x, y - 74);
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        const flap = Math.sin(now / 90) * 0.5;
        for (const dir of [-1, 1]) {
          ctx.save();
          ctx.rotate(dir * (0.5 + flap) * 0.6);
          ctx.beginPath();
          ctx.ellipse(dir * 30, -6, 26, 8, dir * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = t.gold;
        ctx.beginPath();
        ctx.moveTo(24, 0);
        ctx.lineTo(38, 4);
        ctx.lineTo(24, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // parade glow (tier 4)
      if (boosted && r.boostTier === 4) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(now / 160) * 0.2;
        ctx.strokeStyle = t.gold;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(x, y, 50, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // avatar disc
      ctx.save();
      if (boosted) ctx.transform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.arc(x, y, 38, 0, Math.PI * 2);
      ctx.save();
      ctx.clip();
      try {
        ctx.drawImage(avatarImage(r.user, r.bot), x - 38, y - 38, 76, 76);
      } catch {
        ctx.fillStyle = t.inkSoft;
        ctx.fillRect(x - 38, y - 38, 76, 76);
      }
      ctx.restore();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#FFFFFF";
      ctx.stroke();
      if (r.place !== undefined && r.place <= 3) {
        ctx.strokeStyle = [t.gold, "#C9CFD6", "#E2A76F"][r.place - 1];
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, 43, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // sun hat
      if (r.hat) {
        ctx.save();
        ctx.translate(x, y - 34);
        ctx.fillStyle = t.gold;
        ctx.beginPath();
        ctx.ellipse(0, 2, 30, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -4, 17, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = t.coral;
        this.rr(ctx, -17, -6, 34, 7, 3);
        ctx.fill();
        ctx.restore();
      }

      // name pill
      const label = r.bot ? S.botName(Number(r.id.split(":")[1] || 0)) : this.trunc(r.user?.name ?? "guest");
      ctx.font = this.font(25);
      const nw = ctx.measureText(label).width + (r.bot ? 66 : 30);
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      this.rr(ctx, x - nw / 2, y + 50, nw, 37, 18);
      ctx.fill();
      ctx.fillStyle = r.bot ? t.inkSoft : t.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (r.bot) {
        ctx.font = this.font(17);
        ctx.fillStyle = "#FFFFFF";
        const bx = x - nw / 2 + 26;
        ctx.save();
        ctx.fillStyle = t.inkSoft;
        this.rr(ctx, x - nw / 2 + 8, y + 57, 40, 23, 11);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText("BOT", bx + 2, y + 69);
        ctx.restore();
        ctx.font = this.font(25);
        ctx.fillStyle = t.inkSoft;
        ctx.fillText(label, x + 22, y + 70);
      } else {
        ctx.fillText(label, x, y + 70);
      }
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    }
  }

  private drawTrail(ctx: CanvasRenderingContext2D, r: Racer, x: number, y: number, now: number) {
    const t = this.theme;
    if (r.boostTier <= 0) {
      // dash lines
      ctx.strokeStyle = t.coral;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const off = ((now / 60 + i * 14) % 42);
        ctx.globalAlpha = 0.7 - i * 0.18;
        ctx.beginPath();
        ctx.moveTo(x - 18 + i * 18, y - 52 - off);
        ctx.lineTo(x - 18 + i * 18, y - 76 - off);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (r.boostTier === 1) {
      if (Math.random() < 0.6) this.spawn({ x: x + (Math.random() - 0.5) * 44, y: y - 44, vx: (Math.random() - 0.5) * 0.8, vy: -1.2, g: 0.02, age: 0, life: 520, size: 3.6, color: t.mint, kind: "spark" });
    } else if (r.boostTier === 4) {
      if (Math.random() < 0.7) this.spawn({ x: x + (Math.random() - 0.5) * 56, y: y - 40, vx: (Math.random() - 0.5) * 1.6, vy: -1.4, g: 0.03, age: 0, life: 600, size: 5, color: [t.gold, t.coral, t.mint][(Math.random() * 3) | 0], kind: "rect" });
    }
  }

  private drawPositionTower(ctx: CanvasRenderingContext2D, state: SprintState, now: number) {
    const t = this.theme;
    const ranked = [...state.racers].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.progress - a.progress).slice(0, 3);
    const medal = [t.gold, "#C9CFD6", "#E2A76F"];
    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i];
      const cy = 486 + i * 102;
      this.card(ctx, 836, cy, 216, 90, 20, 0.96);
      ctx.fillStyle = medal[i];
      ctx.font = this.font(30);
      ctx.textAlign = "left";
      ctx.fillText(String(i + 1), 856, cy + 56);
      ctx.save();
      ctx.beginPath();
      ctx.arc(910, cy + 45, 24, 0, Math.PI * 2);
      ctx.clip();
      try {
        ctx.drawImage(avatarImage(r.user, r.bot), 886, cy + 21, 48, 48);
      } catch {
        /* initials fallback handled inside avatarImage */
      }
      ctx.restore();
      ctx.fillStyle = t.ink;
      ctx.font = this.font(21);
      ctx.fillText(this.trunc(r.bot ? "Bot" : (r.user?.name ?? ""), 8), 944, cy + 52);
    }
  }

  /* ── chrome ───────────────────────────────────────────────────────────── */

  private drawHeader(ctx: CanvasRenderingContext2D, state: SprintState, now: number) {
    const t = this.theme;
    this.card(ctx, 90, 64, 900, 244, 34);
    ctx.textAlign = "center";

    // line 1: title + race chip
    ctx.font = this.font(56, 800);
    const title = S.title;
    const tw = ctx.measureText(title).width;
    ctx.font = this.font(26);
    const chipText = `RACE ${state.raceNumber}`;
    const chipW = ctx.measureText(chipText).width + 36;
    const total = tw + 20 + chipW;
    const left = W / 2 - total / 2;
    ctx.fillStyle = t.ink;
    ctx.font = this.font(56, 800);
    ctx.textAlign = "left";
    ctx.fillText(title, left, 148);
    ctx.fillStyle = t.coral;
    this.rr(ctx, left + tw + 20, 112, chipW, 44, 22);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = this.font(26);
    ctx.textAlign = "center";
    ctx.fillText(chipText, left + tw + 20 + chipW / 2, 142);

    // line 2 by phase
    if (state.phase === "lobby") {
      const secs = Math.max(0, (state.phaseEndsAt - state.simClock) / 1000);
      ctx.fillStyle = t.ink;
      ctx.font = this.font(74, 800);
      ctx.fillText(S.lobbyLine(secs), W / 2, 240);
      ctx.fillStyle = t.inkSoft;
      ctx.font = this.font(29);
      ctx.fillText(S.joinHint, W / 2, 286);
    } else if (state.phase === "race") {
      const elapsed = Math.max(0, state.simClock - (state.phaseEndsAt - SPRINT.RACE_MAX_MS));
      const secs = Math.floor(elapsed / 1000);
      const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      const pulse = 0.75 + Math.sin(now / 260) * 0.25;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = t.mint;
      this.rr(ctx, W / 2 - 176, 196, 118, 52, 26);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = this.font(28, 800);
      ctx.fillText(S.raceLive, W / 2 - 117, 231);
      ctx.restore();
      ctx.fillStyle = t.ink;
      ctx.font = this.font(64, 800);
      ctx.textAlign = "left";
      ctx.fillText(clock, W / 2 - 24, 246);
      ctx.textAlign = "center";
      ctx.fillStyle = t.inkSoft;
      ctx.font = this.font(26);
      ctx.fillText(S.joinHint, W / 2, 290);
    } else {
      const winner = state.lastPodium[0];
      const name = winner?.user?.name ?? (winner?.bot ? "Sunny Bot" : "…");
      ctx.fillStyle = t.ink;
      ctx.font = this.font(46, 800);
      ctx.fillText(S.podiumTitle(this.trunc(name, 16)), W / 2, 242);
      ctx.fillStyle = t.inkSoft;
      ctx.font = this.font(26);
      ctx.fillText("Next race is forming…", W / 2, 286);
    }
    ctx.textAlign = "left";
  }

  private drawFooter(ctx: CanvasRenderingContext2D, state: SprintState, now: number) {
    const t = this.theme;

    // wave meter
    const wmX = 290;
    const wmW = 500;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    this.rr(ctx, wmX, 1666, wmW, 30, 15);
    ctx.fill();
    const waveActive = state.simClock < state.waveUntil;
    const fill = waveActive ? 100 : state.waveCharge;
    ctx.fillStyle = waveActive ? t.mint : t.sea;
    if (fill > 2) {
      this.rr(ctx, wmX, 1666, Math.max(30, wmW * (fill / 100)), 30, 15);
      ctx.fill();
    }
    ctx.fillStyle = t.ink;
    ctx.font = this.font(21, 800);
    ctx.textAlign = "center";
    ctx.fillText(waveActive ? "WAVE!" : `WAVE ${Math.round(fill)}%`, wmX + wmW / 2, 1688);

    // championship card
    this.card(ctx, 40, 1708, 1000, 128, 26, 0.97);
    ctx.fillStyle = t.inkSoft;
    ctx.font = this.font(21, 800);
    ctx.textAlign = "left";
    ctx.fillText("CHAMPIONSHIP", 68, 1740);
    if (state.board.length === 0) {
      ctx.fillStyle = t.inkSoft;
      ctx.font = this.font(24);
      ctx.fillText("Finish on the podium to enter the championship", 68, 1796);
    } else {
      const n = Math.min(5, state.board.length);
      for (let i = 0; i < n; i++) {
        const row = state.board[i];
        const cx = 68 + i * 196;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx + 22, 1786, 22, 0, Math.PI * 2);
        ctx.clip();
        try {
          ctx.drawImage(avatarImage(row.user), cx, 1764, 44, 44);
        } catch {
          /* fallback disc */
        }
        ctx.restore();
        if (i === 0) {
          // crown
          ctx.fillStyle = t.gold;
          ctx.beginPath();
          ctx.moveTo(cx + 8, 1758);
          ctx.lineTo(cx + 14, 1746);
          ctx.lineTo(cx + 22, 1755);
          ctx.lineTo(cx + 30, 1746);
          ctx.lineTo(cx + 36, 1758);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = t.ink;
        ctx.font = this.font(21);
        ctx.fillText(this.trunc(row.user.name, 9), cx + 52, 1780);
        ctx.fillStyle = t.inkSoft;
        ctx.font = this.font(20, 800);
        ctx.fillText(`${row.points} pts`, cx + 52, 1806);
      }
    }

    // ticker
    const item = state.ticker[0];
    if (item) {
      if (item.id !== this.lastTickerId) {
        this.lastTickerId = item.id;
        this.tickerShownAt = now;
      }
      const tt = Math.min(1, (now - this.tickerShownAt) / 350);
      const slide = (1 - this.ease(tt)) * 60;
      this.pill(ctx, W / 2 + slide, 1868, item.text, 24, t.ink, "rgba(255,255,255,0.92)", 22);
    }

    // rotating signage (small, quiet, descriptive)
    const sigIdx = Math.floor(now / 8000) % S.signage.length;
    const sigFade = Math.min(1, ((now % 8000) / 8000) * 6, (1 - (now % 8000) / 8000) * 6);
    this.pill(ctx, W / 2, 1904, S.signage[sigIdx], 21, t.inkSoft, "rgba(255,255,255,0.66)", 18, Math.max(0.25, sigFade));
    ctx.textAlign = "left";
  }

  private drawLobbyCountdown(ctx: CanvasRenderingContext2D, state: SprintState, now: number) {
    const remaining = state.phaseEndsAt - state.simClock;
    if (remaining > 3200 || remaining <= 0) return;
    const n = Math.ceil(remaining / 1000);
    const frac = 1 - (remaining % 1000) / 1000;
    const s = 0.8 + this.ease(Math.min(1, frac * 2)) * 0.5;
    const t = this.theme;
    ctx.save();
    ctx.translate(W / 2, 980);
    ctx.scale(s, s);
    ctx.globalAlpha = frac < 0.85 ? 1 : 1 - (frac - 0.85) / 0.15;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.coral;
    ctx.font = this.font(150, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), 0, 12);
    ctx.restore();
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }

  private drawCeremony(ctx: CanvasRenderingContext2D, state: SprintState, now: number) {
    const t = this.theme;
    const pod = state.lastPodium;
    if (!pod.length) return;

    // soft light — keep it bright
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    ctx.fillRect(0, 430, W, TRACK_BOTTOM - 400);

    const baseY = 1240;
    const slots = [
      { place: 2, x: 300, h: 170, color: "#C9CFD6" },
      { place: 1, x: 540, h: 240, color: t.gold },
      { place: 3, x: 780, h: 120, color: "#E2A76F" },
    ];
    // confetti
    if (this.particles.length < 320 && Math.random() < 0.75) {
      this.spawn({ x: Math.random() * W, y: 430, vx: (Math.random() - 0.5) * 1.2, vy: 1.6 + Math.random() * 1.4, g: 0.012, age: 0, life: 2600, size: 7, color: [t.coral, t.mint, t.gold, t.sea][(Math.random() * 4) | 0], kind: "rect" });
    }

    for (const slot of slots) {
      const row = pod.find((p) => p.place === slot.place);
      if (!row) continue;
      // pedestal
      ctx.fillStyle = slot.color;
      this.rr(ctx, slot.x - 100, baseY - slot.h, 200, slot.h, 16);
      ctx.fill();
      ctx.fillStyle = "rgba(31,41,51,0.14)";
      this.rr(ctx, slot.x - 100, baseY - slot.h, 200, 16, 8);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = this.font(56, 800);
      ctx.textAlign = "center";
      ctx.fillText(String(slot.place), slot.x, baseY - slot.h / 2 + 20);

      // avatar
      const ay = baseY - slot.h - 78;
      ctx.save();
      ctx.beginPath();
      ctx.arc(slot.x, ay, 62, 0, Math.PI * 2);
      ctx.clip();
      try {
        ctx.drawImage(avatarImage(row.user, row.bot), slot.x - 62, ay - 62, 124, 124);
      } catch {
        /* fallback */
      }
      ctx.restore();
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(slot.x, ay, 62, 0, Math.PI * 2);
      ctx.stroke();

      const name = row.bot ? "Sunny Bot" : this.trunc(row.user?.name ?? "", 12);
      this.pill(ctx, slot.x, ay + 104, `${name} · +${row.points}`, 24, t.ink, "rgba(255,255,255,0.95)");
    }
    ctx.textAlign = "left";
  }

  private drawAttract(ctx: CanvasRenderingContext2D, now: number) {
    const t = this.theme;
    this.card(ctx, 150, 640, 780, 380, 36, 0.97);
    ctx.textAlign = "center";
    ctx.fillStyle = t.ink;
    ctx.font = this.font(64, 800);
    ctx.fillText(S.title, W / 2, 730);
    ctx.fillStyle = t.inkSoft;
    ctx.font = this.font(30);
    ctx.fillText(S.joinHint, W / 2, 782);

    // cycling hall of fame
    const mode = Math.floor(now / 6000) % 2;
    ctx.fillStyle = t.inkSoft;
    ctx.font = this.font(22, 800);
    ctx.fillText(mode === 0 ? "HALL OF FAME" : "MONUMENTS", W / 2, 840);
    const rows = mode === 0 ? this.allTime.slice(0, 3).map((g) => `${this.trunc(g.name, 14)} — ${g.total_coins.toLocaleString()} coins`) : this.monuments.slice(0, 3).map((m) => `${this.trunc(m.name, 14)} — ${m.coins.toLocaleString()} coins`);
    if (rows.length === 0) rows.push(mode === 0 ? "Your name could live here" : "Legendary gifts are remembered here");
    ctx.fillStyle = t.ink;
    ctx.font = this.font(28);
    rows.forEach((row, i) => ctx.fillText(row, W / 2, 890 + i * 44));
    ctx.textAlign = "left";
  }

  private drawConnection(ctx: CanvasRenderingContext2D) {
    const t = this.theme;
    const colors: Record<FeedStatus, string> = { idle: t.inkSoft, connecting: t.gold, live: t.mint, error: t.coral, unconfigured: t.inkSoft };
    ctx.fillStyle = colors[this.conn.feed] ?? t.inkSoft;
    ctx.beginPath();
    ctx.arc(1046, 1888, 7, 0, Math.PI * 2);
    ctx.fill();
    if (this.conn.room) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = this.font(19);
      ctx.textAlign = "right";
      ctx.fillText(`@${this.conn.room}`, 1032, 1895);
      ctx.textAlign = "left";
    }
  }

  /* ── effects ──────────────────────────────────────────────────────────── */

  private drawFx(ctx: CanvasRenderingContext2D, state: SprintState, now: number, layer: "behind" | "front") {
    const t = this.theme;
    const keep: Fx[] = [];
    for (const f of this.fx) {
      const tt = (now - f.t0) / f.dur;
      if (tt >= 1) continue;
      keep.push(f);
      const isBehind = f.kind === "wavesweep";
      if ((layer === "behind") !== isBehind) continue;

      switch (f.kind) {
        case "puff": {
          ctx.globalAlpha = 1 - tt;
          ctx.fillStyle = t.sandDark;
          for (let i = 0; i < 5; i++) {
            const a = (Math.PI * 2 * i) / 5;
            const d = 10 + this.ease(tt) * 34;
            ctx.beginPath();
            ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 8 * (1 - tt), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "chip":
          this.pill(ctx, f.x, f.y - this.ease(Math.min(1, tt * 2)) * 18, this.trunc(f.text ?? "", 14), 23, t.ink, "rgba(255,255,255,0.95)", 16, tt > 0.75 ? (1 - tt) * 4 : 1);
          break;
        case "heart": {
          const r = this.findRacer(state, f.userId);
          if (!r) break;
          const x = this.laneX(r.lane);
          const y = this.racerY(r.progress) - 58 - this.ease(tt) * 40;
          ctx.save();
          ctx.globalAlpha = 1 - tt;
          ctx.fillStyle = t.coral;
          ctx.translate(x, y);
          const s = 1 + this.pop(tt) * 0.15;
          ctx.scale(s, s);
          ctx.beginPath();
          ctx.arc(-7, -4, 9, 0, Math.PI * 2);
          ctx.arc(7, -4, 9, 0, Math.PI * 2);
          ctx.moveTo(-14, 0);
          ctx.lineTo(0, 16);
          ctx.lineTo(14, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case "burst": {
          const r = this.findRacer(state, f.userId);
          if (!r) break;
          if (tt < 0.1 && f.tier !== undefined) {
            const colors = [t.coral, t.mint, t.mint, t.gold, t.gold];
            this.burst(this.laneX(r.lane), this.racerY(r.progress), colors[f.tier] ?? t.coral, 10 + (f.tier ?? 0) * 6, 3 + (f.tier ?? 0));
          }
          break;
        }
        case "plane": {
          const x = -260 + (W + 520) * this.ease(tt);
          const y = f.y + Math.sin(tt * Math.PI * 2) * 12;
          ctx.save();
          ctx.translate(x, y);
          // banner
          ctx.font = this.font(26, 800);
          const bw = ctx.measureText(f.text ?? "").width + 40;
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          this.rr(ctx, -bw - 74, -20, bw, 44, 10);
          ctx.fill();
          ctx.fillStyle = t.ink;
          ctx.textAlign = "left";
          ctx.fillText(f.text ?? "", -bw - 54, 10);
          ctx.strokeStyle = t.inkSoft;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-74, 2);
          ctx.lineTo(-46, 2);
          ctx.stroke();
          // little plane
          ctx.fillStyle = t.coral;
          this.rr(ctx, -46, -12, 82, 26, 13);
          ctx.fill();
          ctx.fillStyle = "#FFFFFF";
          ctx.beginPath();
          ctx.moveTo(-6, -10);
          ctx.lineTo(16, -34);
          ctx.lineTo(28, -10);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case "stamp":
        case "placestamp": {
          const s = this.pop(tt);
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.scale(s, s);
          this.pill(ctx, 0, 0, f.text ?? "", f.kind === "stamp" ? 34 : 28, "#FFFFFF", f.kind === "stamp" ? t.coral : t.gold, 22, tt > 0.8 ? (1 - tt) * 5 : 1);
          ctx.restore();
          break;
        }
        case "wavesweep": {
          const y = H - (H + 300) * this.ease(tt);
          const grad = ctx.createLinearGradient(0, y, 0, y + 260);
          grad.addColorStop(0, "rgba(191,243,240,0)");
          grad.addColorStop(0.5, "rgba(191,243,240,0.55)");
          grad.addColorStop(1, "rgba(47,182,191,0.25)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, y, W, 260);
          ctx.strokeStyle = "#FFFFFF";
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 6;
          ctx.beginPath();
          for (let x = -60; x < W + 60; x += 60) {
            ctx.moveTo(x, y + 8);
            ctx.arc(x + 15, y + 8, 15, Math.PI, 0, true);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case "splash": {
          if (tt < 0.12) this.burst(f.x, f.y, t.seaFoam, 12, 3.6);
          break;
        }
        case "photoflash": {
          if (tt < 0.25) {
            ctx.globalAlpha = 0.75 * (1 - tt / 0.25);
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, TRACK_BOTTOM - 140, W, 200);
            ctx.globalAlpha = 1;
          }
          const s = this.pop(Math.min(1, tt * 1.6));
          ctx.save();
          ctx.translate(W / 2, TRACK_BOTTOM - 180);
          ctx.scale(s, s);
          this.pill(ctx, 0, 0, "PHOTO FINISH", 34, "#FFFFFF", t.ink, 26, tt > 0.8 ? (1 - tt) * 5 : 1);
          ctx.restore();
          break;
        }
        case "go": {
          const s = this.pop(tt);
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.scale(s, s);
          ctx.globalAlpha = tt > 0.7 ? (1 - tt) / 0.3 : 1;
          ctx.fillStyle = "#FFFFFF";
          ctx.beginPath();
          ctx.arc(0, 0, 128, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = t.mint;
          ctx.font = this.font(120, 800);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("GO!", 0, 10);
          ctx.restore();
          ctx.textBaseline = "alphabetic";
          ctx.textAlign = "left";
          break;
        }
        case "parade": {
          // golden sky tint — bright, celebratory
          ctx.globalAlpha = 0.16 * Math.sin(Math.min(1, tt * 3) * Math.PI);
          ctx.fillStyle = t.gold;
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
          // float crosses the track
          const x = -320 + (W + 640) * this.ease(tt);
          const y = 900 + Math.sin(now / 300) * 6;
          ctx.save();
          ctx.translate(x, y);
          ctx.fillStyle = t.coral;
          this.rr(ctx, -170, 60, 340, 56, 18);
          ctx.fill();
          ctx.fillStyle = "#FFFFFF";
          this.rr(ctx, -170, 46, 340, 20, 10);
          ctx.fill();
          // bunting
          for (let i = 0; i < 7; i++) {
            ctx.fillStyle = [t.mint, t.gold, t.sea][(i % 3)];
            ctx.beginPath();
            ctx.moveTo(-150 + i * 48, 64);
            ctx.lineTo(-138 + i * 48, 88);
            ctx.lineTo(-126 + i * 48, 64);
            ctx.closePath();
            ctx.fill();
          }
          // giant avatar
          ctx.beginPath();
          ctx.arc(0, -46, 100, 0, Math.PI * 2);
          ctx.save();
          ctx.clip();
          try {
            ctx.drawImage(avatarImage(f.user), -100, -146, 200, 200);
          } catch {
            /* fallback */
          }
          ctx.restore();
          ctx.lineWidth = 10;
          ctx.strokeStyle = "#FFFFFF";
          ctx.stroke();
          ctx.restore();
          this.pill(ctx, W / 2, 700, `${this.trunc(f.text ?? "", 16)} STARTS THE PARADE`, 34, t.ink, "rgba(255,255,255,0.96)", 26);
          // fireworks over the sea
          if (Math.random() < 0.12) {
            this.burst(140 + Math.random() * 800, 1580 + Math.random() * 120, [t.gold, t.coral, t.mint][(Math.random() * 3) | 0], 16, 4.4, "spark");
          }
          break;
        }
        case "hatdrop": {
          const r = this.findRacer(state, f.userId);
          const x = r ? this.laneX(r.lane) : W / 2;
          const yTo = r ? this.racerY(r.progress) - 34 : 900;
          const y = yTo - (1 - this.ease(tt)) * 260;
          ctx.save();
          ctx.translate(x, y);
          ctx.fillStyle = t.gold;
          ctx.beginPath();
          ctx.ellipse(0, 2, 30, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, -4, 17, Math.PI, 0);
          ctx.fill();
          ctx.restore();
          break;
        }
        case "beachball": {
          const x = -80 + (W + 160) * this.ease(tt);
          const y = 1360 - Math.abs(Math.sin(tt * Math.PI * 3)) * 240;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(tt * 9);
          ctx.fillStyle = "#FFFFFF";
          ctx.beginPath();
          ctx.arc(0, 0, 32, 0, Math.PI * 2);
          ctx.fill();
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = [t.coral, t.sea, t.gold][i];
            ctx.beginPath();
            ctx.arc(0, 0, 32, (i * 2.1), i * 2.1 + 1.1);
            ctx.lineTo(0, 0);
            ctx.fill();
          }
          ctx.restore();
          break;
        }
        case "herocard": {
          const s = this.pop(Math.min(1, tt * 1.4));
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.scale(s, s);
          this.pill(ctx, 0, 0, f.text ?? "", 34, t.ink, "rgba(255,255,255,0.97)", 30, tt > 0.85 ? (1 - tt) * 6 : 1);
          ctx.restore();
          break;
        }
      }
    }
    this.fx = keep;
  }
}
