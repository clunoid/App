import type { EmitOpts, EngineAPI, GiftEvent, Particle, Show } from "./types";
import { ARCH } from "./shows";

const W = 1080;
const H = 1920;
const MAX_PARTICLES = 2600;

type Banner = { sender: string; emoji: string; name: string; count: number; tier: number } | null;
export type BackgroundId = "cosmos" | "aurora" | "grid";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Cinematic canvas renderer for Showtime. Pooled soft-particles with cached
 *  additive-glow sprites, screen shake / flash / vignette / colour-grade post FX,
 *  three living backgrounds, and a priority queue of choreographed gift "shows".
 *  Renderer-agnostic show library drives it via EngineAPI. */
export class ShowtimeEngine implements EngineAPI {
  readonly W = W;
  readonly H = H;
  ctx: CanvasRenderingContext2D;
  time = 0;

  private canvas: HTMLCanvasElement;
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private scale = 1;
  private offX = 0;
  private offY = 0;

  private pool: Particle[] = [];
  private live = 0;
  private shows: Show[] = [];
  private shakeAmt = 0;
  private shakeX = 0;
  private shakeY = 0;
  private flashCol: [number, number, number] = [255, 255, 255];
  private flashA = 0;
  private bg: BackgroundId = "cosmos";
  private stars: { x: number; y: number; z: number; tw: number }[] = [];
  private glowCache = new Map<string, HTMLCanvasElement>();

