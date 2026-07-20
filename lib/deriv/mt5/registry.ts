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
    id: "volatility",
    name: "Synthetic Index AI Automation",
    rating: 8,
    chip: "Range Break 200 · 24/7",
    tagline: "The one synthetic that is not a random walk",
    blurb:
      "We measured every synthetic Deriv offers. All but one zigzag MORE than a random walk, so there is nothing to trade. Range Break 200 travels 14.3% more than chance — and this bot trades it the way it is built: wait for a tight range, take the break, cut small and run far.",
    markets: "Range Break 200",
  },
  {
    id: "indices",
    name: "Stock Index AI Automation",
    rating: 8,
    chip: "Swiss 20 + Wall St 30",
    tagline: "The two indices that held up",
    blurb:
      "Eleven stock indices were tested identically and picked on how WIDE their winning region was, not their best number. Swiss 20 held 27 of 34 settings and Wall Street 30 held 31 of 42, while most managed one or none. Trades European and US hours only.",
    markets: "Swiss 20 · Wall Street 30",
  },
  {
    id: "forex",
    name: "Forex AI Automation",
    rating: 8,
    chip: "USD/JPY · session",
    tagline: "The one major that passed",
    blurb:
      "All seven majors were tested identically and only USD/JPY held up across both halves of the year. It trades the London–New York overlap only: every configuration restricted to that window was robust, while none that traded around the clock were.",
    markets: "USD/JPY · majors",
  },
  {
    id: "crypto",
    name: "Crypto AI Automation",
    rating: 8,
    chip: "BTC + ETH · 24/7",
    tagline: "Bitcoin and Ether, around the clock",
    blurb:
      "A crypto specialist built on a year of measured BTC/ETH data — which showed crypto does NOT trend the way folklore claims. So it trades rarely and only on its strongest reads, and because the two coins move together at 0.86 correlation they share one account-wide risk ceiling.",
    markets: "Bitcoin · Ether",
  },
  {
    id: "gold",
    name: "Gold AI Automation",
    rating: 7,
    chip: "XAU/USD",
    tagline: "Dedicated gold trend trader",
    blurb:
      "A gold specialist. Reads the trend on H4, waits for a pullback on H1, then places its stop and target at real levels on the chart — targeting 2R or better, banking a partial at 1R and trailing the rest. Runs entirely on your terminal from your broker's own gold prices.",
    markets: "Gold · XAU/USD",
  },
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
