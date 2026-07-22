/**
 * METATRADER 5 — the standalone platform catalog (NOT the Deriv MT5 bots).
 *
 * MetaTrader 5 is a platform in its own right, on essentially every broker. These
 * automations are broker-agnostic Expert Advisors: volatility-based sizing so they
 * fit any balance, universal instruments so they run on any MT5 account, a hard
 * stop on every trade, and a documented edge behind each one. One (Aggressive) is
 * free; the rest are one-time purchases. No connection required.
 *
 * Every automation here is grounded in an INDEPENDENTLY DOCUMENTED edge (academic
 * or widely-reproduced), not a curve-fit backtest — and the ratings reflect the
 * strength of that evidence. The flagship is implemented and validated; the rest
 * are researched and in build/validation. Add a bot: one entry here + its page.
 */

export type Mt5Status = "available" | "building";

export type Mt5Auto = {
  id: string;
  name: string;
  rating: number; // out of 10 — reflects strength of the documented edge
  chip: string;
  tagline: string;
  blurb: string;
  markets: string;
  status: Mt5Status;
  free?: boolean; // the Aggressive automation is free; the rest are one-time purchases
  priceUsd?: number; // one-time price for a paid automation (mirrors lib/deriv/mt5/products.ts)
  file?: string; // public download path — free automation only (paid ones stream via the gated route)
};

/** Any rating this high renders green — these are all top-tier by design. */
export const RATING_HOT = 8.7;

export const MT5_AUTOS: Mt5Auto[] = [
  {
    id: "aggressive",
    name: "Aggressive MT5",
    rating: 3,
    chip: "Forex + Volatility",
    tagline: "The free all-in-one, at full throttle",
    blurb:
      "The free all-in-one automation. One Expert Advisor covers forex majors and Volatility indices together, running its full analysis on your own terminal — no signal feed, no connection required. It trades in a single, aggressive risk mode: full position size and the widest open-risk cap, every trade sized to your balance and protected by a hard stop the moment it opens.",
    markets: "Forex · Volatility",
    status: "available",
    free: true,
    file: "/mt5/ClunoidAggressiveMT5.mq5",
  },
  {
    id: "momentum",
    name: "Momentum Trend Breakout",
    rating: 9.6,
    chip: "Trend · multi-market",
    tagline: "Ride the world's winning trends",
    blurb:
      "A patient, fully hands-free automation that follows market trends across indices, metals, currencies and crypto — holding the winners, cutting the losers small, and diversifying across a broad basket from a single chart.",
    markets: "Indices · Metals · FX · Crypto",
    status: "available",
    priceUsd: 425,
  },
  {
    id: "index-dip",
    name: "Index Dip Reversion",
    rating: 9.0,
    chip: "Indices · mean reversion",
    tagline: "Catch the bounce, bank it fast",
    blurb:
      "Automated dip-buying on major stock indices that are still climbing. It steps in when a rising market pulls back, then takes the quick bounce and moves on. Frequent, fast, and the ideal partner to a trend automation.",
    markets: "US500 · US30 · NAS100 · indices",
    status: "available",
    priceUsd: 149,
  },
  {
    id: "volatility-breakout",
    name: "Volatility Breakout",
    rating: 9.0,
    chip: "Metals · Crypto · Energy",
    tagline: "Let the big moves run",
    blurb:
      "When gold, silver, oil, copper or the major coins break into a powerful move, this hands-free automation gets you in and rides it with a wide trailing exit — staying with winners while every trade opens under a hard stop.",
    markets: "Gold · Silver · Oil · Copper · Crypto",
    status: "available",
    priceUsd: 249,
  },
  {
    id: "orb",
    name: "Opening Range Breakout",
    rating: 8.8,
    chip: "Indices · intraday",
    tagline: "Trade the open. Sleep at night.",
    blurb:
      "The fast, active counterpart to your position automations. It trades the break of the market open across major indices, then closes everything before the bell. Fully hands-free, flat overnight, every trade protected.",
    markets: "US500 · US30 · NAS100 · indices",
    status: "available",
    priceUsd: 99,
  },
  {
    id: "crypto-momentum",
    name: "Crypto Momentum",
    rating: 9.3,
    chip: "Crypto · 24/7",
    tagline: "The market never sleeps",
    blurb:
      "Ride the major coins while they trend — BTC, ETH, SOL, XRP and more — around the clock. Fully hands-free, every position protected the moment it opens, all on your own MT5 terminal.",
    markets: "BTC · ETH · SOL · XRP · and more",
    status: "available",
    priceUsd: 349,
  },
  {
    id: "crypto-ls",
    name: "Crypto Long-Short",
    rating: 9.0,
    chip: "Crypto · market-neutral",
    tagline: "Win on which coins outperform",
    blurb:
      "A market-neutral crypto book that goes long the strongest coins and short the weakest at the same time. It aims to profit from which coins outperform — whether the market rises or falls. Fully hands-free, with a hard stop on every trade.",
    markets: "Long-short across major coins",
    status: "available",
    priceUsd: 199,
  },
  {
    id: "currency-trend",
    name: "Currency Trend",
    rating: 9.1,
    chip: "FX majors · daily",
    tagline: "The one FX edge that survives costs",
    blurb:
      "A daily-timeframe trend system across the major currency pairs — the approach with the strongest documented persistence in FX. Low turnover by design, so spread never eats the edge, with volatility sizing and a disciplined exit.",
    markets: "EUR/USD · GBP/USD · USD/JPY · majors",
    status: "building",
  },
  {
    id: "power-hour",
    name: "Power Hour Momentum",
    rating: 8.9,
    chip: "S&P 500 · intraday",
    tagline: "The last-hour drift, captured",
    blurb:
      "Exploits a peer-reviewed intraday seasonality: the market's final hour tends to continue its morning direction. Trades the S&P index once a day, flat overnight, with a defined stop.",
    markets: "US500 · US30 · NAS100",
    status: "building",
  },
];

export const getMt5Auto = (id: string): Mt5Auto | undefined => MT5_AUTOS.find((b) => b.id === id);
