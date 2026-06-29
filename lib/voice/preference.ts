"use client";

/**
 * The user's chosen host voice, shared by every place that speaks — the live
 * game (host.ts), search (speech.ts) and the recap video (share/tts.ts).
 *
 * Two kinds of voice:
 *  - "isaac" — the premium voice (default). Trial-gated for free users.
 *  - a "Clunoid Voice" — one of several studio voices that are fast, affordable
 *    and available to everyone with no trial limit. (Branded names only — the
 *    underlying provider/voice id is mapped server-side and never exposed here.)
 *
 * The choice lives in localStorage so it's instant and survives reloads. The id
 * is passed to /api/tts on every call; the server validates it against its own
 * allowlist and routes accordingly.
 */

export type ClunoidVoice = {
  id: string; // what we send to /api/tts (server maps it to a real voice)
  name: string;
  tone: "male" | "female";
  desc: string;
};

export const ISAAC_VOICE = {
  id: "isaac",
  name: "Isaac",
  desc: "The original — expressive, premium AI host.",
} as const;

/** The selectable Clunoid Voices. Order is the display order. */
export const CLUNOID_VOICES: ClunoidVoice[] = [
  { id: "atlas", name: "Atlas", tone: "male", desc: "Warm, confident game-show host." },
  { id: "titan", name: "Titan", tone: "male", desc: "Deep and dramatic." },
  { id: "dash", name: "Dash", tone: "male", desc: "Crisp, upbeat and friendly." },
  { id: "aria", name: "Aria", tone: "female", desc: "Bright and energetic." },
  { id: "nova", name: "Nova", tone: "female", desc: "Smooth and elegant." },
  { id: "luna", name: "Luna", tone: "female", desc: "Cheerful and playful." },
];

const KEY = "clunoid_voice";
const VALID = new Set<string>([ISAAC_VOICE.id, ...CLUNOID_VOICES.map((v) => v.id)]);

let current: string = ISAAC_VOICE.id;
try {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  if (saved && VALID.has(saved)) current = saved;
} catch {
  /* SSR / no storage — fall back to Isaac */
}

/** The current voice id ("isaac" or a Clunoid Voice id). */
export function getVoicePref(): string {
  return current;
}

/** Persist + apply the user's voice choice. Ignores unknown ids. */
export function setVoicePref(id: string): void {
  if (!VALID.has(id)) return;
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* best effort */
  }
}

/** True for a Clunoid Voice (i.e. not Isaac) — these are never trial-gated. */
export function isClunoidVoice(id: string): boolean {
  return id !== ISAAC_VOICE.id && VALID.has(id);
}
