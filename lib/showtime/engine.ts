import type { GiftEvent } from "./types";

/**
 * Showtime stage — NEUTRAL placeholder. The old procedural animation engine (and its
 * shows/background) was removed; the visual system is being re-planned around
 * professionally-made animation assets (Lottie / Rive / alpha-video) rather than
 * code-generated particles. For now the stage is a clean dark slate that still
 * receives gifts (so the gifter banner, leaderboard and live feed all work) — the
 * animations plug in here next.
 */
type Banner = { sender: string; emoji: string; name: string; count: number; tier: number } | null;

export class ShowtimeEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private dpr = 1;
  private lastGift = -1e9;

  onBanner: (b: Banner) => void = () => {};
  onIdle: (idle: boolean) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }

  start() {
    if (this.raf) return;
    const loop = () => {
      this.render();
      this.onIdle(performance.now() - this.lastGift > 3500);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round((r.width || 360) * this.dpr);
    this.canvas.height = Math.round((r.height || 640) * this.dpr);
  }

  trigger(ev: GiftEvent) {
    this.lastGift = performance.now();
    this.onBanner({ sender: ev.sender, emoji: ev.gift.emoji, name: ev.gift.name, count: ev.count, tier: ev.gift.tier });
  }

  private render() {
    const { ctx, canvas } = this;
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#0a0b12");
    g.addColorStop(1, "#05060b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}
