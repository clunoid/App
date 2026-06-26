/**
 * Stat Battle — an animated bar-chart race (ranking-over-time) built from REAL
 * data (World Bank for economies/demographics, live web research otherwise) plus
 * a brain-written event story. The data is GAME-AGNOSTIC: entities with values at
 * sparse time keyframes; the renderer interpolates between them for a smooth race.
 */

export type RaceEntity = {
  name: string;
  color: string;
  image?: string; // a small media image drawn at the bar's end (a flag, a logo…)
};

// A timeline beat shown in the story panel (bottom/right) while its time is current.
export type RaceEventRaw = {
  time: number; // when this beat begins (same scale as keyframe.time)
  title: string; // bold headline, e.g. "The Economic Shock of World War 1"
  description: string; // a short paragraph about what happened
  partyCodes?: string[]; // ISO-3166 alpha-2 codes → flags shown as media (a side)
  vsCodes?: string[]; // optional opposing side → drawn after a "vs"
};
export type RaceEvent = RaceEventRaw;

// Raw shape returned by the brain / API (values as an array — JSON friendly).
export type RaceKeyframeRaw = { time: number; values: { name: string; value: number }[] };
export type RaceRaw = {
  title: string;
  subtitle?: string;
  valueLabel?: string;
  unitPrefix?: string;
  unitSuffix?: string;
  timeLabel?: string;
  decimals?: number; // how many decimals to show on each value (default 1)
  topN?: number; // visible bars (default 12)
  source?: string; // provenance note, e.g. "World Bank" (shown small, builds trust)
  entities: RaceEntity[];
  keyframes: RaceKeyframeRaw[];
  events?: RaceEventRaw[];
};

// Normalized client model — keyframe values as a name→value map, sorted by time.
export type RaceFrame = { time: number; values: Record<string, number> };
export type RaceData = {
  title: string;
  subtitle: string;
  valueLabel: string;
  unitPrefix: string;
  unitSuffix: string;
  timeLabel: string;
  decimals: number;
  source: string;
  entities: RaceEntity[];
  frames: RaceFrame[]; // sorted ascending by time
  events: RaceEvent[]; // sorted ascending by time
  topN: number; // visible bars
  durationSec: number; // race length (excl. the end hold)
};

// A readable, high-contrast palette assigned by index when the brain omits colors.
export const PALETTE = [
  "#e6194B", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4",
  "#f032e6", "#bfef45", "#fabed4", "#469990", "#9A6324", "#800000",
  "#808000", "#000075", "#e6beff", "#dcbeff", "#aaffc3", "#ffd8b1",
];
