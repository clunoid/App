/**
 * METATRADER 5 — the standalone platform catalog (NOT the Deriv MT5 bots).
 *
 * MetaTrader 5 is a platform in its own right, on essentially every broker. These
 * automations are broker-agnostic Expert Advisors: volatility-based sizing so they
 * fit any balance, universal instruments so they run on any MT5 account, a hard
 * stop on every trade, and a documented edge behind each one. Free to download,
 * no connection required.
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
  file?: string; // public download path when available
};

/** Any rating this high renders green — these are all top-tier by design. */
export const RATING_HOT = 8.7;

export const MT5_AUTOS: Mt5Auto[] = [
  {
    id: "momentum",
    name: "Momentum Trend Breakout",
    rating: 9.6,
    chip: "Trend · multi-market",
    tagline: "Ride the world's trends, automatically",
    blurb:
      "Trades breakouts in the direction of the 12-month trend across a diversified basket of indices, metals, currencies and crypto. Every position is volatility-sized to your balance and carries a hard stop from the second it opens; winners are added to and run, losers are cut small. Built on the single most independently documented edge in markets.",
    markets: "Indices · Metals · FX · Crypto",
    status: "available",
    file: "/mt5/ClunoidMomentumMT5.mq5",
  },
  {
    id: "index-dip",
    name: "Index Dip Reversion",
    rating: 9.0,
    chip: "Indices · mean reversion",
    tagline: "Buy the dips the market pays for",
    blurb:
      "Buys short-term weakness in stock indices that are still in a long-term uptrend — the documented equity 'buy the dip' effect, filtered by a 200-day regime and protected by a hard stop. The mirror of the trend bot: a high win rate, holds only days, and trades most weeks.",
    markets: "US500 · US30 · NAS100 · indices",
    status: "available",
    file: "/mt5/ClunoidDipMT5.mq5",
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
    id: "volatility-breakout",
    name: "Volatility Breakout",
    rating: 9.0,
    chip: "Gold · Crypto · 24/7",
    tagline: "Catch expansion the moment it starts",
    blurb:
      "A channel-expansion breakout tuned for the markets that trend hardest — gold and the major coins — with volatility sizing, pyramiding into strength and a trailing exit that lets the big moves run.",
    markets: "Gold · Bitcoin · Ether",
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
  {
    id: "orb",
    name: "Opening Range Breakout",
    rating: 8.8,
    chip: "Indices · session open",
    tagline: "Trade the break of the open",
    blurb:
      "Takes the break of the first range of the session in the trend's direction — the classic opening-range breakout, with a session filter, a fixed stop and a defined R-multiple target.",
    markets: "US indices · session hours",
    status: "building",
  },
];

export const getMt5Auto = (id: string): Mt5Auto | undefined => MT5_AUTOS.find((b) => b.id === id);
