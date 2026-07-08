"use client";

/**
 * Edge prediction-video RENDERER (client). The premium two-voice audio is fetched
 * ONCE, then BOTH aspect ratios (9:16 vertical + 16:9 wide) are encoded from the
 * same mixed buffer — so ElevenLabs is billed a single time regardless of format.
 * Reuses the shared WebCodecs encoder + the graphics audio→Mp4Audio adapter; the
 * frame drawing is Edge-specific (sport backdrop, team logos, winner call,
 * karaoke captions, speaker label). No Motion-Graphics code is modified.
 */
import { aspectSize, type ReelAspect } from "@/lib/share/reel";
import { encodeCanvasToMp4Web, hasWebCodecs } from "@/lib/share/webcodecs-mp4";
import { toMp4Audio } from "@/lib/graphics/audio";
import type { Branding, VideoPlan } from "./video-types";

const ACCENT = "#34d399";
const BLUE = "#7dd3fc";
const INK = "#0a0c0d";

// friendlier on-screen tags (avoid raw betting jargon like "Draw no bet")
const MARKET_TAG: Record<string, string> = {
  "Match result": "RESULT",
  "Double chance": "SAFER PICK",
  "Draw no bet": "TO WIN",
  "Total goals": "GOALS",
  "Both teams to score": "BOTH TO SCORE",
};

type Word = { text: string; start: number; end: number };
type SceneTiming = { start: number; lineAt: number; dur: number; words: Word[] };
type Timing = { scenes: SceneTiming[]; total: number };
type Assets = { images: Map<string, HTMLImageElement> };

export type EdgeRenderResult = { portrait: Blob; landscape: Blob; hadVoice: boolean };
export type EdgeRenderOpts = { onProgress?: (pct: number, label: string) => void; signal?: AbortSignal; branding?: Branding };

const OUTRO_DUR = 2.6; // end-card seconds appended when branding is on

const LEAD = 0.18;
const TAIL = 0.45;

/* ── audio: fetch each line once, build word windows, mix to one buffer ─────── */
async function decodeB64(ac: AudioContext, b64: string): Promise<AudioBuffer | null> {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return await ac.decodeAudioData(bytes.buffer);
  } catch {
    return null;
  }
}

function wordsFrom(text: string, buf: AudioBuffer | null, chars?: string[] | null, times?: number[] | null): Word[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (chars && times && chars.length === times.length && chars.length > 3) {
    const out: Word[] = [];
    let w = "";
    let start = 0;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (/\s/.test(c)) { if (w) out.push({ text: w, start, end: times[i] ?? start + 0.3 }); w = ""; }
      else { if (!w) start = times[i] ?? 0; w += c; }
    }
    if (w) out.push({ text: w, start, end: (times[times.length - 1] ?? start) + 0.25 });
    if (out.length) return out;
  }
  if (!buf) return words.map((t, i) => ({ text: t, start: i * 0.35, end: i * 0.35 + 0.3 }));
  const dur = Math.max(0.5, buf.duration - 0.1);
  const total = words.reduce((a, b) => a + b.length + 1, 0);
  let t = 0;
  return words.map((w) => { const span = ((w.length + 1) / total) * dur; const cw = { text: w, start: t, end: t + span }; t += span; return cw; });
}

async function fetchAudio(plan: VideoPlan, ac: AudioContext, onProgress?: (d: number, n: number) => void, signal?: AbortSignal): Promise<{ bufs: (AudioBuffer | null)[]; words: Word[][] }> {
  const bufs: (AudioBuffer | null)[] = [];
  const words: Word[][] = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const s = plan.scenes[i];
    let buf: AudioBuffer | null = null;
    let chars: string[] | null = null;
    let times: number[] | null = null;
    try {
      const res = await fetch("/api/edge/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: s.line, speaker: s.speaker }), signal });
      if (res.ok) { const d = (await res.json()) as { audio?: string; chars?: string[] | null; times?: number[] | null }; if (d.audio) { buf = await decodeB64(ac, d.audio); chars = d.chars ?? null; times = d.times ?? null; } }
    } catch (e) { if ((e as Error)?.name === "AbortError") throw e; }
    bufs.push(buf);
    words.push(wordsFrom(s.line, buf, chars, times));
    onProgress?.(i + 1, plan.scenes.length);
  }
  return { bufs, words };
}

