import type { EngineAPI, Show, ShowArchetype } from "./types";

/* ── helpers ───────────────────────────────────────────────────────────────── */
type RGB = [number, number, number];
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeIn = (x: number) => x * x * x;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pick = (t: RGB[]) => t[(Math.random() * t.length) | 0];
/** deterministic per-frame count from a rate (particles/sec) */
const rate = (r: number, dt: number) => { const n = r * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };

function drawEmoji(E: EngineAPI, emoji: string, x: number, y: number, size: number, alpha: number, glow: RGB) {
  const ctx = E.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, `rgba(${glow[0]},${glow[1]},${glow[2]},0.55)`);
  g.addColorStop(1, `rgba(${glow[0]},${glow[1]},${glow[2]},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - size, y - size, size * 2, size * 2);
  ctx.globalCompositeOperation = "source-over";
  ctx.font = `${size * 0.9}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, x, y);
  ctx.restore();
}

function drawRing(E: EngineAPI, x: number, y: number, radius: number, width: number, rgb: RGB, alpha: number, squash = 1) {
  const ctx = E.ctx;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  ctx.scale(1, squash);
  ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawPlanet(E: EngineAPI, x: number, y: number, r: number, rgb: RGB, ring: boolean, alpha: number) {
  const ctx = E.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  const gl = ctx.createRadialGradient(x, y, 0, x, y, r * 1.9);
  gl.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.4)`);
  gl.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = gl;
  ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
  ctx.globalCompositeOperation = "source-over";
  const bg = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  bg.addColorStop(0, `rgb(${Math.min(255, rgb[0] + 70)},${Math.min(255, rgb[1] + 70)},${Math.min(255, rgb[2] + 70)})`);
  bg.addColorStop(0.7, `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
  bg.addColorStop(1, `rgb(${(rgb[0] * 0.28) | 0},${(rgb[1] * 0.28) | 0},${(rgb[2] * 0.28) | 0})`);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (ring) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.45);
    ctx.scale(1, 0.32);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`;
    ctx.lineWidth = r * 0.13;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.65, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

type ArchImpl = { update: (s: Show, E: EngineAPI, dt: number) => void; render: (s: Show, E: EngineAPI) => void };

/* ── BLOOM — gentle, radiant (roses, hearts) ───────────────────────────────── */
const bloom: ArchImpl = {
  update(s, E, dt) {
    const cx = E.W / 2, cy = E.H * 0.42;
    const inten = s.intensity;
    if (s.t < dt * 1.5) {
      E.emit(cx, cy, 60 * inten, { color: s.theme[0], speed: 520, speedVar: 300, max: 1.6, size: 7, drag: 1.6, add: true });
      E.emit(cx, cy, 44 * inten, { color: s.theme[1] ?? s.theme[0], speed: 360, speedVar: 200, max: 2.4, size: 11, shape: "petal", add: false, grav: 130, drag: 0.4 });
      E.flash(s.theme[0], 0.32);
    }
    if (s.t < s.dur - 1.3) {
      const n = rate(24 * inten, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        E.emit(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44, 1, { color: pick(s.theme), angle: a, spread: 0.25, speed: 160 + Math.random() * 180, max: 1.9, size: 4 + Math.random() * 5, drag: 0.9, add: true });
        if (Math.random() < 0.5) E.emit(cx, cy, 1, { color: s.theme[1] ?? s.theme[0], angle: a, spread: 0.2, speed: 130, max: 2.8, size: 13, shape: "petal", add: false, grav: 90, drag: 0.3, vr: (Math.random() * 2 - 1) * 3 });
      }
    }
  },
  render(s, E) {
    const cx = E.W / 2, cy = E.H * 0.42;
    const pop = easeOut(clamp01(s.t / 0.5));
    const pulse = 1 + 0.06 * Math.sin(s.t * 4);
    const fade = s.t > s.dur - 1.3 ? clamp01((s.dur - s.t) / 1.3) : 1;
    drawEmoji(E, s.ev.gift.emoji, cx, cy, 250 * pop * pulse * (0.7 + 0.3 * fade), fade, s.theme[0]);
  },
};

/* ── PORTAL — a ring opens, energy swirls and surges (rocket, confetti) ─────── */
const portal: ArchImpl = {
  update(s, E, dt) {
    const cx = E.W / 2, cy = E.H * 0.44;
    const inten = s.intensity;
    const surge = s.dur - 3.2;
    if (s.t < 0.05) E.flash(s.theme[0], 0.4);
    if (s.t < surge) {
      // inward swirl
      const n = rate(46 * inten, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const rad = 360 + Math.random() * 300;
        E.emit(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 1, { color: pick(s.theme), angle: a + Math.PI + 0.9, spread: 0.15, speed: 260 + Math.random() * 200, max: 1.6, size: 4 + Math.random() * 4, drag: 0.2, add: true });
      }
    } else if (s.t < s.dur - 0.6) {
      // SURGE outward toward the viewer
      if (s.s.surged !== 1) { s.s.surged = 1; E.flash([255, 255, 255], 0.6); E.shake(22 + inten * 4); }
      const n = rate(150 * inten, dt);
      E.emit(cx, cy, n, { color: pick(s.theme), speed: 900, speedVar: 500, max: 1.2, size: 6, drag: 0.9, add: true });
      if (Math.random() < 0.4) E.emit(cx, cy, 6, { color: pick(s.theme), speed: 500, speedVar: 300, max: 1.6, size: 10, shape: "star", add: false, grav: 200, vr: 6 });
    }
  },
  render(s, E) {
    const cx = E.W / 2, cy = E.H * 0.44;
    const open = easeOut(clamp01(s.t / 1.4));
    const fade = s.t > s.dur - 1 ? clamp01((s.dur - s.t) / 1) : 1;
    const r = 90 + open * 230 + Math.sin(s.t * 3) * 10;
    drawRing(E, cx, cy, r, 26 * fade, s.theme[0], 0.8 * fade);
    drawRing(E, cx, cy, r * 0.68, 14 * fade, s.theme[1] ?? s.theme[0], 0.7 * fade);
    // bright core
    const ctx = E.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.8);
    g.addColorStop(0, `rgba(255,255,255,${0.5 * fade})`);
    g.addColorStop(0.4, `rgba(${s.theme[0][0]},${s.theme[0][1]},${s.theme[0][2]},${0.35 * fade})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    drawEmoji(E, s.ev.gift.emoji, cx, cy, 150 * open, fade, s.theme[0]);
  },
};

