/**
 * Clunoid Clash — tuning constants + arena themes.
 *
 * Every number that shapes an OUTCOME lives here so the sim (sim.ts) and the
 * renderer (stage layer) agree on one source of truth. Values are frozen with
 * `as const`: changing game feel is a config edit, never a code hunt.
 *
 * COMPLIANCE: these constants encode the deterministic push math — gifts and
 * actions map to fixed, legible effects (tier floors, hard caps), never chance.
 */

export const CLASH = {
  WAR_MS: 180000, // one war: 3 minutes to the horn
  SUDDEN_MS: 30000, // sudden death window when the horn finds a dead heat
  INTERMISSION_MS: 30000, // breather between wars
  CEREMONY_MS: 90000, // campaign victory ceremony
  WINS_TO_CAMPAIGN: 5, // first team to 5 war wins takes the campaign
  K_FLOOR: 200, // minimum push-scaling constant (quiet-room legibility)
  COMMENT_POWER: 0.5, // trooper push points per chat comment
  COMMENT_COOLDOWN_MS: 3000, // per-user trooper cooldown
  FOLLOW_POWER: 2, // recruit push points per follow
  SHARE_SQUAD: 3, // squad members per share (power 1 each)
  LIKES_PER_SURGE: 100, // pooled team likes per surge
  SURGE_MS: 10000, // surge duration
  SURGE_SPEED: 1.5, // unit speed multiplier while surging
  TIER_FLOOR_PCT: { 2: 2, 3: 5, 4: 10 } as Record<number, number>, // whale legibility floors
  MAX_EVENT_PCT: 25, // hard cap on line movement from a single event
  COMEBACK_BELOW_PCT: 35, // territory threshold that arms the comeback multiplier
  COMEBACK_MULT: 1.25, // push multiplier for the cornered team
  CORE_BREAK_PCT: 92, // territory that breaks the enemy core (early war end)
  UNIT_CAP: 120, // total units on the field
  TEAM_UNIT_CAP: 60, // units per team
  UNIT_SPEED: 0.06, // fraction of field per second
  IDLE_AFTER_MS: 90000, // no human events for this long → attract mode
  BOT_SPAWN_MS: 2500, // house-bot cadence in attract mode
  TICKER_CAP: 6, // notable-moments feed length
  COIN_WINDOW_MS: 300000, // trailing coin window that sets K at each war start
} as const;

export type ClashTheme = {
  id: string;
  name: string;
  sky: string;
  skyDeep: string;
  crimson: string;
  cobalt: string;
  line: string;
  ink: string;
  inkDim: string;
};

/** Clean modern dark arenas. THEMES[0] is the default; team hues always read red vs blue. */
export const THEMES: ClashTheme[] = [
  {
    id: "midnight",
    name: "Midnight Arena",
    sky: "#14161C",
    skyDeep: "#0B0D12",
    crimson: "#E5484D",
    cobalt: "#3E63DD",
    line: "#EAECEF",
    ink: "#EAECEF",
    inkDim: "#8A8F98",
  },
  {
    id: "neon",
    name: "Neon Circuit",
    sky: "#101418",
    skyDeep: "#07090C",
    crimson: "#FF5D6C",
    cobalt: "#4C8DFF",
    line: "#F2F5F8",
    ink: "#F2F5F8",
    inkDim: "#7E8791",
  },
  {
    id: "dusk",
    name: "Violet Dusk",
    sky: "#171422",
    skyDeep: "#0D0B16",
    crimson: "#E8556B",
    cobalt: "#5B5BD6",
    line: "#EDEBF5",
    ink: "#EDEBF5",
    inkDim: "#8D89A3",
  },
  {
    id: "forge",
    name: "Iron Forge",
    sky: "#1B1614",
    skyDeep: "#100C0A",
    crimson: "#F25F4C",
    cobalt: "#4A7DDC",
    line: "#F0EAE4",
    ink: "#F0EAE4",
    inkDim: "#9A9089",
  },
  {
    id: "abyss",
    name: "Deep Abyss",
    sky: "#0E1620",
    skyDeep: "#060B12",
    crimson: "#E5484D",
    cobalt: "#3E8EDD",
    line: "#E6EDF3",
    ink: "#E6EDF3",
    inkDim: "#7D8B99",
  },
];
