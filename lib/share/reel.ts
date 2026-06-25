"use client";

/**
 * Generic, GAME-AGNOSTIC spec for a shareable highlight video ("reel").
 *
 * Any Clunoid game produces a ReelSpec from whatever it just played; the shared
 * renderer (renderer.ts) turns it into a 9:16 / 16:9 video narrated by Isaac.
 * Nothing in here is flag-specific — `imageUrl` is just "the picture for this
 * round" (a flag today, a logo/landmark/animal tomorrow).
 */

export type ReelAspect = "9:16" | "16:9";

export type ReelTheme = {
  mode: "rays" | "document";
  bg: string; // base background colour
  accent: string; // highlight colour (the answer, the score)
  ink: string; // primary text colour
  hue?: number; // for the rays sunburst
};

export type ReelScene = {
  imageUrl: string; // the round's image (e.g. a flag PNG, CORS-enabled)
  bigText: string; // the revealed answer (e.g. the country name)
  userText?: string; // what the player answered (shown only when provided)
  correct: boolean; // drives the ✓/✗ + colour
  badge?: string; // a small tag, e.g. the difficulty
  narration: string; // the line Isaac speaks over this scene
};

export type ReelSpec = {
  aspect: ReelAspect;
  theme: ReelTheme;
  title: string; // e.g. "Guess The Country"
  subtitle?: string; // e.g. the category
  brand: string; // e.g. "clunoid.com"
  intro: { headline: string; sub?: string; narration: string };
  scenes: ReelScene[];
  outro: { headline: string; scoreText: string; sub?: string; narration: string };
};

/** Pixel size of the output canvas for each aspect. */
export function aspectSize(aspect: ReelAspect): { w: number; h: number } {
  return aspect === "9:16" ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
}

/** True when this browser can render a video at all (else we offer an image). */
export function canRecordVideo(): boolean {
  if (typeof window === "undefined") return false;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    !!Ctx
  );
}
