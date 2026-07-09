/**
 * Showtime asset registry — the curated, professionally-made animations the stage
 * PLAYS (it no longer generates animations in code). Each gift tier maps to a "show":
 * one or more real Lottie assets, choreographed with timed delays so bigger gifts
 * layer into a fuller, longer spectacle. Assets are bundled under
 * /public/showtime/assets (same-origin → instant, and works inside OBS's Chromium).
 * See that folder's README for sources/licensing. This is the POC set — the marquee
 * cinematic pieces (Lion, Universe) are the commission step.
 */
import type { Gift, Tier } from "./types";

export type AssetFit = "cover" | "contain";

/** One asset instance within a tier's show. */
export type AssetPlay = {
  src: string; // same-origin path, preloaded once
  fit: AssetFit; // cover = fill the 9:16 stage; contain = whole piece centered
  scale?: number; // extra scale for centered ("contain") pieces
  delay?: number; // ms after the gift lands, for choreographed layering
};

/** Tier → choreographed show. Fidelity is equal across tiers (all pro assets); the
 *  tier escalates the SIZE of the moment: a single heart burst → confetti → a party
 *  popper → all of them layered for the legendary gifts. Any uncatalogued TikTok gift
 *  falls through to its coin-derived tier. */
export const TIER_SHOW: Record<Tier, AssetPlay[]> = {
  1: [{ src: "/showtime/assets/hearts.json", fit: "contain", scale: 0.94 }],
  2: [{ src: "/showtime/assets/confetti.json", fit: "cover" }],
  3: [{ src: "/showtime/assets/popper.json", fit: "contain", scale: 1.35 }],
  4: [
    { src: "/showtime/assets/confetti.json", fit: "cover" },
    { src: "/showtime/assets/popper.json", fit: "contain", scale: 1.4, delay: 150 },
    { src: "/showtime/assets/streamers.json", fit: "cover", delay: 320 },
    { src: "/showtime/assets/hearts.json", fit: "contain", scale: 1.15, delay: 520 },
  ],
};

/** Every distinct asset used anywhere — preload these once. */
export const ALL_SRCS: string[] = Array.from(new Set(Object.values(TIER_SHOW).flat().map((a) => a.src)));

export function showForGift(gift: Gift): AssetPlay[] {
  return TIER_SHOW[gift.tier];
}
