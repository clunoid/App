/**
 * CLUNOID TRADING — the public knowledge / discovery data.
 *
 * This is the content behind the "Trading hub" section on /trading. It exists to
 * be FOUND: every block is a question people actually type into a search engine,
 * answered plainly.
 *
 * TWO RULES, both deliberate:
 *
 *  1. NOTHING HERE DESCRIBES HOW CLUNOID WORKS. No strategy, no parameters, no
 *     engine detail. It is general trading knowledge and public market facts, so
 *     it can be indexed freely without handing anyone our method.
 *
 *  2. FIGURES ARE SOURCED AND DATED. Every number below was checked against a
 *     primary source (BIS, WFE, LBMA, Coalition Greenwich, or the company's own
 *     published figures) and carries the period it refers to. When a survey ages
 *     out, update the `asOf` with the figure — never leave a stale number
 *     looking current. Do not add a figure here you cannot point to.
 */

/* ── market scale ─────────────────────────────────────────────────────────── */

export type MarketStat = { label: string; value: string; unit: string; note: string; asOf: string };

/** Headline market sizes. Sources are named in `note` so the page can show them. */
export const MARKET_STATS: MarketStat[] = [
  {
    label: "Foreign exchange",
    value: "$9.6",
    unit: "trillion a day",
    note: "Average daily OTC turnover, all instruments — BIS Triennial Survey",
    asOf: "April 2025",
  },
  {
    label: "Global equities",
    value: "$152",
    unit: "trillion listed",
    note: "Market value of the world's listed companies — WFE",
    asOf: "end of 2025",
  },
  {
    label: "Gold",
    value: "$361",
    unit: "billion a day",
    note: "Average daily gold trading turnover — World Gold Council",
    asOf: "2025 average",
  },
  {
    label: "Crypto",
    value: "$75",
    unit: "billion a day",
    note: "Spot volume across tracked exchanges — moves fast, treat as indicative",
    asOf: "July 2026",
  },
];

/* ── platforms & venues ───────────────────────────────────────────────────── */

export type Venue = {
  name: string;
  logo?: string;
  kind: string;
  stat?: string;
  blurb: string;
};

/**
 * The places people trade. Presented as a guide to the landscape — what each
 * venue is and what it is known for — not as a claim about who we connect to.
 */
export const VENUES: Venue[] = [
  {
    name: "MetaTrader 5",
    logo: "/logos/metatrader5.svg",
    kind: "Trading terminal",
    stat: "The industry-standard terminal",
    blurb:
      "The terminal most brokers hand their clients. Charts, order execution and Expert Advisors — automated programs that run strategies on your own machine — in one desktop app.",
  },
  {
    name: "TradingView",
    logo: "/logos/tradingview.svg",
    kind: "Charting & analysis",
    stat: "100M+ traders and investors",
    blurb:
      "Where most traders look at charts. Pine Script lets you write your own indicators and alerts, and the social feed makes it the largest public library of trade ideas anywhere.",
  },
  {
    name: "Binance",
    logo: "/logos/binance.svg",
    kind: "Crypto exchange",
    stat: "323M+ registered users",
    blurb:
      "Spot, margin and perpetual futures across hundreds of coins, running every hour of every day. The deepest order books in crypto sit here.",
  },
  {
    name: "Deriv",
    logo: "/logos/deriv-wordmark.svg",
    kind: "Broker",
    stat: "3M+ clients, trading since 1999",
    blurb:
      "Forex, commodities and stock indices alongside its own synthetic indices — instruments that price around the clock, including weekends, and are unaffected by real-world news.",
  },
  {
    name: "Exness",
    logo: "/logos/exness.svg",
    kind: "Broker",
    stat: "$4.5tn cleared in a single month (2023)",
    blurb:
      "A multi-asset broker known for tight spreads and fast execution on the major currency pairs, metals and indices.",
  },
  {
    name: "OANDA",
    logo: "/logos/oanda.svg",
    kind: "Broker",
    stat: "Since 1996, regulated in 9 centres",
    blurb:
      "One of the oldest names in online currency trading, and the source of exchange-rate data used by auditors, corporations and tax authorities.",
  },
  {
    name: "cTrader",
    logo: "/logos/ctrader.svg",
    kind: "Trading terminal",
    stat: "11M+ traders, 300+ brokers",
    blurb:
      "The main alternative to MetaTrader. Depth-of-market pricing, and cBots — automated strategies written in C# rather than MQL.",
  },
  {
    name: "Pocket Option",
    kind: "Options broker",
    stat: "Short-duration contracts",
    blurb:
      "A fixed-return options platform built around very short time horizons, popular with traders who want a defined risk and payout before entering.",
  },
];

