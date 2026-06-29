"use client";

import { PALETTE, type RaceData, type RaceRaw } from "./types";
import { GDP_FALLBACK } from "./fallback";
import { flagUrlForName } from "./flags";
import { reportBillingStatus, refreshCredits } from "@/lib/billing/bus";

// Shown in the out-of-credits modal when a Stat Battle can't be afforded — it's
// the most compute-intensive feature (live research + an Opus-built data series +
// an animated render), so users understand WHY it needs more credits.
const STAT_BATTLE_CREDIT_REASON =
  "Stat Battles use serious AI power — Clunoid researches real data across the years, builds an accurate series, and renders your animated chart. That needs more credits than you have right now. Add credits or subscribe to keep creating.";

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
  if (!res.ok) {
    reportBillingStatus(res.status, STAT_BATTLE_CREDIT_REASON);
    throw new Error("stats generation failed");
  }
  const raw = (await res.json()) as RaceRaw & { error?: boolean };
  if (raw.error || !raw.entities?.length || !raw.keyframes?.length) throw new Error("empty race");
  refreshCredits();
  return toRaceData(raw);
}

/** Build a stat battle FROM a user-uploaded document (PDF passed as base64, text
 *  files as plain text). THROWS on failure so the caller can show a retry hint. */
export async function buildRaceFromFile(payload: {
  kind: "text" | "pdf";
  filename: string;
  text?: string;
  dataBase64?: string;
  note?: string;
}): Promise<RaceData> {
  const res = await fetch("/api/stats/from-file", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    reportBillingStatus(res.status, STAT_BATTLE_CREDIT_REASON);
    throw new Error("file generation failed");
  }
  const raw = (await res.json()) as RaceRaw & { error?: boolean };
  if (raw.error || !raw.entities?.length || !raw.keyframes?.length) throw new Error("file produced nothing");
  refreshCredits();
  return toRaceData(raw);
}

/** AI-edit an existing race from a plain-English instruction ("add more European
 *  banks", "extend to 2030", "make Messi's 2026 value 915"). THROWS on failure so the
 *  review UI can keep the current data and show a retry hint. */
export async function aiEditRace(current: RaceData, instruction: string): Promise<RaceData> {
  const res = await fetch("/api/stats/edit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: current, instruction }),
  });
  if (!res.ok) {
    reportBillingStatus(res.status, STAT_BATTLE_CREDIT_REASON);
    throw new Error("stats edit failed");
  }
  const raw = (await res.json()) as RaceRaw & { error?: boolean };
  if (raw.error || !raw.entities?.length || !raw.keyframes?.length) throw new Error("edit produced nothing");
  refreshCredits();
  return toRaceData(raw);
}
