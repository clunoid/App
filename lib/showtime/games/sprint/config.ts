/**
 * BEACH RACE — tuning constants + summer themes.
 *
 * Every gameplay number lives here (reviewable in one place). Movement is tuned so
 * an unaided racer finishes in ~72s, races resolve in <=90s, and the whole loop
 * (lobby -> race -> podium) cycles about every 2¼ minutes — a new TikTok arrival is
 * never far from a start or a finish. Themes are ALL bright: this stage is sunshine.
 */

export const SPRINT = {
  LOBBY_MS: 30_000,
  RACE_MAX_MS: 90_000,
  PODIUM_MS: 15_000,
  GRID_MAX: 12,
  GRID_MIN: 6, // bots fill the grid to at least this
  BASE_FINISH_MS: 72_000, // unaided finish time target
  WOBBLE: 0.18, // ± fraction of base speed from the seeded lead-change noise
  RUBBERBAND: 0.05, // bonus for the bottom 3 (keeps the pack tight, suspense alive)
  CHEER_MS: 600,
  CHEER_MULT: 1.5,
  CHEER_COOLDOWN_MS: 2_000,
  LIKES_PER_WAVE: 100,
  WAVE_MS: 2_500,
  WAVE_MULT: 1.6,
  SHARE_MS: 1_500,
  SHARE_MULT: 1.8,
  TIER_BOOST: {
    0: { ms: 1_200, mult: 2.2 }, // Dash
    1: { ms: 3_000, mult: 2.2 }, // Turbo
    2: { ms: 4_500, mult: 2.6 }, // Jet ski
    3: { ms: 4_000, mult: 3.2 }, // Airlift (+ position gain)
    4: { ms: 8_000, mult: 3.5 }, // Parade takeover
  } as Record<number, { ms: number; mult: number }>,
  AIRLIFT_PLACES: 2,
  PHOTO_FINISH_MS: 400,
  POINTS: [10, 6, 4] as const,
  POINT_PARTICIPATE: 1,
  IDLE_AFTER_MS: 90_000,
  TICKER_CAP: 6,
} as const;

export type SprintTheme = {
  id: string;
  name: string;
  skyTop: string;
  skyBottom: string;
  sun: string;
  cloud: string;
  sand: string;
  sandDark: string;
  laneLine: string;
  sea: string;
  seaFoam: string;
  coral: string;
  mint: string;
  gold: string;
  ink: string;
  inkSoft: string;
  card: string;
};

/** All bright, never dark — theme[0] "noon" is the default. */
export const THEMES: SprintTheme[] = [
  {
    id: "noon",
    name: "High noon",
    skyTop: "#5BC8F2",
    skyBottom: "#BDEBFF",
    sun: "#FFD75E",
    cloud: "#FFFFFF",
    sand: "#F7DFA4",
    sandDark: "#EBC98A",
    laneLine: "#FFFFFF",
    sea: "#2FB6BF",
    seaFoam: "#BFF3F0",
    coral: "#FF7A6B",
    mint: "#4ED6A4",
    gold: "#FFB938",
    ink: "#1F2933",
    inkSoft: "#5C6B7A",
    card: "#FFFFFF",
  },
  {
    id: "sunrise",
    name: "Sunrise",
    skyTop: "#8ED4F5",
    skyBottom: "#FFE3C2",
    sun: "#FFC85C",
    cloud: "#FFF7EC",
    sand: "#FAE3B0",
    sandDark: "#EFCF95",
    laneLine: "#FFFFFF",
    sea: "#3FBBC0",
    seaFoam: "#CFF4EE",
    coral: "#FF8573",
    mint: "#53D6A6",
    gold: "#FFB44F",
    ink: "#22303C",
    inkSoft: "#61707E",
    card: "#FFFFFF",
  },
  {
    id: "sunset",
    name: "Golden hour",
    skyTop: "#FFB56B",
    skyBottom: "#FFE0A8",
    sun: "#FF9E4F",
    cloud: "#FFF3E0",
    sand: "#F6DA9E",
    sandDark: "#E8C384",
    laneLine: "#FFFFFF",
    sea: "#38ADB8",
    seaFoam: "#C9F0E9",
    coral: "#FF7663",
    mint: "#4BCF9F",
    gold: "#FFAE3D",
    ink: "#2A2C33",
    inkSoft: "#6A6E78",
    card: "#FFFFFF",
  },
];

export function themeById(id: string): SprintTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