  onBanner: (b: Banner) => void = () => {};
  onIdle: (idle: boolean) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    for (let i = 0; i < MAX_PARTICLES; i++) this.pool.push(this.blank());
    for (let i = 0; i < 340; i++) this.stars.push({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 0.7, tw: Math.random() * Math.PI * 2 });
    this.resize();
  }

  /* ── lifecycle ─────────────────────────────────────────────────────────── */
  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.time += dt;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.cssW = r.width || 360;
    this.cssH = r.height || 640;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.scale = Math.min(this.cssW / W, this.cssH / H);
    this.offX = (this.cssW - W * this.scale) / 2;
    this.offY = (this.cssH - H * this.scale) / 2;
  }

  setBackground(id: BackgroundId) { this.bg = id; }

  /* ── orchestration ─────────────────────────────────────────────────────── */
  trigger(ev: GiftEvent) {
    const g = ev.gift;
    // combo: same gift + sender still running → extend + intensify instead of restacking
    const existing = this.shows.find((s) => s.ev.gift.id === g.id && s.ev.sender === ev.sender && s.t < s.dur * 0.75);
    if (existing) {
      existing.intensity = Math.min(8, existing.intensity + 1);
      existing.dur = Math.min(existing.dur + baseDuration(g.tier) * 0.45, baseDuration(g.tier) * 3.2);
      existing.ev.count = ev.count;
      this.shake(6 + g.tier * 2);
      return;
    }
    // cap concurrent big shows so a storm never turns to mush
    const bigs = this.shows.filter((s) => s.tier >= 3).length;
    if (g.tier >= 3 && bigs >= 2) this.shows.shift();
    if (this.shows.length >= 4) this.shows.shift();
    const show: Show = {
      ev, arch: g.archetype, tier: g.tier, theme: g.theme.map(hexToRgb),
      t: 0, dur: baseDuration(g.tier), intensity: 1, stage: 0, seed: Math.random() * 1000, s: {},
    };
    this.shows.push(show);
    this.onBanner({ sender: ev.sender, emoji: g.emoji, name: g.name, count: ev.count, tier: g.tier });
    this.shake(4 + g.tier * 2.5);
  }

  private update(dt: number) {
    // particles
    for (let i = 0; i < this.live; i++) {
      const p = this.pool[i];
      p.vy += p.grav * dt;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
      if (p.life <= 0) { this.pool[i] = this.pool[--this.live]; this.pool[this.live] = p; i--; }
    }
    // shows
    for (const show of this.shows) {
      show.t += dt;
      ARCH[show.arch].update(show, this, dt);
    }
    this.shows = this.shows.filter((s) => s.t < s.dur);
    if (!this.shows.length) this.onIdle(true);
    else this.onIdle(false);
    // post fx decay
    this.shakeAmt *= Math.pow(0.0025, dt);
    if (this.shakeAmt < 0.15) this.shakeAmt = 0;
    this.shakeX = (Math.random() * 2 - 1) * this.shakeAmt;
    this.shakeY = (Math.random() * 2 - 1) * this.shakeAmt;
    this.flashA *= Math.pow(0.02, dt);
    if (this.flashA < 0.01) this.flashA = 0;
  }

  private render() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#04050a";
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, (this.offX + this.shakeX) * dpr, (this.offY + this.shakeY) * dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    this.drawBackground();

    // additive glow particles
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.live; i++) { const p = this.pool[i]; if (p.add) this.drawParticle(p); }
    ctx.globalCompositeOperation = "source-over";

    // show hero graphics (over particles)
    for (const show of this.shows) ARCH[show.arch].render(show, this);

    // normal particles (petals, confetti)
    for (let i = 0; i < this.live; i++) { const p = this.pool[i]; if (!p.add) this.drawParticle(p); }

    // flash
    if (this.flashA > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(${this.flashCol[0]},${this.flashCol[1]},${this.flashCol[2]},${this.flashA})`;
      ctx.fillRect(-200, -200, W + 400, H + 400);
      ctx.globalCompositeOperation = "source-over";
    }
    // cinematic grade + vignette
    const grade = ctx.createLinearGradient(0, 0, W, H);
    grade.addColorStop(0, "rgba(60,20,90,0.06)");
    grade.addColorStop(1, "rgba(0,60,90,0.06)");
    ctx.fillStyle = grade;
    ctx.fillRect(0, 0, W, H);
    const vig = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.28, W / 2, H * 0.5, H * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  private drawParticle(p: Particle) {
    const ctx = this.ctx;
    const a = Math.max(0, Math.min(1, (p.life / p.max) * p.a));
    if (a <= 0) return;
    if (p.add) {
      const spr = this.glow(p.r, p.g, p.b);
      ctx.globalAlpha = a;
      ctx.drawImage(spr, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = a;
    ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
    if (p.shape === "petal") { ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (p.shape === "star") { this.starPath(p.size); ctx.fill(); }
    else { ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size * 0.7); }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private starPath(r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  private glow(r: number, g: number, b: number): HTMLCanvasElement {
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    let c = this.glowCache.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const gx = c.getContext("2d")!;
    const grad = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.3, `rgba(${r},${g},${b},0.55)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    gx.fillStyle = grad;
    gx.fillRect(0, 0, 64, 64);
    this.glowCache.set(key, c);
    return c;
  }

  /* ── backgrounds ───────────────────────────────────────────────────────── */
  private drawBackground() {
    const ctx = this.ctx;
    const t = this.time;
    const base = ctx.createLinearGradient(0, 0, 0, H);
    if (this.bg === "aurora") { base.addColorStop(0, "#05131a"); base.addColorStop(1, "#0a0518"); }
    else if (this.bg === "grid") { base.addColorStop(0, "#070512"); base.addColorStop(1, "#12061c"); }
    else { base.addColorStop(0, "#060616"); base.addColorStop(1, "#0a0414"); }
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    if (this.bg === "aurora") {
      ctx.globalCompositeOperation = "lighter";
      const cols = ["rgba(52,211,153,", "rgba(56,189,248,", "rgba(168,85,247,"];
      for (let i = 0; i < 3; i++) {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        const off = Math.sin(t * 0.25 + i) * 200;
        g.addColorStop(0, cols[i] + "0)");
        g.addColorStop(0.4 + i * 0.12, cols[i] + "0.10)");
        g.addColorStop(0.55 + i * 0.12, cols[i] + "0)");
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(Math.sin(t * 0.2 + i * 2) * 120, off);
        ctx.fillRect(-100, 0, W + 200, H);
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";
    } else if (this.bg === "grid") {
      ctx.strokeStyle = "rgba(168,85,247,0.22)";
      ctx.lineWidth = 2;
      const hor = H * 0.62;
      for (let i = 0; i <= 16; i++) {
        const x = (i / 16) * W;
        ctx.beginPath(); ctx.moveTo(x, hor); ctx.lineTo((x - W / 2) * 4 + W / 2, H); ctx.stroke();
      }
      for (let i = 0; i < 14; i++) {
        const p = ((i / 14 + (t * 0.06) % (1 / 14)) % 1);
        const y = hor + (H - hor) * (p * p);
        ctx.globalAlpha = p;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // starfield (all scenes)
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.stars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.5 * s.z + s.tw));
      const size = 1.2 + s.z * 2.4;
      ctx.globalAlpha = tw * s.z;
      ctx.fillStyle = "#dfeaff";
      ctx.fillRect(s.x, s.y, size, size);
    }
    ctx.globalAlpha = 1;
    // drifting nebula
    for (let i = 0; i < 3; i++) {
      const cx = W / 2 + Math.cos(t * 0.08 + i * 2.1) * W * 0.32;
      const cy = H * 0.4 + Math.sin(t * 0.06 + i * 1.7) * H * 0.24;
      const rad = 520 + i * 120;
      const cols = ["102,102,255", "168,85,247", "34,211,238"];
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, `rgba(${cols[i]},0.10)`);
      g.addColorStop(1, `rgba(${cols[i]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /* ── EngineAPI (used by shows) ─────────────────────────────────────────── */
  private blank(): Particle {
    return { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 4, r: 255, g: 255, b: 255, a: 1, rot: 0, vr: 0, grav: 0, drag: 0.4, shape: "dot", add: true };
  }

  emit(x: number, y: number, count: number, opts: EmitOpts = {}) {
    const [cr, cg, cb] = opts.color ?? [255, 255, 255];
    for (let i = 0; i < count; i++) {
      if (this.live >= MAX_PARTICLES) return;
      const p = this.pool[this.live++];
      const ang = (opts.angle ?? Math.random() * Math.PI * 2) + (Math.random() * 2 - 1) * (opts.spread ?? Math.PI);
      const sp = (opts.speed ?? 120) + (Math.random() * 2 - 1) * (opts.speedVar ?? (opts.speed ?? 120) * 0.5);
      p.x = x; p.y = y;
      p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
      p.max = p.life = opts.max ?? 0.8 + Math.random() * 1.2;
      p.size = opts.size ?? 3 + Math.random() * 5;
      p.r = cr; p.g = cg; p.b = cb;
      p.a = opts.a ?? 1;
      p.rot = Math.random() * Math.PI * 2;
      p.vr = opts.vr ?? (Math.random() * 2 - 1) * 4;
      p.grav = opts.grav ?? 0;
      p.drag = opts.drag ?? 0.3;
      p.shape = opts.shape ?? "dot";
      p.add = opts.add ?? true;
    }
  }

  ring(x: number, y: number, count: number, radius: number, opts: EmitOpts = {}) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.emit(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 1, { ...opts, angle: a, spread: opts.spread ?? 0.2 });
    }
  }

  shake(amount: number) { this.shakeAmt = Math.max(this.shakeAmt, amount); }
  flash(color: [number, number, number], alpha: number) { this.flashCol = color; this.flashA = Math.max(this.flashA, alpha); }
}

export function baseDuration(tier: number): number {
  return [0, 7, 11, 20, 32][tier] ?? 10;
}