/* ── prop firms ───────────────────────────────────────────────────────────── */

export type PropFirm = { name: string; logo: string; founded: string; blurb: string };

export const PROP_FIRMS: PropFirm[] = [
  {
    name: "FTMO",
    logo: "/logos/ftmo.svg",
    founded: "2015 · Prague",
    blurb: "Made the two-step evaluation the industry norm. Reports $650m+ paid out to traders.",
  },
  {
    name: "FundedNext",
    logo: "/logos/fundednext.png",
    founded: "2022 · UAE",
    blurb: "Known for paying a share of profit during the evaluation. Reports $306m+ paid out.",
  },
  {
    name: "The 5%ers",
    logo: "/logos/the5ers.svg",
    founded: "2016 · Ra'anana",
    blurb: "Built around scaling — allocations grow as a trader proves consistency.",
  },
  {
    name: "FundingPips",
    logo: "/logos/fundingpips.svg",
    founded: "2022 · Dubai",
    blurb: "One of the fastest-growing evaluation firms, reporting 2m+ users signed up.",
  },
];

/* ── explainers ───────────────────────────────────────────────────────────── */

export type Explainer = { q: string; a: string };

/** Plain answers to the questions beginners actually search. */
export const EXPLAINERS: Explainer[] = [
  {
    q: "What is trading?",
    a: "Buying an instrument you expect to rise, or selling one you expect to fall, and closing the position later for the difference. Traders work in currencies, metals, indices, crypto and shares. What separates trading from investing is horizon: an investor holds for years, a trader for minutes to months.",
  },
  {
    q: "What is forex?",
    a: "The foreign exchange market — currencies quoted in pairs, like EUR/USD. Buying EUR/USD means buying euros and selling dollars at once, so you are always trading one currency's strength against another. It is the largest market on earth and runs 24 hours a day from Monday morning in Sydney to Friday evening in New York.",
  },
  {
    q: "What is leverage?",
    a: "Borrowed exposure. At 1:100, $1,000 controls $100,000 of currency. It multiplies gains and losses equally — the reason most accounts fail is leverage used without a matching stop loss, not a bad forecast. Leverage changes position size, never the quality of the idea.",
  },
  {
    q: "What is a pip?",
    a: "The standard increment a currency pair moves in — 0.0001 for most pairs, 0.01 for those quoted in yen. What a pip is worth in money depends entirely on your position size, which is why sizing is calculated before entry, not after.",
  },
  {
    q: "What is risk-to-reward?",
    a: "The distance to your target divided by the distance to your stop. At 1:2 you risk one unit to make two, so you can be wrong more often than you are right and still finish ahead. It is the single number that decides whether a win rate is good enough.",
  },
  {
    q: "What is drawdown?",
    a: "The fall from an account's highest point to its lowest before a new high. It matters more than any return figure, because losses compound against you: a 50% drawdown needs a 100% gain just to get back to level.",
  },
];

/* ── principles ───────────────────────────────────────────────────────────── */

export type Principle = { title: string; body: string };

export const PRINCIPLES: Principle[] = [
  {
    title: "Decide the loss before the entry",
    body: "A stop loss placed where the idea is proven wrong — beyond structure, not at a round number — is what makes a losing trade survivable. If you cannot say what you lose before you click, the position is too big.",
  },
  {
    title: "Size from risk, not from confidence",
    body: "Position size falls out of two numbers: what percentage of the account you are willing to lose, and how far away the stop sits. Most disciplined traders risk 1-2% per position, so a run of losses is an inconvenience rather than an ending.",
  },
  {
    title: "Take asymmetric trades only",
    body: "A setup worth taking pays more when it works than it costs when it fails. Chasing a high win rate at 1:0.5 is how accounts bleed out slowly while looking successful on paper.",
  },
  {
    title: "Cap the day, not just the trade",
    body: "Per-trade risk means little without a daily and total limit. A ceiling on how much can be lost in a day is what stops one bad session from undoing a good month.",
  },
  {
    title: "Trade the plan you wrote when calm",
    body: "Rules written before the market opens are worth more than judgement formed mid-drawdown. Revenge trading and over-trading are not strategy failures, they are the absence of a limit.",
  },
  {
    title: "Keep a record",
    body: "Entry, exit, reason, and what you felt. A journal is the only way to tell a bad system from bad discipline — and they need opposite fixes.",
  },
];

