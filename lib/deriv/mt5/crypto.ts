/**
 * Crypto bot constants — kept beside the registry so the page never hard-codes
 * numbers that must agree with the EA. These MIRROR ClunoidCryptoMT5.mq5: if a
 * risk cap changes there, change it here too.
 */

export type CryptoProfile = {
  key: "conservative" | "moderate" | "aggressive";
  label: string;
  riskPerTradePct: number;
  maxOpenRiskPct: number;
  maxAdds: number;
  blurb: string;
};

export const CRYPTO_PROFILES: CryptoProfile[] = [
  {
    key: "aggressive",
    label: "Aggressive",
    riskPerTradePct: 1.0,
    maxOpenRiskPct: 5.0,
    maxAdds: 2,
    blurb: "The default. Full 1% per trade, and adds to a winner up to twice while the trend holds.",
  },
  {
    key: "moderate",
    label: "Moderate",
    riskPerTradePct: 0.6,
    maxOpenRiskPct: 3.0,
    maxAdds: 1,
    blurb: "Same reading of the market, smaller stake. One add per trend at most.",
  },
  {
    key: "conservative",
    label: "Conservative",
    riskPerTradePct: 0.35,
    maxOpenRiskPct: 1.5,
    maxAdds: 0,
    blurb: "Same setups again, smallest stake, and never adds to a position.",
  },
];

/**
 * What we MEASURED on a year of real Deriv BTC and ETH prices before designing
 * the bot. These three numbers are why the crypto bot is not simply the gold bot
 * pointed at new symbols — each one forced a specific design decision.
 */
export const CRYPTO_EVIDENCE = [
  {
    stat: "≈ 0",
    label: "momentum carry-over",
    body: "Hour-to-hour momentum on BTC and ETH barely persists at 1–24h, and is slightly negative at 4h. Crypto does not reliably keep going just because it has been going. We built and tested a breakout bot on this data and it lost money — so the trend rules here decide when to stand aside, they never predict a continuation.",
  },
  {
    stat: "0.86",
    label: "BTC vs ETH correlation",
    body: "Still 0.73 during Bitcoin's worst hours. A Bitcoin position and an Ether position are very nearly the same bet placed twice, so the bot's risk ceiling is account-wide and gives no diversification credit — holding both does not buy you extra room.",
  },
  {
    stat: "140×",
    label: "more extreme moves than normal",
    body: "0.86% of hours move beyond four standard deviations, where the textbook says 0.006%. Crypto's tails are genuinely wild, so every stop is sized from live volatility and any setup whose structure sits too far away is refused rather than stretched to fit.",
  },
];

/** Historical measurement, not a forecast. */
export const CRYPTO_TEST = {
  dataset: "Real Deriv BTC/USD + ETH/USD, 1 year (8,760 H1 bars per coin, Jul 2025 → Jul 2026)",
  costNote:
    "Charged at Deriv's own dealing costs — the live spread plus the real overnight financing (−20%/yr on Bitcoin, −15%/yr on Ether)",
  profiles: [
    { profile: "Aggressive", trades: 49, winRate: 67.1, profitFactor: 2.34, maxDD: 3.3, ret: 29.7 },
    { profile: "Moderate", trades: 49, winRate: 67.1, profitFactor: 2.36, maxDD: 2.0, ret: 17.1 },
    { profile: "Conservative", trades: 46, winRate: 66.7, profitFactor: 2.32, maxDD: 1.0, ret: 8.8 },
  ],
  halves: { first: 2.26, second: 2.4 },
  perCoin: [
    { coin: "Bitcoin", trades: 31, profitFactor: 1.73 },
    { coin: "Ether", trades: 18, profitFactor: 5.26 },
  ],
  /** Deriv's real minimum sizes, so the balance guidance is not a guess. */
  minLots: { btc: 0.01, eth: 0.1 },
  comfortableBalanceUsd: 700,
};
