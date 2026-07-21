/**
 * MT5 bot catalog — the ordered list of MT5 automations shown as cards on
 * /trading/deriv/mt5. Each bot lives in its OWN component file under
 * components/deriv/mt5/bots/ and opens at /trading/deriv/mt5/<id>, so adding a bot
 * is: one entry here + one component file + one line in the [botId] route map.
 *
 * ORDER: the general automation leads, then every dedicated bot in the order it
 * was added. Append new bots to the END of this list.
 *
 * COPY: cards sell the outcome, never the method. No timeframes, indicators,
 * entry rules, sessions or test figures — those belong in the source, not on a
 * public page.
 */

export type Mt5BotMeta = {
  id: string;      // URL slug → /trading/deriv/mt5/<id>
  name: string;
  rating: number;  // out of 10
  chip: string;    // short market tag
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
    tagline: "Every market, one setup",
    blurb:
      "The all-in-one automation. Install it once on a single chart and it covers forex and Volatility indices together, sizing every position to your balance and protecting it the moment it opens. Pick a risk profile and it runs hands-free from there.",
    markets: "Forex · Volatility",
  },
  {
    id: "gold",
    name: "Gold & Silver AI Automation",
    rating: 7,
    chip: "Gold + Silver",
    tagline: "Hands-free precious metals",
    blurb:
      "Full automation across gold and silver, the two metals traders watch most. Every position is sized to your balance and carries its stop and target from the second it opens, so your risk is settled before the trade begins. Set it once and let it work.",
    markets: "Gold · Silver",
  },
  {
    id: "crypto",
    name: "Crypto AI Automation",
    rating: 8,
    chip: "BTC + ETH · 24/7",
    tagline: "Bitcoin and Ether, around the clock",
    blurb:
      "Crypto never sleeps, and neither does this. It covers Bitcoin and Ether continuously from a single chart, every position sized to your balance and protected the instant it opens. One risk setting, then genuinely hands-free — nights and weekends included.",
    markets: "Bitcoin · Ether",
  },
  {
    id: "forex",
    name: "Forex AI Automation",
    rating: 8,
    chip: "USD/JPY",
    tagline: "Set it once, leave it running",
    blurb:
      "Disciplined currency automation for traders who would rather not watch a screen. Positions are sized to your balance with protection in place from the moment they open, and the whole account stays inside the limit you choose. No charts, no second-guessing.",
    markets: "USD/JPY · majors",
  },
  {
    id: "indices",
    name: "Stock Index AI Automation",
    rating: 8,
    chip: "Swiss 20 + Wall St 30",
    tagline: "The world's markets, automated",
    blurb:
      "Automated exposure to major stock indices without watching a screen. One chart runs them all, every position is sized to your balance and protected from the moment it opens, and a single risk setting keeps your whole account inside your limit.",
    markets: "Swiss 20 · Wall Street 30",
  },
  {
    id: "volatility",
    name: "Synthetic Index AI Automation",
    rating: 8,
    chip: "Range Break 200 · 24/7",
    tagline: "Always on, weekends included",
    blurb:
      "Synthetic indices trade every hour of every day, and this runs right alongside them. Positions are sized to your balance and protected the instant they open, so the automation keeps working through the night and the weekend while you get on with your life.",
    markets: "Range Break 200",
  },
];

export const getMt5Bot = (id: string): Mt5BotMeta | undefined => MT5_BOTS.find((b) => b.id === id);