/* ── COSMIC — the multi-stage showpiece (galaxy, universe, thunder) ─────────── */
const cosmic: ArchImpl = {
  update(s, E, dt) {
    const cx = E.W / 2, cy = E.H * 0.42;
    const inten = s.intensity;
    const T = s.dur;
    const warpEnd = 6, superStart = T - 6, fadeStart = T - 2;
    if (s.t < 0.06) E.flash(s.theme[0], 0.5);
    // Stage: OPEN + WARP (starfield flying at the camera)
    if (s.t < warpEnd) {
      const n = rate(90 * inten, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        E.emit(cx, cy, 1, { color: Math.random() < 0.5 ? [255, 255, 255] : pick(s.theme), angle: a, spread: 0.02, speed: 700 + Math.random() * 900, max: 1.3, size: 3 + Math.random() * 3, drag: 0, add: true });
      }
      if (s.t < 0.1) E.shake(16);
    }
    // Stage: REVEAL (orbiting particles around the planet)
    else if (s.t < superStart) {
      const n = rate(40 * inten, dt);
      for (let i = 0; i < n; i++) {
        const a = s.t * 1.4 + Math.random() * Math.PI * 2;
        const rad = 300 + Math.random() * 120;
        E.emit(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.4, 1, { color: pick(s.theme), angle: a + Math.PI / 2, spread: 0.1, speed: 120, max: 2, size: 4 + Math.random() * 4, drag: 0.4, add: true });
      }
    }
    // Stage: SUPERNOVA
    else if (s.t < fadeStart) {
      if (s.s.nova !== 1) { s.s.nova = 1; E.flash([255, 255, 255], 0.85); E.shake(34 + inten * 6); }
      const n = rate(220 * inten, dt);
      E.emit(cx, cy, n, { color: pick(s.theme), speed: 1100, speedVar: 700, max: 1.4, size: 6, drag: 0.7, add: true });
    }
  },
  render(s, E) {
    const cx = E.W / 2, cy = E.H * 0.42;
    const T = s.dur;
    const superStart = T - 6, fadeStart = T - 2;
    const fade = s.t > fadeStart ? clamp01((T - s.t) / 2) : 1;
    // portal ring during open
    if (s.t < 6) {
      const open = easeOut(clamp01(s.t / 1.6));
      drawRing(E, cx, cy, 60 + open * 200, 22, s.theme[0], 0.7 * (1 - clamp01((s.t - 4) / 2)));
    }
    // planet during reveal
    if (s.t > 4 && s.t < superStart + 1) {
      const grow = easeOut(clamp01((s.t - 4) / 2.5));
      const shrink = s.t > superStart ? clamp01((superStart + 1 - s.t) / 1) : 1;
      drawPlanet(E, cx, cy, 210 * grow * shrink, s.theme[1] ?? s.theme[0], true, fade);
    }
    // title-ish gift glow
    if (fade < 1) drawEmoji(E, s.ev.gift.emoji, cx, cy, 200 * fade, fade, s.theme[0]);
  },
};

