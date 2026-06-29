"use client";

/**
 * The user's chosen host voice — the single source of truth shared by the live
 * game (host.ts), search (speech.ts), the Settings page, and the create-video
 * flow. Two independent, remembered choices:
 *
 *  - LIVE voice (getVoicePref): used by the live game + search. One of:
 *      "isaac"  — premium AI voice (trial-gated for free users)
 *      a free Clunoid Voice id (atlas/titan/dash/aria/nova/luna) — studio voices,
 *                 free for everyone but RATE-LIMITED, so they can be unreliable
 *      "browser" — the device's built-in SpeechSynthesis voice (always works)
 *      "mute"    — no host narration
 *  - VIDEO voice (getVideoVoicePref): used by the recap-video render. One of:
 *      "isaac" | a Clunoid Voice id | "silent". (The browser voice can't be
 *      recorded into a video, so the video offers Silent instead.)
 *
 * Branded names only — the underlying provider/voice id is mapped server-side and
 * never exposed here. Choices live in localStorage so they're instant + remembered.
 */

export type VoiceKind = "isaac" | "clunoid" | "browser" | "mute";
export type VoiceEntry = {
  id: string;
  name: string;
  desc: string;
  tone?: "male" | "female";
  kind: VoiceKind;
};

export const ISAAC_VOICE: VoiceEntry = {
  id: "isaac",
  name: "Isaac",
  desc: "The original — expressive, premium AI host.",
  kind: "isaac",
};

/** The free studio voices (rate-limited → can be unreliable). Display order. */
export const CLUNOID_VOICES: VoiceEntry[] = [
  { id: "atlas", name: "Atlas", tone: "male", desc: "Warm, confident game-show host.", kind: "clunoid" },
  { id: "titan", name: "Titan", tone: "male", desc: "Deep and dramatic.", kind: "clunoid" },
  { id: "dash", name: "Dash", tone: "male", desc: "Crisp, upbeat and friendly.", kind: "clunoid" },
  { id: "aria", name: "Aria", tone: "female", desc: "Bright and energetic.", kind: "clunoid" },
  { id: "nova", name: "Nova", tone: "female", desc: "Smooth and elegant.", kind: "clunoid" },
  { id: "luna", name: "Luna", tone: "female", desc: "Cheerful and playful.", kind: "clunoid" },
];

export const BROWSER_VOICE: VoiceEntry = {
  id: "browser",
  name: "Basic voice",
  desc: "Your device's built-in voice — always works, a little robotic.",
  kind: "browser",
};
export const MUTE_VOICE: VoiceEntry = {
  id: "mute",
  name: "No voice",
  desc: "Silence — no host narration.",
  kind: "mute",
};

/** "Silent" pseudo-entry for the VIDEO picker (no narration baked into the clip). */
export const SILENT_VIDEO: VoiceEntry = {
  id: "silent",
  name: "Silent",
  desc: "No voice — just music-free visuals.",
  kind: "mute",
};

const LIVE_KEY = "clunoid_voice";
const VIDEO_KEY = "clunoid_video_voice";
const LIVE_VALID = new Set<string>([ISAAC_VOICE.id, ...CLUNOID_VOICES.map((v) => v.id), BROWSER_VOICE.id, MUTE_VOICE.id]);
const VIDEO_VALID = new Set<string>([ISAAC_VOICE.id, ...CLUNOID_VOICES.map((v) => v.id), SILENT_VIDEO.id]);

function read(key: string, valid: Set<string>, fallback: string): string {
  try {
    const s = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (s && valid.has(s)) return s;
  } catch {
    /* SSR / no storage */
  }
  return fallback;
}

let liveVoice: string = read(LIVE_KEY, LIVE_VALID, ISAAC_VOICE.id);
let videoVoice: string = read(VIDEO_KEY, VIDEO_VALID, ISAAC_VOICE.id);

/** Live host voice id ("isaac" | clunoid id | "browser" | "mute"). */
export function getVoicePref(): string {
  return liveVoice;
}
export function setVoicePref(id: string): void {
  if (!LIVE_VALID.has(id)) return;
  liveVoice = id;
  try {
    localStorage.setItem(LIVE_KEY, id);
  } catch {
    /* best effort */
  }
}

/** Recap-video voice id ("isaac" | clunoid id | "silent"). */
export function getVideoVoicePref(): string {
  return videoVoice;
}
export function setVideoVoicePref(id: string): void {
  if (!VIDEO_VALID.has(id)) return;
  videoVoice = id;
  try {
    localStorage.setItem(VIDEO_KEY, id);
  } catch {
    /* best effort */
  }
}

/** True for a free Clunoid (studio) voice — never trial-gated, but rate-limited. */
export function isClunoidVoice(id: string): boolean {
  return CLUNOID_VOICES.some((v) => v.id === id);
}

/** Look up the display entry for any voice id (live or "silent"). */
export function voiceById(id: string): VoiceEntry | undefined {
  if (id === SILENT_VIDEO.id) return SILENT_VIDEO;
  return [ISAAC_VOICE, ...CLUNOID_VOICES, BROWSER_VOICE, MUTE_VOICE].find((v) => v.id === id);
}
