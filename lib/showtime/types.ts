/**
 * Showtime — Clunoid's live, gift-reactive animation stage (admin-only for now).
 * Shared, engine-agnostic types. The renderer (lib/showtime/engine.ts) implements
 * EngineAPI; the choreographed shows (lib/showtime/shows.ts) drive it through that
 * interface, so the orchestration never depends on the concrete renderer and we can
 * upgrade to a WebGL/3D layer later without touching the show library.
 */

export type Tier = 1 | 2 | 3 | 4;
export type ShowArchetype = "bloom" | "portal" | "cosmic" | "beast";

/** A TikTok gift mapped to a choreographed show. `theme` are hex colors the show
 *  tints itself with, so one archetype yields infinite on-brand variations. */
export type Gift = {
  id: string;
  name: string;
  emoji: string;
  coins: number; // TikTok coin value — drives the tier
  tier: Tier;
  archetype: ShowArchetype;
  theme: string[]; // 2–3 hex colors
};

/** One received gift (or a simulated one) ready to be staged. */
export type GiftEvent = { gift: Gift; sender: string; count: number; ts: number };

/** A soft-particle the engine pools and draws. */
export type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  size: number; r: number; g: number; b: number; a: number;
  rot: number; vr: number;
  grav: number; drag: number;
  shape: "dot" | "spark" | "petal" | "star" | "ring";
  add: boolean; // additive (glow) vs normal
};

export type EmitOpts = Partial<Omit<Particle, "x" | "y">> & {
  color?: [number, number, number];
  spread?: number; // velocity cone half-angle (rad)
  angle?: number; // base direction (rad)
  speed?: number; // base speed
  speedVar?: number;
};

/** What a choreographed show can ask of the renderer. Kept small + renderer-agnostic. */
export interface EngineAPI {
  readonly W: number; // logical width (1080)
  readonly H: number; // logical height (1920)
  readonly ctx: CanvasRenderingContext2D;
  readonly time: number; // seconds since engine start
  emit(x: number, y: number, count: number, opts?: EmitOpts): void;
  ring(x: number, y: number, count: number, radius: number, opts?: EmitOpts): void;
  shake(amount: number): void;
  flash(color: [number, number, number], alpha: number): void;
  /** convert a 0..1 hex theme color to rgb triplet */
}

/** A running show instance the orchestrator ticks each frame. */
export type Show = {
  ev: GiftEvent;
  arch: ShowArchetype;
  tier: Tier;
  theme: [number, number, number][]; // parsed rgb
  t: number; // elapsed seconds
  dur: number; // total seconds (extended by combos)
  intensity: number; // 1..N, grows with combos
  stage: number; // multi-stage cursor (cosmic)
  seed: number;
  s: Record<string, number>; // scratch state per show
};
