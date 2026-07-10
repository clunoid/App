"use client";

/**
 * Showtime avatars — synchronous CanvasImageSource cache for stage renderers.
 *
 * avatarImage() NEVER blocks a frame: it immediately returns a pre-rendered
 * 96×96 initials disc (flat color hashed from the user id into a tasteful
 * 8-color palette, white bold initials) and, when the user carries a TikTok
 * avatarUrl, kicks off a load through our same-origin proxy
 * (/api/showtime/avatar?u=…) and swaps the cache entry in place once the image
 * decodes — the renderer just keeps calling avatarImage() and picks up the real
 * photo automatically. House bots get a single shared gray "BOT" disc so idle
 * entities are never mistaken for real users (compliance invariant).
 *
 * LRU-capped at 256 entries (Map insertion order; entries are re-inserted on
 * access). Renderers may call this at 60fps for every unit on screen, so the
 * steady-state cost is one Map get — zero allocations, zero async work.
 */

import type { EvUser } from "@/lib/showtime/types";

const CAP = 256;
const SIZE = 96;
const HALF = SIZE / 2;
const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Flat, dark-stage-friendly disc colors — all hold white text legibly. */
const PALETTE = [
  "#E5484D", // red
  "#D6409F", // pink
  "#8E4EC6", // purple
  "#3E63DD", // indigo
  "#0090CE", // blue
  "#12A594", // teal
  "#30A46C", // green
  "#AD7F00", // bronze
];

type Entry = {
  img: CanvasImageSource;
  loading: boolean;
  url: string; // avatarUrl the entry has loaded (or is loading); "" = initials only
};

const cache = new Map<string, Entry>();
let botDisc: HTMLCanvasElement | null = null;

/** FNV-1a — stable, fast id → palette hash. */
function hashId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function initialsFor(user: EvUser): string {
  const parts = user.name.trim().split(/\s+/).filter(Boolean);
  let out = "";
  if (parts.length >= 2) out = parts[0].charAt(0) + parts[1].charAt(0);
  else if (parts.length === 1) out = parts[0].slice(0, 2);
  if (!out) out = user.id.slice(0, 2);
  return (out || "?").toUpperCase();
}

function makeDisc(text: string, bg: string, fontPx: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext("2d");
  if (g) {
    g.beginPath();
    g.arc(HALF, HALF, HALF, 0, Math.PI * 2);
    g.fillStyle = bg;
    g.fill();
    g.fillStyle = "#FFFFFF";
    g.font = `700 ${fontPx}px ${FONT_STACK}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, HALF, HALF + 2);
  }
  return c;
}

/** Load the proxied avatar and swap the cache entry when it decodes. */
function startLoad(key: string, url: string): void {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    const e = cache.get(key);
    if (!e || e.url !== url) return; // evicted or superseded while loading
    const c = document.createElement("canvas");
    c.width = SIZE;
    c.height = SIZE;
    const g = c.getContext("2d");
    if (!g) return;
    const iw = img.naturalWidth || SIZE;
    const ih = img.naturalHeight || SIZE;
    const s = Math.max(SIZE / iw, SIZE / ih); // cover-fit
    g.beginPath();
    g.arc(HALF, HALF, HALF, 0, Math.PI * 2);
    g.clip();
    g.drawImage(img, (SIZE - iw * s) / 2, (SIZE - ih * s) / 2, iw * s, ih * s);
    e.img = c;
    e.loading = false;
  };
  img.onerror = () => {
    const e = cache.get(key);
    if (e && e.url === url) {
      e.loading = false;
      e.url = ""; // allow a retry on a future sighting
    }
  };
  img.src = "/api/showtime/avatar?u=" + encodeURIComponent(url);
}

/**
 * Always returns a drawable source synchronously. Bots share one gray "BOT"
 * disc; users get an initials disc that upgrades to their photo when it loads.
 */
export function avatarImage(user: EvUser | undefined, bot?: boolean): CanvasImageSource {
  if (bot) {
    if (!botDisc) botDisc = makeDisc("BOT", "#525966", 30);
    return botDisc;
  }
  const key = user ? user.id : "guest";
  const hit = cache.get(key);
  if (hit) {
    // LRU touch: re-insert so Map iteration order tracks recency.
    cache.delete(key);
    cache.set(key, hit);
    if (user?.avatarUrl && !hit.loading && hit.url !== user.avatarUrl) {
      hit.url = user.avatarUrl;
      hit.loading = true;
      startLoad(key, user.avatarUrl);
    }
    return hit.img;
  }
  const ini = user ? initialsFor(user) : "?";
  const bg = PALETTE[hashId(key) % PALETTE.length];
  const entry: Entry = { img: makeDisc(ini, bg, ini.length > 1 ? 38 : 46), loading: false, url: "" };
  cache.set(key, entry);
  while (cache.size > CAP) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  if (user?.avatarUrl) {
    entry.url = user.avatarUrl;
    entry.loading = true;
    startLoad(key, user.avatarUrl);
  }
  return entry.img;
}

export function clearAvatarCache(): void {
  cache.clear();
  botDisc = null;
}