function buildTiming(plan: VideoPlan, bufs: (AudioBuffer | null)[], words: Word[][]): Timing {
  const scenes: SceneTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < plan.scenes.length; i++) {
    const d = bufs[i]?.duration ?? 2.2;
    const start = cursor;
    const lineAt = start + LEAD;
    const dur = LEAD + d + TAIL;
    scenes.push({ start, lineAt, dur, words: words[i] });
    cursor += dur;
  }
  return { scenes, total: Math.max(1, cursor) };
}

/* A smooth, cool music bed: a warm detuned pad over an A-minor progression, a soft
 * sub-bass pulse and a mellow kick — cinematic but understated, fitting for hype
 * sports-prediction clips. Fully synthesised (royalty-free). */
function buildBed(off: OfflineAudioContext, dest: AudioNode, total: number) {
  const BPM = 84, beat = 60 / BPM, bar = beat * 4;
  // Am – F – C – G, one bar each
  const chords = [
    { root: 55.0, tones: [220.0, 261.63, 329.63] },
    { root: 43.65, tones: [174.61, 220.0, 261.63] },
    { root: 65.41, tones: [261.63, 329.63, 392.0] },
    { root: 49.0, tones: [196.0, 246.94, 293.66] },
  ];
  const pad = off.createGain(); pad.gain.value = 0.05; pad.connect(dest);
  const bass = off.createGain(); bass.gain.value = 0.16; bass.connect(dest);
  const kick = off.createGain(); kick.gain.value = 0.55; kick.connect(dest);
  let bi = 0;
  for (let t0 = 0; t0 < total; t0 += bar, bi++) {
    const ch = chords[bi % chords.length];
    const dur = Math.min(bar, total - t0) + 0.4;
    // pad — soft detuned sines that swell in and out
    for (const f of ch.tones) for (const det of [-5, 5]) {
      const o = off.createOscillator(); o.type = "sine"; o.frequency.value = f; o.detune.value = det;
      const g = off.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(1, t0 + 0.6);
      g.gain.setValueAtTime(1, t0 + dur - 0.6);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      o.connect(g).connect(pad); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    // sub-bass + soft kick on beats 1 & 3
    for (const b of [0, 2]) {
      const ts = t0 + b * beat; if (ts >= total) break;
      const bo = off.createOscillator(); bo.type = "sine"; bo.frequency.value = ch.root;
      const bg = off.createGain();
      bg.gain.setValueAtTime(0.0001, ts);
      bg.gain.linearRampToValueAtTime(1, ts + 0.03);
      bg.gain.exponentialRampToValueAtTime(0.001, ts + beat * 0.95);
      bo.connect(bg).connect(bass); bo.start(ts); bo.stop(ts + beat);
      const ko = off.createOscillator(); ko.type = "sine";
      ko.frequency.setValueAtTime(115, ts);
      ko.frequency.exponentialRampToValueAtTime(45, ts + 0.13);
      const kg = off.createGain();
      kg.gain.setValueAtTime(0.0001, ts);
      kg.gain.exponentialRampToValueAtTime(1, ts + 0.006);
      kg.gain.exponentialRampToValueAtTime(0.001, ts + 0.2);
      ko.connect(kg).connect(kick); ko.start(ts); ko.stop(ts + 0.28);
    }
  }
}

async function mixAudio(plan: VideoPlan, bufs: (AudioBuffer | null)[], timing: Timing, total: number): Promise<AudioBuffer | null> {
  try {
    const SR = 48000;
    const OfflineCtor = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const off = new OfflineCtor(2, Math.ceil(total * SR), SR);
    const master = off.createGain();
    master.gain.value = 1;
    // gentle limiter so bed + voice never clip
    const limiter = off.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 6; limiter.ratio.value = 8; limiter.attack.value = 0.004; limiter.release.value = 0.2;
    master.connect(limiter).connect(off.destination);

    // music bed → warm lowpass → master, with a level envelope that ducks under speech
    const bed = off.createGain();
    const BASE = 0.1, DUCK = 0.055;
    bed.gain.setValueAtTime(BASE, 0);
    const warm = off.createBiquadFilter(); warm.type = "lowpass"; warm.frequency.value = 1900; warm.Q.value = 0.5;
    bed.connect(warm).connect(master);
    buildBed(off, bed, total);
    for (let i = 0; i < bufs.length; i++) {
      const b = bufs[i]; if (!b) continue;
      const s = timing.scenes[i].lineAt, e = s + b.duration;
      bed.gain.setValueAtTime(BASE, Math.max(0, s - 0.22));
      bed.gain.linearRampToValueAtTime(DUCK, Math.max(0.001, s - 0.05));
      bed.gain.setValueAtTime(DUCK, e + 0.04);
      bed.gain.linearRampToValueAtTime(BASE, e + 0.3);
    }

    // voices sit on top of the bed, unducked
    for (let i = 0; i < bufs.length; i++) {
      const buf = bufs[i];
      if (!buf) continue;
      const src = off.createBufferSource();
      src.buffer = buf;
      src.connect(master);
      src.start(timing.scenes[i].lineAt);
    }
    return await off.startRendering();
  } catch {
    return null;
  }
}

/* ── assets ───────────────────────────────────────────────────────────────── */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => { const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = url; });
}
async function loadAssets(plan: VideoPlan, branding?: Branding): Promise<Assets> {
  const urls = new Set<string>();
  for (const m of plan.matches) { if (m.bgImage) urls.add(m.bgImage); if (m.homeLogo) urls.add(m.homeLogo); if (m.awayLogo) urls.add(m.awayLogo); }
  if (branding?.enabled && branding.logo) urls.add(branding.logo);
  const images = new Map<string, HTMLImageElement>();
  await Promise.all([...urls].map(async (u) => { const img = await loadImage(u); if (img) images.set(u, img); }));
  return { images };
}

