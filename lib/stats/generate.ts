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

/**
 * PRE-FLIGHT GATE — verify (server-side, read-only: no AI, no charge) that the user is
 * authenticated AND can afford the build BEFORE any expensive Opus request is fired. This
 * guarantees we never even attempt an Opus call for a user without enough credits.
 *
 * Returns:
 *  • { proceed: true,  verified: true  } — authed + enough credits → safe to run (show the tick).
 *  • { proceed: false }                 — 401/402: the SAME auth / "not enough credits" popup
 *                                          the post-request path uses is raised here; do NOT run.
 *  • { proceed: true,  verified: false } — transient/unknown error → run anyway; the real route
 *                                          still atomically gates, so no Opus runs without credits.
 *
 * `kind` selects the price the matching route will charge: "generate" (stats_plan, or
 * stats_plan+stats_opus for a custom build), "file" (stats_file), "edit" (stats_edit).
 */
export async function preflightStats(
  request: string,
  kind: "generate" | "file" | "edit" = "generate"
): Promise<{ proceed: boolean; verified: boolean; status: number }> {
  let res: Response;
  try {
    res = await fetch("/api/stats/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request, kind }),
    });
  } catch {
    return { proceed: true, verified: false, status: 0 }; // offline/transient → the gated route decides
  }
  if (res.status === 401 || res.status === 402 || res.status === 429) {
    reportBillingStatus(res.status, STAT_BATTLE_CREDIT_REASON); // opens auth / credits popup (same as live path)
    return { proceed: false, verified: false, status: res.status };
  }
  if (!res.ok) return { proceed: true, verified: false, status: res.status }; // unknown server error → let the route gate
  return { proceed: true, verified: true, status: 200 };
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
    .map((k) => ({ time: k.time, values: Object.fromEntries(k.values.map((v) => [v.name, v.value])), label: k.label }))
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