/* ── BEAST — a luminous creature charges across the screen (lion, phoenix) ──── */
const beast: ArchImpl = {
  update(s, E, dt) {
    const inten = s.intensity;
    const T = s.dur;
    const cross = Math.min(1, s.t / (T * 0.55)); // travel progress
    const x = -150 + cross * (E.W + 300);
    const y = E.H * 0.44 + Math.sin(s.t * 3) * 60;
    if (s.t < 0.06) E.flash(s.theme[0], 0.35);
    // charge trail (only while crossing)
    if (cross < 1) {
      const n = rate(120 * inten, dt);
      E.emit(x, y, n, { color: pick(s.theme), angle: Math.PI, spread: 0.6, speed: 220, speedVar: 160, max: 1.1, size: 5 + Math.random() * 5, drag: 0.8, grav: 60, add: true });
      // glowing footprints
      if (rate(6, dt) > 0) E.emit(x - 40, E.H * 0.6, 1, { color: s.theme[1] ?? s.theme[0], speed: 20, max: 1.6, size: 22, drag: 0.5, add: true });
    } else {
      // ROAR / land
      if (s.s.roar !== 1) { s.s.roar = 1; E.flash([255, 255, 255], 0.7); E.shake(30 + inten * 6); E.ring(E.W / 2, E.H * 0.44, 60, 40, { color: s.theme[0], speed: 700, max: 1, size: 8, add: true }); }
      const n = rate(50 * inten, dt);
      E.emit(E.W / 2, E.H * 0.44, n, { color: pick(s.theme), speed: 400, speedVar: 300, max: 1.6, size: 6, drag: 0.9, grav: 120, add: true });
    }
    s.s.x = x; s.s.y = y;
  },
  render(s, E) {
    const T = s.dur;
    const cross = Math.min(1, s.t / (T * 0.55));
    const fade = s.t > T - 1.4 ? clamp01((T - s.t) / 1.4) : 1;
    const x = cross < 1 ? (s.s.x ?? E.W / 2) : E.W / 2;
    const y = cross < 1 ? (s.s.y ?? E.H * 0.44) : E.H * 0.44;
    const size = (cross < 1 ? 220 : 340 * easeOut(clamp01((s.t - T * 0.55) / 0.6))) * fade;
    // motion-stretched glow behind
    drawEmoji(E, s.ev.gift.emoji, x, y, Math.max(40, size), fade, s.theme[0]);
  },
};

export const ARCH: Record<ShowArchetype, ArchImpl> = { bloom, portal, cosmic, beast };
