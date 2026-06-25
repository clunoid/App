"use client";

import { PALETTE, type RaceData, type RaceRaw } from "./types";
import { GDP_FALLBACK } from "./fallback";

/** Quick-start stat battles — natural requests the brain researches. First = GDP. */
export const PRESETS: { label: string; request: string }[] = [
  { label: "GDP Battle", request: "World's Largest Economies by GDP — epic battle, 1960 to 2026" },
  { label: "Chess ELO", request: "Top chess players by ELO rating, 1967 to 2026" },
  { label: "Populations", request: "World's most populous countries, 1950 to 2026" },
  { label: "Companies", request: "Biggest companies by market capitalization, 1995 to 2026" },
  { label: "YouTubers", request: "Most-subscribed YouTube channels, 2010 to 2026" },
  { label: "Olympic Gold", request: "Olympic gold medals by country (cumulative), 1896 to 2024" },
];

/** Brain output (raw, name→value arrays) → normalized client model (sorted, maps). */
export function toRaceData(raw: RaceRaw): RaceData {
  const entities = (raw.entities || []).map((e, i) => ({ name: e.name, color: e.color || PALETTE[i % PALETTE.length] }));
  const frames = (raw.keyframes || [])
    .map((k) => ({ time: k.time, values: Object.fromEntries(k.values.map((v) => [v.name, v.value])) }))
    .sort((a, b) => a.time - b.time);
  return {
    title: raw.title || "Stat Battle",
    subtitle: raw.subtitle || "",
    valueLabel: raw.valueLabel || "",
    unitPrefix: raw.unitPrefix || "",
    unitSuffix: raw.unitSuffix || "",
    timeLabel: raw.timeLabel || "Year",
    entities,
    frames,
    topN: Math.min(10, entities.length),
    durationSec: Math.min(60, Math.max(28, frames.length * 2.4)),
  };
}

/** The GDP default, ready to play (offline fallback for the default experience). */
export function gdpFallbackRace(): RaceData {
  return toRaceData(GDP_FALLBACK);
}

/** Ask the brain for a stat battle. THROWS on failure so the caller can decide
 *  whether to show the GDP default (for the default request) or a retry prompt. */
export async function buildRace(request: string): Promise<RaceData> {
  const res = await fetch("/api/stats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request }),
  });
  if (!res.ok) throw new Error("stats generation failed");
  const raw = (await res.json()) as RaceRaw & { error?: boolean };
  if (raw.error || !raw.entities?.length || !raw.keyframes?.length) throw new Error("empty race");
  return toRaceData(raw);
}
