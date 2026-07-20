/**
 * MT5 bot catalog — the ordered list of MT5 automations shown as cards on
 * /trading/deriv/mt5. Each bot lives in its OWN component file under
 * components/deriv/mt5/bots/ and opens at /trading/deriv/mt5/<id>, so adding a bot
 * is: one entry here + one component file + one line in the [botId] route map.
 */

export type Mt5BotMeta = {
  id: string;      // URL slug → /trading/deriv/mt5/<id>
  name: string;
  rating: number;  // out of 10
  chip: string;    // short strategy tag
  tagline: string;
  blurb: string;
  markets: string; // display, e.g. "Forex · Volatility"
};

export const MT5_BOTS: Mt5BotMeta[] = [
  {
    id: "generalmt5",
    name: "General MT5 AI Automation",
    rating: 2,
    chip: "Forex + Volatility",
    tagline: "Forex and Volatility",
    blurb:
      "One Expert Advisor that trades every live market automatically — forex (24/5) and Volatility indices (24/7) — from a single risk profile you set once. Broad and general-purpose; dedicated per-market bots are coming.",
    markets: "Forex · Volatility",
  },
];

export const getMt5Bot = (id: string): Mt5BotMeta | undefined => MT5_BOTS.find((b) => b.id === id);
