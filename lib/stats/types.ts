/**
 * Stat Battle — an animated bar-chart race (ranking-over-time) built from REAL
 * data (World Bank for economies/demographics, live web research otherwise) plus
 * a brain-written event story. The data is GAME-AGNOSTIC: entities with values at
 * sparse time keyframes; the renderer interpolates between them for a smooth race.
 */

// What an entity IS — drives which media we show on its bar (flag / logo / photo).
export type EntityKind = "country" | "company" | "person" | "other";

export type RaceEntity = {
  name: string;
  color: string;
  kind?: EntityKind; // how to fetch its media (country→flag, company→logo, person→photo)
  image?: string; // resolved media image drawn at the bar's end
  country?: string; // ISO-3166 alpha-2 of the entity's origin → a small flag beside non-country media
};

// A timeline beat shown in the story panel (bottom/right) while its time is current.
export type RaceEventRaw = {
  time: number; // when this beat begins (same scale as keyframe.time)
  title: string; // bold headline, e.g. "The Economic Shock of World War 1"
  description: string; // a short paragraph about what happened
  label?: string; // human on-screen time for a SUB-YEAR beat (e.g. "May 8 2026"); the renderer shows the keyframe label, this is only for the review sheet + data document. Omit for multi-year (the year is shown from `time`).
  partyCodes?: string[]; // ISO-3166 alpha-2 codes → flags shown as media (a side)
  vsCodes?: string[]; // optional opposing side → drawn after a "vs"
  subjects?: string[]; // entity/person/company names whose media best illustrates the beat
};
export type RaceEvent = RaceEventRaw & {
  subjectMedia?: string[]; // resolved image URLs for `subjects` (filled client-side)
};

// Raw shape returned by the brain / API (values as an array — JSON friendly).
// `label` is the human time shown on screen for sub-yearly windows (e.g. "May 2026",
// "May 8") — when present it overrides the year counter; omit it for multi-year spans.
export type RaceKeyframeRaw = { time: number; values: { name: string; value: number }[]; label?: string };
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
// `label`: the on-screen time for sub-yearly windows; absent → render shows the year.
export type RaceFrame = { time: number; values: Record<string, number>; label?: string };
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