/* ── frame drawing ────────────────────────────────────────────────────────── */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const ir = img.width / img.height, cr = W / H;
  let dw = W, dh = H, dx = 0, dy = 0;
  if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; } else { dw = W; dh = W / ir; dy = (H - dh) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}
function drawLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined, cx: number, cy: number, size: number) {
  if (img) { const s = size, r = ir(img); let w = s, h = s; if (r > 1) h = s / r; else w = s * r; ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h); }
  else { ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2); ctx.fill(); }
}
const ir = (img: HTMLImageElement) => (img.width && img.height ? img.width / img.height : 1);

function easeIO(x: number) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

function drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number, plan: VideoPlan, timing: Timing, assets: Assets, t: number, branding: Branding | undefined, outroStart: number) {
  const portrait = H > W;
  // branded end card on the tail
  if (branding?.enabled && t >= outroStart) { drawOutro(ctx, W, H, branding, branding.logo ? assets.images.get(branding.logo) : undefined, t - outroStart); return; }
  // scene at t
  let si = 0;
  for (let i = 0; i < timing.scenes.length; i++) if (t >= timing.scenes[i].start - 1e-6) si = i;
  const st = timing.scenes[si];
  const scene = plan.scenes[si];
  const local = t - st.start;
  const m = scene.matchIndex >= 0 ? plan.matches[scene.matchIndex] : undefined;

  // start of the MATCH block this scene belongs to → team art, league chip and the
  // prediction banner animate in ONCE per match and stay steady when the speaker
  // changes (stops the logos "blinking" on every new line)
  let matchStartIdx = si;
  if (m) for (let k = 0; k < plan.scenes.length; k++) if (plan.scenes[k].matchIndex === scene.matchIndex) { matchStartIdx = k; break; }
  const matchLocal = m ? t - timing.scenes[matchStartIdx].start : local;

  // background
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const bg = m?.bgImage ? assets.images.get(m.bgImage) : undefined;
  if (bg) { ctx.save(); ctx.globalAlpha = 0.55; drawCover(ctx, bg, W, H); ctx.restore(); }
  // legibility gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(10,12,13,0.72)");
  grad.addColorStop(0.42, "rgba(10,12,13,0.35)");
  grad.addColorStop(1, "rgba(10,12,13,0.94)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // emerald top glow
  const gg = ctx.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, H * 0.7);
  gg.addColorStop(0, "rgba(52,211,153,0.16)");
  gg.addColorStop(1, "rgba(52,211,153,0)");
  ctx.fillStyle = gg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const S = Math.min(W, H); // scale unit
  const fadeIn = Math.min(1, local / 0.4);
  const appear = m ? Math.min(1, matchLocal / 0.4) : fadeIn; // per-match fade, steady across speaker changes
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (!m) {
    // intro / outro title card
    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.fillStyle = ACCENT;
    ctx.font = `800 ${S * 0.05}px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillText("EDGE", cx, H * 0.34);
    ctx.fillStyle = "#f3f6f4";
    ctx.font = `700 ${S * 0.085}px "Space Grotesk", system-ui, sans-serif`;
    wrapText(ctx, plan.title, cx, H * 0.46, W * 0.86, S * 0.1);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `500 ${S * 0.032}px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillText("AI match predictions", cx, H * 0.6);
    ctx.restore();
  } else {
    // league chip
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.font = `600 ${S * 0.03}px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`${m.leagueEmoji || "🏆"}  ${m.league || m.sport}`.toUpperCase(), cx, H * (portrait ? 0.12 : 0.1));
    ctx.restore();

    // teams
    const logoSize = S * (portrait ? 0.23 : 0.24);
    const enter = easeIO(Math.min(1, matchLocal / 0.5));
    const homeIsWinner = m.winner === m.home;
    if (portrait) {
      const y1 = H * 0.28, y2 = H * 0.55;
      drawTeam(ctx, assets.images.get(m.homeLogo || ""), m.home, cx, y1, logoSize, enter, homeIsWinner ? ACCENT : "#f3f6f4", homeIsWinner);
      // VS sits in the clear gap between the top team's name and the bottom logo
      const vsY = (y1 + logoSize * 0.86 + (y2 - logoSize * 0.5)) / 2;
      ctx.save();
      ctx.globalAlpha = enter;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `800 ${S * 0.045}px "Space Grotesk", system-ui, sans-serif`;
      ctx.fillText("VS", cx, vsY);
      ctx.restore();
      drawTeam(ctx, assets.images.get(m.awayLogo || ""), m.away, cx, y2, logoSize, enter, !homeIsWinner ? BLUE : "#f3f6f4", !homeIsWinner);
    } else {
      const xl = W * 0.28, xr = W * 0.72, y = H * 0.42;
      drawTeam(ctx, assets.images.get(m.homeLogo || ""), m.home, xl, y, logoSize, enter, homeIsWinner ? ACCENT : "#f3f6f4", homeIsWinner);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `800 ${S * 0.06}px "Space Grotesk", system-ui, sans-serif`;
      ctx.fillText("VS", cx, y);
      drawTeam(ctx, assets.images.get(m.awayLogo || ""), m.away, xr, y, logoSize, enter, !homeIsWinner ? BLUE : "#f3f6f4", !homeIsWinner);
    }

    // pick banner (appears a beat in, then holds steady for the whole match)
    const showPick = matchLocal > 0.5;
    if (showPick) {
      const pa = Math.min(1, (matchLocal - 0.5) / 0.4);
      ctx.save();
      ctx.globalAlpha = pa;
      const by = H * (portrait ? 0.72 : 0.72);
      const bw = Math.min(W * 0.9, S * 1.5), bh = S * (portrait ? 0.13 : 0.16);
      roundRect(ctx, cx - bw / 2, by - bh / 2, bw, bh, bh * 0.28);
      ctx.fillStyle = "rgba(52,211,153,0.14)";
      ctx.fill();
      ctx.strokeStyle = "rgba(52,211,153,0.5)";
      ctx.lineWidth = Math.max(1, S * 0.002);
      ctx.stroke();
      ctx.fillStyle = ACCENT;
      ctx.font = `700 ${S * 0.023}px "Space Grotesk", system-ui, sans-serif`;
      const tag = m.pickMarket ? (MARKET_TAG[m.pickMarket] || m.pickMarket.toUpperCase()) : "";
      ctx.fillText(`PREDICTION${tag ? "  ·  " + tag : ""}`, cx, by - bh * 0.28);
      ctx.fillStyle = "#f3f6f4";
      const pickText = `${m.pick}  ·  ${(m.pickProb * 100).toFixed(0)}%`;
      let fs = S * 0.05;
      ctx.font = `800 ${fs}px "Space Grotesk", system-ui, sans-serif`;
      while (ctx.measureText(pickText).width > bw * 0.9 && fs > S * 0.028) { fs -= S * 0.003; ctx.font = `800 ${fs}px "Space Grotesk", system-ui, sans-serif`; }
      ctx.fillText(pickText, cx, by + bh * 0.18);
      ctx.restore();
    }
  }

  // caption (karaoke) + speaker label
  drawCaption(ctx, W, H, st, local, scene.speaker, S, portrait);

  // brand watermark throughout (a small corner tag)
  if (branding?.enabled && branding.placement === "throughout") drawWatermark(ctx, W, H, branding, branding.logo ? assets.images.get(branding.logo) : undefined);
}

/* ── branding ─────────────────────────────────────────────────────────────── */
function drawOutro(ctx: CanvasRenderingContext2D, W: number, H: number, branding: Branding, logo: HTMLImageElement | undefined, local: number) {
  const S = Math.min(W, H), cx = W / 2;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const gg = ctx.createRadialGradient(cx, H * 0.44, 0, cx, H * 0.44, S * 0.95);
  gg.addColorStop(0, "rgba(52,211,153,0.18)");
  gg.addColorStop(1, "rgba(52,211,153,0)");
  ctx.fillStyle = gg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = Math.min(1, local / 0.4);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let cy = H * (logo ? 0.4 : 0.47);
  if (logo) { drawLogo(ctx, logo, cx, cy, S * 0.2); cy += S * 0.19; }
  ctx.fillStyle = "#f3f6f4";
  ctx.font = `800 ${S * 0.058}px "Space Grotesk", system-ui, sans-serif`;
  wrapText(ctx, branding.tagline || branding.name || "clunoid.com", cx, cy, W * 0.84, S * 0.072);
  ctx.strokeStyle = "rgba(52,211,153,0.85)";
  ctx.lineWidth = Math.max(2, S * 0.006);
  ctx.beginPath();
  ctx.moveTo(cx - S * 0.055, cy + S * 0.075);
  ctx.lineTo(cx + S * 0.055, cy + S * 0.075);
  ctx.stroke();
  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number, branding: Branding, logo: HTMLImageElement | undefined) {
  const S = Math.min(W, H), pad = S * 0.05;
  const text = (branding.name || branding.tagline || "").trim();
  if (!text && !logo) return;
  const y = branding.corner === "top" ? pad : H - pad;
  ctx.save();
  ctx.globalAlpha = 0.66;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.font = `600 ${S * 0.022}px "Space Grotesk", system-ui, sans-serif`;
  const rx = W - pad;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  if (text) ctx.fillText(text, rx, y);
  if (logo) { const ls = S * 0.05; const tw = text ? ctx.measureText(text).width + S * 0.02 : 0; drawLogo(ctx, logo, rx - tw - ls / 2, y, ls); }
  ctx.restore();
}

function drawTeam(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | undefined, name: string, cx: number, cy: number, size: number, enter: number, color: string, isWinner: boolean) {
  ctx.save();
  ctx.globalAlpha = enter;
  const s = Math.min(size, size * (0.85 + 0.15 * enter));
  if (isWinner) { ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = size * 0.35; drawLogo(ctx, logo, cx, cy, s); ctx.restore(); }
  drawLogo(ctx, logo, cx, cy, s);
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.font = `700 ${size * 0.17}px "Space Grotesk", system-ui, sans-serif`;
  ctx.fillText(name.length > 18 ? name.slice(0, 17) + "…" : name, cx, cy + size * 0.68);
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, W: number, H: number, st: SceneTiming, local: number, speaker: "a" | "b", S: number, portrait: boolean) {
  const rel = local - LEAD;
  const words = st.words;
  if (!words.length) return;
  const y = H * (portrait ? 0.88 : 0.9);
  ctx.textAlign = "center";
  // measure the caption block first so the speaker label can sit safely above it
  ctx.font = `700 ${S * 0.036}px "Space Grotesk", system-ui, sans-serif`;
  const maxW = W * 0.88;
  const lines = wrapWords(ctx, words, maxW);
  const lineH = S * 0.05;
  let ly = y - ((lines.length - 1) * lineH) / 2;
  // speaker label — a fixed gap ABOVE the first caption line, so it never overlaps
  // the text no matter how many lines the caption wraps to
  const who = speaker === "a" ? "ISAAC" : "MATILDA";
  const wc = speaker === "a" ? ACCENT : BLUE;
  ctx.fillStyle = wc;
  ctx.font = `700 ${S * 0.024}px "Space Grotesk", system-ui, sans-serif`;
  ctx.fillText(who, W / 2, ly - lineH * 0.7);
  // words with karaoke highlight
  ctx.font = `700 ${S * 0.036}px "Space Grotesk", system-ui, sans-serif`;
  for (const line of lines) {
    let lw = 0;
    for (const w of line) lw += ctx.measureText(w.text + " ").width;
    let x = W / 2 - lw / 2;
    for (const w of line) {
      const on = rel >= w.start - 0.05;
      ctx.fillStyle = on ? "#ffffff" : "rgba(255,255,255,0.4)";
      ctx.textAlign = "left";
      ctx.fillText(w.text, x, ly);
      x += ctx.measureText(w.text + " ").width;
    }
    ly += lineH;
  }
}

function wrapWords(ctx: CanvasRenderingContext2D, words: Word[], maxW: number): Word[][] {
  const lines: Word[][] = [];
  let cur: Word[] = [];
  let w = 0;
  for (const word of words) {
    const ww = ctx.measureText(word.text + " ").width;
    if (w + ww > maxW && cur.length) { lines.push(cur); cur = []; w = 0; }
    cur.push(word);
    w += ww;
  }
  if (cur.length) lines.push(cur);
  return lines.slice(0, 3);
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, lineH: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) { const test = cur ? cur + " " + word : word; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = word; } else cur = test; }
  if (cur) lines.push(cur);
  let y = cy - ((lines.length - 1) * lineH) / 2;
  for (const l of lines) { ctx.fillText(l, cx, y); y += lineH; }
}

/* ── orchestration: one audio, two encodes ────────────────────────────────── */
export async function renderEdgeVideos(plan: VideoPlan, opts: EdgeRenderOpts = {}): Promise<EdgeRenderResult> {
  const { onProgress, signal, branding } = opts;
  const prog = (p: number, l: string) => onProgress?.(p, l);
  const abort = () => { if (signal?.aborted) throw new DOMException("aborted", "AbortError"); };
  if (!hasWebCodecs()) { const e = new Error("Video creation needs Chrome or Edge on a computer."); e.name = "FriendlyError"; throw e; }

  prog(3, "Loading media…");
  const assets = await loadAssets(plan, branding);
  abort();

  prog(8, "Voicing the hosts…");
  const ACtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new ACtor();
  let bufs: (AudioBuffer | null)[], words: Word[][];
  try {
    ({ bufs, words } = await fetchAudio(plan, ac, (d, n) => prog(8 + Math.round((d / n) * 22), "Voicing the hosts…"), signal));
  } finally { try { await ac.close(); } catch { /* ignore */ } }
  abort();
  const hadVoice = bufs.some(Boolean);
  const timing = buildTiming(plan, bufs, words);
  const outroStart = timing.total;
  const fullDur = timing.total + (branding?.enabled ? OUTRO_DUR : 0);

  prog(32, "Mixing audio…");
  const mixed = await mixAudio(plan, bufs, timing, fullDur);
  abort();

  const bitrate = 9_000_000;
  const encodeOne = async (aspect: ReelAspect, band: [number, number]): Promise<Blob> => {
    const { w: W, h: H } = aspectSize(aspect);
    const res = await encodeCanvasToMp4Web({
      W, H, fps: 30, durationSec: fullDur,
      drawFrame: (ctx, t) => drawFrame(ctx as CanvasRenderingContext2D, W, H, plan, timing, assets, t, branding, outroStart),
      audio: toMp4Audio(mixed),
      onProgress: (p) => prog(Math.round(band[0] + (p / 100) * (band[1] - band[0])), aspect === "9:16" ? "Encoding vertical…" : "Encoding wide…"),
      signal, bitrate,
    });
    return res.blob;
  };
  // SAME mixed audio → two encodes (premium voices used once)
  const portrait = await encodeOne("9:16", [34, 67]);
  abort();
  const landscape = await encodeOne("16:9", [67, 100]);
  prog(100, "Done");
  return { portrait, landscape, hadVoice };
}