/* ── people & institutions ────────────────────────────────────────────────── */

export type Figure = { name: string; known: string };

/** Traders people search for by name. Achievements kept to documented facts. */
export const TRADERS: Figure[] = [
  { name: "George Soros", known: "Broke the Bank of England in 1992, reportedly making about $1bn shorting sterling" },
  { name: "Jesse Livermore", known: "The original tape reader, who shorted the 1929 crash" },
  { name: "Jim Simons", known: "Mathematician whose Medallion fund posted the best long-run record in finance" },
  { name: "Ray Dalio", known: "Built Bridgewater into the world's largest hedge fund" },
  { name: "Paul Tudor Jones", known: "Called and profited from the 1987 Black Monday crash" },
  { name: "Stanley Druckenmiller", known: "Ran Quantum alongside Soros; decades without a losing year" },
  { name: "Richard Dennis", known: "The Turtle experiment — 20 of his 23 trainees averaged about 100% a year" },
  { name: "Ed Seykota", known: "Built one of the first commercial computerised trading systems, in the 1970s" },
  { name: "Bill Lipschutz", known: "Made over half a billion dollars for Salomon Brothers across eight years on the currency desk" },
  { name: "Linda Raschke", known: "Short-term technical trader; New Market Wizards, and co-author of Street Smarts" },
  { name: "Michael Marcus", known: "Turned a $30,000 company account into $80m over roughly ten years" },
  { name: "Ken Griffin", known: "Citadel has made $90bn+ for investors since 1990 — the most of any hedge fund" },
];

export const BANKS: Figure[] = [
  { name: "JPMorgan Chase", known: "A perennial top-three dealer, and the survey leader for three straight years to 2020" },
  { name: "Deutsche Bank", known: "A long-standing leader in currency dealing, back at number one in recent surveys" },
  { name: "UBS", known: "A dominant European FX franchise, ranked second by market share" },
  { name: "Citi", known: "Among the largest FX market makers worldwide" },
  { name: "Goldman Sachs", known: "A major force across currencies and commodities" },
  { name: "Barclays", known: "A leading sterling and G10 currency desk" },
  { name: "HSBC", known: "The deepest reach across Asian currency markets" },
  { name: "Bank of America", known: "A top-tier dealer across global currencies" },
  { name: "XTX Markets", known: "The non-bank market maker that broke into the dealer top five" },
  { name: "State Street", known: "A custodian bank central to institutional FX flow" },
];

/* ── search topics ────────────────────────────────────────────────────────── */

export type TopicGroup = { title: string; queries: string[] };

/**
 * The discovery index — what people search for around automated and manual
 * trading, grouped so it reads as a topic map rather than a keyword dump.
 * Plain text on purpose: no links, so nothing here can rot into a 404.
 */
