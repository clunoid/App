/**
 * Showtime asset registry — the curated professional animations the stage PLAYS
 * (it does not generate animations in code). Each gift tier maps to a **choreographed
 * show**: a timeline of cues, where each cue fires a full-screen Lottie burst at a set
 * moment. Bursts overlap and vary (asset, scale, side) so the screen stays alive and
 * evolving for a satisfying length — our edge over TikTok's ~2s gift blips. Assets are
 * bundled under /public/showtime/assets (same-origin → instant, works in OBS Chromium).
 * See that folder's README for sources/licensing. This is the POC set — the marquee
 * cinematic pieces (Lion, Universe) are the commission step.
 */
import type { Gift, Tier } from "./types";

export type AssetFit = "cover" | "contain";

/** One burst within a show's timeline. */
export type Cue = {
  src: string; // same-origin path, preloaded once
  fit: AssetFit; // cover = fill the 9:16 stage; contain = whole piece centered
  at: number; // ms after the gift lands
  scale?: number; // size multiplier
  x?: number; // horizontal offset as a fraction of width (−0.5…0.5) for spatial variety
  hold?: number; // ms to keep it alive before fading (default: its natural duration)
  speed?: number; // playback speed (default 1)
};

export type TierShow = { ms: number; cues: Cue[] };

// Asset paths + per-asset cue builders (bake in each asset's natural fit/scale).
const H = "/showtime/assets/hearts.json";
const C = "/showtime/assets/confetti.json";
const P = "/showtime/assets/popper.json";
const S = "/showtime/assets/streamers.json";

const hearts = (at: number, o: Partial<Cue> = {}): Cue => ({ src: H, fit: "contain", scale: 0.94, at, ...o });
const confetti = (at: number, o: Partial<Cue> = {}): Cue => ({ src: C, fit: "cover", at, ...o });
const popper = (at: number, o: Partial<Cue> = {}): Cue => ({ src: P, fit: "contain", scale: 1.35, at, ...o });
const streamers = (at: number, o: Partial<Cue> = {}): Cue => ({ src: S, fit: "cover", at, ...o });

/** Tier → choreographed show. Fidelity is equal across tiers (all pro assets); the
 *  tier escalates the LENGTH and SIZE of the moment. Any uncatalogued TikTok gift falls
 *  through to its coin-derived tier. Natural asset lengths: hearts 6s, confetti 3s,
 *  streamers 5s, popper 1.4s — so cues overlap to keep the stage continuously alive. */
export const TIER_SHOW: Record<Tier, TierShow> = {
  // Everyday (~9s): gentle sustained hearts, two overlapping waves.
  1: {
    ms: 9000,
    cues: [hearts(0), hearts(3000, { scale: 0.82, x: -0.12 })],
  },
  // Rare (~13s): confetti-forward with popper accents and a streamers wave.
  2: {
    ms: 13000,
    cues: [
      confetti(0),
      popper(500, { x: -0.22, scale: 1.1 }),
      popper(1000, { x: 0.22, scale: 1.1 }),
      confetti(3000),
      streamers(5000),
      confetti(7500),
      confetti(10000, { scale: 1.05 }),
    ],
  },
  // Epic (~21s): popper volleys, multiple waves, gentle hearts tail.
  3: {
    ms: 21000,
    cues: [
      popper(0, { scale: 1.5 }),
      confetti(300),
      popper(800, { x: -0.28, scale: 1.2 }),
      popper(1300, { x: 0.28, scale: 1.2 }),
      streamers(3000),
      confetti(4000),
      popper(6000, { scale: 1.5 }),
      confetti(7000),
      streamers(9000),
      confetti(11000),
      popper(13000, { x: -0.2, scale: 1.2 }),
      popper(13300, { x: 0.2, scale: 1.2 }),
      confetti(14000),
      streamers(16000),
      confetti(16500),
      hearts(17000, { scale: 1.1 }),
    ],
  },
  // Legendary (~30s): a full four-phase show — build, celebration, sustain, finale.
  4: {
    ms: 30000,
    cues: [
      // build (0–6s)
      hearts(0),
      confetti(400),
      popper(900, { x: -0.25, scale: 1.2 }),
      popper(1400, { x: 0.25, scale: 1.2 }),
      confetti(2500),
      streamers(3500),
      confetti(5000),
      // celebration (6–15s)
      popper(6000, { scale: 1.5 }),
      confetti(6500),
      popper(7000, { x: -0.3, scale: 1.1 }),
      popper(7400, { x: 0.3, scale: 1.1 }),
      streamers(8500),
      confetti(9500),
      confetti(11000),
      popper(12000, { scale: 1.5 }),
      streamers(13000),
      confetti(13500),
      // sustain (15–23s)
      confetti(15000),
      popper(15500, { x: -0.2 }),
      popper(15900, { x: 0.2 }),
      streamers(17000),
      confetti(18000),
      hearts(18500, { scale: 1.0 }),
      popper(18900, { scale: 1.4 }),
      confetti(19400, { x: -0.18 }),
      confetti(20000),
      popper(21000, { scale: 1.5 }),
      streamers(21500),
      // finale (23–30s)
      confetti(23000),
      popper(23300, { x: -0.28, scale: 1.2 }),
      popper(23600, { x: 0.28, scale: 1.2 }),
      confetti(24500),
      streamers(25000),
      confetti(26000, { scale: 1.1 }),
      hearts(26000, { scale: 1.2 }),
      popper(27000, { scale: 1.6 }),
      confetti(27500),
    ],
  },
};

/** Every distinct asset used anywhere — preload these once. */
export const ALL_SRCS: string[] = Array.from(new Set(Object.values(TIER_SHOW).flatMap((s) => s.cues.map((c) => c.src))));

export function showForGift(gift: Gift): TierShow {
  return TIER_SHOW[gift.tier];
}
