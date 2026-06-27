"use client";

import { PALETTE, type RaceData, type RaceEntity, type RaceFrame, type RaceRaw } from "./types";
import { GDP_FALLBACK } from "./fallback";
import { flagUrlForName } from "./flags";

/**
 * Carry each competitor's last real value FORWARD over the keyframes where it's
 * omitted (only AFTER it has first appeared). So a competitor whose data stops —
 * a retired player's career goals, a record that's been beaten — HOLDS its value
 * and is simply overtaken by RANK, instead of the renderer interpolating it down
 * to zero (which looked like a player's goals melting away). Years before a
 * competitor first appears are left untouched (it still grows in from 0), and any
 * genuine rise/fall the brain actually put in a keyframe is preserved exactly.
 */
export function holdLastValues(frames: RaceFrame[], entities: RaceEntity[]): void {
  for (const e of entities) {
    let last: number | undefined;
    for (const f of frames) {
      const v = f.values[e.name];
      if (v != null) last = v; // a real figure → remember it
      else if (last != null) f.values[e.name] = last; // omitted after appearing → hold
    }
  }
}

/** Quick-start stat battles — natural requests the brain researches. First = GDP. */
export const PRESETS: { label: string; request: string }[] = [
  { label: "GDP Battle", request: "World's Largest Economies by GDP — epic battle, 1960 to today" },
  { label: "Populations", request: "World's most populous countries, 1960 to today" },
  { label: "GDP per capita", request: "Richest countries by GDP per capita, 1960 to today" },
  { label: "Military spending", request: "Top countries by military spending, 1960 to today" },
  { label: "CO₂ emitters", request: "Biggest CO2 emitters by country, 1960 to today" },
  { label: "Chess ELO", request: "Top chess players by ELO rating, 1970 to today" },
];

/** Brain output (raw, name→value arrays) → normalized client model (sorted, maps). */
export function toRaceData(raw: RaceRaw): RaceData {
  const entities = (raw.entities || []).map((e, i) => ({
    name: e.name,
    color: e.color || PALETTE[i % PALETTE.length],
    kind: e.kind,
    country: e.country,
    // only auto-flag country entities; logos/photos are resolved client-side (resolveRaceMedia)
    image: e.image || (e.kind && e.kind !== "country" ? undefined : flagUrlForName(e.name)) || undefined,
  }));
  const frames = (raw.keyframes || [])
    .map((k) => ({ time: k.time, values: Object.fromEntries(k.values.map((v) => [v.name, v.value])) }))
    .sort((a, b) => a.time - b.time);
  const events = (raw.events || []).slice().sort((a, b) => a.time - b.time);
  holdLastValues(frames, entities); // values hold (never crater to 0) once a competitor stops
  const topN = Math.min(raw.topN && raw.topN >= 3 ? raw.topN : 12, entities.length);
  return {
    title: raw.title || "Stat Battle",
    subtitle: raw.subtitle || "",
    valueLabel: raw.valueLabel || "",
    unitPrefix: raw.unitPrefix || "",
    unitSuffix: raw.unitSuffix || "",
    timeLabel: raw.timeLabel || "Year",
    decimals: Number.isFinite(raw.decimals as number) ? (raw.decimals as number) : 1,
    source: raw.source || "",
    entities,
    frames,
    events,
    topN,
    // Slow, watchable pace (~half the previous speed) — the years crawl, the values
    // roll. Scales with the span (and keyframe count) up to a shareable cap.
    durationSec: Math.min(240, Math.max(80, Math.max((frames.length ? frames[frames.length - 1].time - frames[0].time : 0) * 2.2, frames.length * 6))),
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
