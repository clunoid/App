/**
 * Showtime — Clunoid's live, gift-reactive animation stage (admin-only for now).
 * Shared types. The renderer is a real WebGL/Three.js engine (lib/showtime/engine.ts,
 * HDR bloom + 3D particles + camera choreography); the choreographed shows
 * (lib/showtime/shows.ts) drive it through the Stage3D interface, so the show library
 * builds its own 3D objects while the engine owns the renderer, particles and post-FX.
 */
import type * as THREE from "three";

export type Tier = 1 | 2 | 3 | 4;
export type ShowArchetype = "bloom" | "portal" | "cosmic" | "beast";
export type RGB = [number, number, number];

/** A TikTok gift mapped to a choreographed show. `theme` are hex colors the show
 *  tints itself with, so one archetype yields infinite on-brand variations. */
export type Gift = {
  id: string;
  name: string;
  emoji: string;
  coins: number; // TikTok coin value — drives the tier
  tier: Tier;
  archetype: ShowArchetype;
  theme: string[]; // 2–4 hex colors
};

/** One received gift (or a simulated one) ready to be staged. */
export type GiftEvent = { gift: Gift; sender: string; count: number; ts: number };

/** Particle emission options (world-space). */
export type EmitOpts = {
  color?: RGB;
  dir?: [number, number, number]; // base direction (normalised-ish)
  spread?: number; // cone half-angle (rad) around dir
  speed?: number;
  speedVar?: number;
  size?: number;
  sizeVar?: number;
  life?: number;
  lifeVar?: number;
  grav?: number; // world units/s² on -y
  drag?: number; // per-second velocity damping
  spin?: boolean; // slight swirl
};

/** What a choreographed 3D show can ask of the engine. The engine implements this;
 *  shows also build their own THREE objects into the group the engine gives them. */
export interface Stage3D {
  readonly time: number;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly soft: THREE.Texture; // soft round additive sprite
  emit(x: number, y: number, z: number, count: number, opts?: EmitOpts): void;
  flash(rgb: RGB, strength: number): void;
  shake(amount: number): void;
  dolly(z: number, ease?: number): void; // push/pull the camera toward a target z
  emojiSprite(emoji: string, color: RGB): THREE.Sprite; // a glowing billboard of the gift
}

/** A running show the orchestrator ticks each frame. Its 3D objects live in `group`. */
export type Show = {
  ev: GiftEvent;
  arch: ShowArchetype;
  tier: Tier;
  theme: RGB[];
  t: number; // elapsed seconds
  dur: number; // total seconds (extended by combos)
  intensity: number; // grows with combos
  seed: number;
  s: Record<string, number>; // scratch scalars
  o: Record<string, THREE.Object3D>; // the show's meshes/sprites
  group: THREE.Group;
};