export const SEARCH_TOPICS: TopicGroup[] = [
  {
    title: "Bots & automation",
    queries: [
      "deriv bots", "free deriv bots", "deriv bot download", "ai mt5 bots", "free mt5 bots",
      "mt5 expert advisor", "best forex ea", "free forex robot", "pocket option bots",
      "free binary bots", "binary options robot", "forex trading bot", "crypto trading bot",
      "ai trading bot", "automated trading software", "algorithmic trading", "algo trading strategies",
      "copy trading", "mql5 expert advisor", "how to install ea on mt5", "ea backtesting",
      "strategy tester mt5", "vps for forex ea", "best ea for prop firm", "grid trading ea",
      "martingale ea", "scalping ea", "trend following ea", "gold trading ea",
      "synthetic indices bot", "volatility 75 bot", "boom and crash bot", "expert advisor download",
      "trading robot review", "automated forex signals",
    ],
  },
  {
    title: "Platforms & brokers",
    queries: [
      "metatrader 4", "metatrader 5", "mt4 vs mt5", "how to use mt5", "tradingview charts",
      "tradingview pine script", "ctrader vs mt5", "deriv app", "deriv demo account",
      "binance futures", "binance spot trading", "exness login", "oanda review",
      "pocket option login", "best forex broker", "low spread broker", "ecn broker",
      "regulated forex broker", "broker leverage", "swap free account", "islamic account forex",
      "demo trading account", "paper trading", "trading platform comparison", "mt5 download",
    ],
  },
  {
    title: "Prop firms & funding",
    queries: [
      "ftmo challenge", "ftmo rules", "how to pass ftmo", "fundednext review", "the 5%ers",
      "fundingpips rules", "prop firm trading", "funded trading account", "best prop firm",
      "prop firm payout", "daily drawdown rule", "max drawdown prop firm",
      "consistency rule prop firm", "evaluation account", "instant funding prop firm",
      "prop firm scaling plan", "two step challenge", "one step challenge",
      "prop firm vs retail trading", "passing a funded challenge",
    ],
  },
  {
    title: "Markets & instruments",
    queries: [
      "what is forex trading", "eurusd analysis", "gbpusd forecast", "usdjpy live",
      "xauusd gold trading", "gold price forecast", "silver trading", "crude oil trading",
      "bitcoin trading", "btcusd analysis", "ethereum trading", "crypto for beginners",
      "stock indices trading", "us30 trading", "nasdaq 100 trading", "sp500 trading",
      "dax 40", "ftse 100", "volatility 75 index", "volatility 100 index", "boom 1000 index",
      "crash 500 index", "step index", "jump index", "synthetic indices", "range break index",
      "commodities trading", "indices vs forex", "cfd trading", "currency pairs explained",
    ],
  },
  {
    title: "Strategy & analysis",
    queries: [
      "technical analysis", "support and resistance", "candlestick patterns", "doji candle",
      "engulfing pattern", "head and shoulders pattern", "double top pattern", "chart patterns",
      "fibonacci retracement", "moving average strategy", "ema vs sma", "rsi indicator",
      "macd indicator", "bollinger bands", "atr indicator", "adx indicator", "ichimoku cloud",
      "price action trading", "supply and demand trading", "order blocks", "smart money concepts",
      "liquidity sweep", "break of structure", "market structure trading",
      "trend following strategy", "breakout strategy", "scalping strategy", "swing trading",
      "day trading", "london session", "new york session", "asian session",
      "best time to trade forex", "multi timeframe analysis", "backtesting a strategy",
    ],
  },
  {
    title: "Risk & money management",
    queries: [
      "risk management in trading", "position size calculator", "lot size calculator",
      "how much to risk per trade", "risk reward ratio", "1 percent rule trading",
      "stop loss placement", "trailing stop", "take profit strategy", "drawdown meaning",
      "maximum drawdown", "expectancy in trading", "win rate vs risk reward",
      "leverage explained", "margin call", "free margin", "equity vs balance", "pip value",
      "how to calculate pips", "overtrading", "revenge trading", "trading psychology",
      "trading journal", "trading plan template", "money management rules",
    ],
  },
  {
    title: "Learn the basics",
    queries: [
      "what is trading", "how to start trading", "trading for beginners", "forex for beginners",
      "how does forex work", "what is a pip", "what is leverage", "long vs short",
      "bid and ask", "spread meaning", "slippage", "order types", "market order", "limit order",
      "stop order", "what is a lot", "major currency pairs", "exotic pairs",
      "base and quote currency", "forex market hours", "is trading gambling",
      "can you make money trading", "how much money to start trading", "trading vs investing",
      "trading terms glossary",
    ],
  },
  {
    title: "People & institutions",
    queries: [
      "famous traders", "richest traders", "george soros", "jesse livermore",
      "paul tudor jones", "ray dalio", "jim simons", "stanley druckenmiller",
      "richard dennis turtle traders", "ed seykota", "bill lipschutz", "linda raschke",
      "market wizards", "biggest forex banks", "jp morgan forex", "goldman sachs trading",
      "citadel securities", "hedge fund trading", "central banks and forex",
      "interest rate decisions",
    ],
  },
];

/** Total across every group — used by the page so the count is never wrong. */
export const TOPIC_COUNT = SEARCH_TOPICS.reduce((n, g) => n + g.queries.length, 0);
