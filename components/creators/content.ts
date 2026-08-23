import { CalendarDays, Clock, Rocket, TrendingUp, Wallet } from "lucide-react";

/**
 * CREATOR PROGRAM — the words and numbers, in one place.
 *
 * Both the registration page and the dashboard show these. Keeping them here
 * means a rule can never say one thing before someone joins and another after.
 */

export const A = "#a78bfa";
export const GOOD = "#34d399";
export const BAD = "#f2607d";

/**
 * Every platform a creator may post to.
 *
 * Three of these, chosen by the creator. Instagram, TikTok and YouTube are the
 * recommended set and are picked by default — they have the reach. Facebook
 * Reels and Snapchat Spotlight are here because a recommended one is not always
 * usable: TikTok is banned in India and restricted elsewhere, and someone who
 * cannot open it should not be shut out of the programme over it.
 *
 * The bar for being on this list is that we can stand behind it: globally
 * available, a real short-video surface, and somewhere finance content actually
 * runs. Regional apps were tried and dropped — we could not verify their rules
 * on trading content, and a creator following our advice into a ban is worse
 * than a shorter list.
 */
export const PLATFORM_CATALOGUE = [
  { key: "tiktok",    label: "TikTok",             logo: "/logos/tiktok.svg",    ph: "@handle or paste your link",  main: true },
  { key: "instagram", label: "Instagram Reels",    logo: "/logos/instagram.svg", ph: "@handle or paste your link",  main: true },
  { key: "youtube",   label: "YouTube Shorts",     logo: "/logos/youtube.svg",   ph: "@channel or paste your link", main: true },
  { key: "facebook",  label: "Facebook Reels",     logo: "/logos/facebook.svg",  ph: "@page or paste your link",    main: false, note: "Link it to Instagram and one upload posts to both" },
  { key: "snapchat",  label: "Snapchat Spotlight", logo: "/logos/snapchat.svg",  ph: "@handle or paste your link",  main: false },
] as const;

export type PlatformKey = (typeof PLATFORM_CATALOGUE)[number]["key"];

/** How many a creator posts each video to. */
export const PLATFORMS_REQUIRED = 3;

/** What someone gets if they never touch the picker. */
export const DEFAULT_PLATFORMS: PlatformKey[] = ["tiktok", "instagram", "youtube"];

export const platformInfo = (key: string) => PLATFORM_CATALOGUE.find((p) => p.key === key);

/** "TikTok, Instagram Reels and YouTube Shorts" — for sentences. */
export function platformSentence(keys: readonly string[]): string {
  const names = keys.map((k) => platformInfo(k)?.label ?? k);
  if (names.length <= 1) return names[0] ?? "";
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

export const PAYOUTS = [
  { key: "usdt", label: "USDT (Tether)", logo: "/logos/tether.svg" },
  { key: "paypal", label: "PayPal", logo: "/logos/paypal.svg" },
  { key: "venmo", label: "Venmo", logo: "/logos/venmo.svg" },
  { key: "cashapp", label: "Cash App", logo: "/logos/cashapp.svg" },
  { key: "mpesa", label: "M-Pesa", logo: "/logos/mpesa.svg" },
  { key: "wise", label: "Wise", logo: "/logos/wise.svg" },
  { key: "payoneer", label: "Payoneer", logo: "/logos/payoneer.svg" },
] as const;

export const LADDER = [
  { m: "Month 1", pay: 100, note: "Accounts you already had" },
  { m: "Month 1", pay: 50, note: "Brand-new accounts made for this" },
  { m: "Month 2", pay: 150, note: "" },
  { m: "Month 3", pay: 200, note: "" },
  { m: "Month 4", pay: 250, note: "" },
  { m: "Month 5", pay: 300, note: "" },
  { m: "Month 6", pay: 350, note: "" },
  { m: "…", pay: null as number | null, note: "+$50 every month" },
  { m: "Month 14+", pay: 750, note: "Maximum base" },
];

export const STEPS = [
  { n: 1, icon: Rocket, title: "Register and start today", body: "Fill in the form above. There is nothing to wait for and nobody to approve you — you get your dashboard straight away, and your first video can go up the same day." },
  { n: 2, icon: Clock, title: "Days 1–14: post once a day", body: "One video per day. Post that same video to all three of the platforms you chose — the three together count as one post. Going slower at the start is on purpose: it builds reach and keeps accounts out of trouble." },
  { n: 3, icon: TrendingUp, title: "Days 15–30: post twice a day", body: "Two videos per day, each one posted to all three of your platforms. From month two onward this is your normal pace, every day." },
  { n: 4, icon: CalendarDays, title: "Reach 28 posted days, then ask to be paid", body: "A month is 28 days you actually posted, not 28 dates on a calendar. Miss a day and nothing is lost — your finish line just moves out by a day. Tap the days you posted on your dashboard calendar and it keeps count for you. Leave every video up; deleting them before you are paid cancels the month." },
  { n: 5, icon: Wallet, title: "We check, then we pay you", body: "We spend 3 working days checking: posts still up, made by you, following the rules, views real. You get your money within 7 days of asking. Every month after your first adds $50 — month two is $150." },
];

export const DO = [
  "Put clunoid.com in the bio of all three profiles before your first post.",
  "Faceless is fine — screen recording and a voice-over counts, as long as you tell viewers about Clunoid.",
  "If you pick Facebook, link it to Instagram so your Reels cross-post to both from one upload.",
  "Tell viewers about Clunoid in every single video — say what it is, not just show it.",
  "Take ideas from other trading creators, and use AI for hooks and scripts. Then make it yourself — record, screen record, edit, whatever suits you.",
  "Say what it does in your own words. Your voice beats a script.",
  "Keep videos 30 seconds to 2 minutes. Go longer only if the content earns it.",
  "Speak English or the main language of your country — whichever you are natural in.",
];

export const DONT = [
  "No copying another creator's video. Ideas yes, footage never.",
  "No using a video you posted on an earlier day as today's post — every day needs a new one. Putting that same new video on all three of your accounts is right, and counts as one post.",
  "No speaking as Clunoid. Say “I use this”, never “we offer”.",
];

/**
 * WHAT CLUNOID ACTUALLY IS — the facts every script here is built on.
 *
 * Written down because a creator repeating something that is not true is worse
 * than a creator saying nothing. Bots run on Deriv (in the browser) and on MT5
 * (Expert Advisors you download). TradingView is charts, screener, alerts and
 * Pine Script — analysis, not bots. Nobody should be saying otherwise on camera.
 */
export const TRUE_ABOUT_CLUNOID = [
  "All the trading bots are 100% free.",
  "They are fully automated — you pick a bot and it places the trades.",
  "The bots stop by themselves once the profit target for the run is reached.",
  "Easy to set up. The Deriv bots run in your browser, nothing to install.",
  "For MetaTrader 5 there are free Expert Advisors you download — any MT5 broker works.",
  "Trade from anywhere, at any time.",
  "They run at the weekend too — crypto and synthetic indices stay open.",
]

/**
 * HOW TO MAKE ONE — the production recipe.
 *
 * Most people stall on "what do I actually film". They do not have to film
 * anything: capture the screen, talk over it, post. This is that, in order.
 */
export const SHOT_LIST = [
  {
    t: "1 · Get the app on screen",
    d: "Open Deriv, MetaTrader 5 or TradingView — whichever you are talking about. Download MT5 if you do not have it; it is free. You do not need money in an account to show what the platform looks like.",
  },
  {
    t: "2 · Screen record the bot working",
    d: "Go to clunoid.com, open a bot and let it run. Record 20–40 seconds of it actually placing trades. This is the shot everything else hangs off — people have genuinely never seen it.",
  },
  {
    t: "3 · Grab a shot of the site itself",
    d: "Search \u201Cclunoid\u201D in Google and screen-record the result being tapped, or just record yourself typing clunoid.com into the address bar. It proves the thing is real and tells viewers exactly where to go.",
  },
  {
    t: "4 · Talk over it",
    d: "Record a voice-over on your phone. Say what is on screen as it happens — \u201Cthis is a bot placing a trade by itself\u201D — then say what it is and where to get it. Your normal voice beats a presenter voice.",
  },
  {
    t: "5 · Cut it to length",
    d: "Trim dead air so the first 2 seconds already show the bot moving. Add captions — most people watch with the sound off, so the words have to be on screen too. 30 seconds to 2 minutes.",
  },
  {
    t: "6 · Post it to your three",
    d: "Re-export before each upload so the file is not identical, change the hook slightly per platform, and put it up on all three of your accounts. That is one post.",
  },
];

/**
 * HOOKS — the first two seconds.
 *
 * The single biggest lever on reach. Nothing else in the video matters if the
 * opener does not stop the scroll.
 */
export const HOOKS = [
  "You have probably never seen a trading bot actually place a trade. Watch.",
  "This is running by itself. I have not touched it.",
  "Everyone says trading bots are a scam. Some are. Here is how to tell.",
  "I used to sit and watch charts for hours. Now I do this instead.",
  "Nobody explains what a synthetic index is, so I will.",
  "This took me 90 seconds to set up. Let me show you.",
  "If you have MetaTrader 5 on your phone, you can do this today.",
  "Somebody asked me how the bots actually decide when to trade. Here.",
  "Free. That is the part people do not believe.",
  "Stop paying for signal groups. Watch this first.",
];

/**
 * PIVOTS — how to get from the video to Clunoid without it feeling like an ad.
 *
 * The pivot is the whole job. Say it too early and people leave; never say it
 * and the video does not count. These land it naturally, in the middle or just
 * after the thing they came to see.
 */
export const PIVOTS = [
  {
    t: "The name-drop mid-shot",
    d: "\u201CThis is Clunoid — clunoid.com. It is a site with free automated trading bots. The ones for Deriv run right in your browser, and there are free Expert Advisors for MetaTrader 5 as well. Link is in my bio.\u201D",
  },
  {
    t: "The answer to \u201Cwhat am I looking at\u201D",
    d: "\u201CBefore you ask what this is — it is Clunoid. Free trading bots you connect to your own Deriv account, or download for MT5. Nothing to pay, nothing to install for the Deriv ones. clunoid.com.\u201D",
  },
  {
    t: "The sceptic pivot",
    d: "\u201CI know how this looks. So go and check it yourself — clunoid.com, it is free, you connect your own broker account and you can watch the bots run before you risk anything.\u201D",
  },
  {
    t: "The teaching pivot",
    d: "\u201CThat is what a stop loss does. If you want to see it working instead of just hearing about it, the bots on clunoid.com use one on every trade, and they are free to use.\u201D",
  },
  {
    t: "The lazy pivot",
    d: "\u201CI am not sitting in front of charts for this. Clunoid does it — free bots for Deriv in the browser, free Expert Advisors for MT5, plus TradingView charts if I want to look at something myself. clunoid.com.\u201D",
  },
  {
    t: "The closing line",
    d: "\u201CIt is clunoid.com. Free, no download for the Deriv bots. Go and look at it before you take my word for anything.\u201D",
  },
];

/**
 * IDEAS — the videos, with the hook, the shot and the pivot already worked out.
 *
 * A creator should be able to open this on day 9, pick one, and go and make it
 * without inventing anything.
 */
export const IDEAS = [
  {
    t: "Show a bot placing trades",
    d: "The one that always works. People have not seen this before.",
    hook: "You have probably never seen a trading bot actually place a trade. Watch.",
    show: "Screen recording of a bot running on clunoid.com, trades appearing one by one.",
    pivot: "\u201CThis is Clunoid. Free automated bots — these ones run in your browser on Deriv, and there are Expert Advisors for MT5 too. clunoid.com, link in bio.\u201D",
  },
  {
    t: "Explain one word in 45 seconds",
    d: "Pick a single term and make it obvious. Synthetic index, martingale, stop loss, lot size, drawdown.",
    hook: "Nobody explains what a synthetic index actually is, so I will.",
    show: "The chart on screen while you explain, then the bot trading it.",
    pivot: "\u201CIf you want to watch one being traded instead of just hearing about it, the free bots on clunoid.com do exactly that.\u201D",
  },
  {
    t: "Bust the scam myth",
    d: "Honest takes travel further than hype. Say out loud that most bots are rubbish, then show one that is not.",
    hook: "Everyone says trading bots are a scam. Some are. Here is how to tell.",
    show: "You talking, then cut to a bot running with its stop loss and take profit visible.",
    pivot: "\u201CThe test is whether you can see what it is doing and whether it costs you anything to look. Clunoid is free and you connect your own account — clunoid.com.\u201D",
  },
  {
    t: "Before and after",
    d: "How you used to do it by hand versus what changed. Everyone who has traded manually recognises this.",
    hook: "I used to sit and watch charts for hours. Now I do this instead.",
    show: "Split it: a busy chart with you clicking, then the bot doing it alone.",
    pivot: "\u201CSame trades, I am just not the one placing them. Free at clunoid.com.\u201D",
  },
  {
    t: "The 90-second setup",
    d: "Start to finish, sped up. Removes the excuse that it looks complicated.",
    hook: "This took me 90 seconds to set up. Let me show you.",
    show: "Screen record: open clunoid.com, connect a Deriv account, open a bot, press start. Speed it up 2–4x.",
    pivot: "\u201CThat is the whole thing. clunoid.com, free, nothing to install.\u201D",
  },
  {
    t: "Install an MT5 Expert Advisor",
    d: "Genuinely useful, and MT5 people search for this. Works on any MT5 broker.",
    hook: "If you have MetaTrader 5 on your phone or laptop, you can do this today.",
    show: "Download the file from clunoid.com, drop it into MT5, attach it to a chart, show it armed.",
    pivot: "\u201CThe Expert Advisors are free on clunoid.com — they work on any MT5 broker, you do not have to switch.\u201D",
  },
  {
    t: "Answer a real comment",
    d: "Take a question you actually got and answer it properly. The best-performing videos are usually replies.",
    hook: "Somebody asked me how the bots actually decide when to trade. Here.",
    show: "The comment on screen, then the bot's settings, then it trading.",
    pivot: "\u201CIt is all visible before you run anything — go and look, clunoid.com.\u201D",
  },
  {
    t: "Why is it free?",
    d: "Answer the objection out loud instead of waiting for it in the comments.",
    hook: "Free. That is the part people do not believe.",
    show: "You talking to camera, or the site with the bots listed.",
    pivot: "\u201CYou connect your own broker account, so nobody is holding your money. That is why looking costs nothing. clunoid.com.\u201D",
  },
  {
    t: "Charts without the bot",
    d: "For the audience that wants to analyse first. Shows the site is more than one thing.",
    hook: "Stop paying for signal groups. Watch this first.",
    show: "TradingView charts and screener open from Clunoid, filtering for something.",
    pivot: "\u201CCharts, screener and alerts, then you place the trade on your own broker. Same place as the bots — clunoid.com.\u201D",
  },
  {
    t: "One mistake you made",
    d: "Vulnerability performs. Pick a real mistake: no stop loss, revenge trading, oversized lots.",
    hook: "I blew an account because of this one habit.",
    show: "You talking, then the bot's stop loss on screen.",
    pivot: "\u201CThe reason I use the bots now is that they do not get emotional. clunoid.com, free.\u201D",
  },
  {
    t: "Everything in one place",
    d: "The Central Command angle — for people juggling several accounts.",
    hook: "I have accounts on three brokers and I stopped logging into all of them.",
    show: "Central Command with every account and balance listed in one place.",
    pivot: "\u201COne page, every account. It is on clunoid.com with the bots.\u201D",
  },
  {
    t: "Two bots, side by side",
    d: "Comparison videos hold attention. Run two and talk about the difference.",
    hook: "These two bots trade completely differently. Watch.",
    show: "Two bots running, or one after the other, with their settings shown.",
    pivot: "\u201CBoth free on clunoid.com. Pick whichever suits how you think.\u201D",
  },
];

export const AI_PROMPTS = [
  "Give me 10 short-video hooks about automated trading that would stop someone scrolling.",
  "Explain what a synthetic index is, in 60 seconds, for a total beginner.",
  "Rewrite this caption so it sounds like a person, not an advert.",
  "List 5 myths about trading bots I can correct in a 45-second video.",
  "Write a 30-second voice-over for a screen recording of a trading bot placing trades, that ends by telling people it is free at clunoid.com.",
  "Turn this into a script where the pivot to the product happens halfway, not at the end.",
];

/**
 * The first month, in phases. This is the same 1-a-day → 2-a-day plan, broken
 * into the stretches that actually feel different to do, so a creator opening
 * the dashboard on day 9 can see what day 9 is for.
 */
export const PHASES = [
  {
    from: 1, to: 3,
    title: "Find your format",
    aim: "Get three videos out and see which one people watch to the end.",
    todo: [
      "Post at the same time each day — pick a slot and keep it.",
      "Make all three different: one screen recording, one talking to camera, one explaining a single term.",
      "Do not judge anything by day 3 numbers. You are looking for which was easiest to make.",
    ],
  },
  {
    from: 4, to: 7,
    title: "Repeat what worked",
    aim: "Lean into the format that was easiest and did best.",
    todo: [
      "Keep the winning format, change only the hook and the topic.",
      "Reply to every comment in the first hour — it is the cheapest reach you will get.",
      "Write the caption before you edit. It keeps the video to one idea.",
    ],
  },
  {
    from: 8, to: 14,
    title: "Build the habit",
    aim: "One a day without thinking about it, and a small backlog ready.",
    todo: [
      "Edit 3 videos in one sitting so a bad day never breaks your streak.",
      "Start each video with the point, not an introduction. The first 2 seconds decide.",
      "Check which platform is carrying you — that is the one to tailor hooks for.",
    ],
  },
  {
    from: 15, to: 21,
    title: "Double the pace",
    aim: "Two a day, every day. This is the pace from now on.",
    todo: [
      "Space the two posts out — morning and evening beats two in a row.",
      "Use the second slot to try something new so the first stays reliable.",
      "Keep the backlog at 3+ videos. Two a day is where people fall behind.",
    ],
  },
  {
    from: 22, to: 30,
    title: "Finish clean",
    aim: "Land your last posted days and get ready to be paid.",
    todo: [
      "Do not delete or archive anything — every video must still be live when we check.",
      "Make sure all three handles on your dashboard are correct.",
      "On your 28th posted day, ask to be paid. The money follows within 7 days of our check.",
    ],
  },
] as const;

/**
 * The things people get wrong, in the order they get them wrong. Shown on the
 * sign-up page so nobody joins without knowing, and on the dashboard so nobody
 * forgets. Plain sentences on purpose — a rule nobody reads protects nobody.
 */
export const REMINDERS = [
  {
    t: "Views are not required. Posting every day is.",
    d: "Post decent videos every day, follow the rules, and you get paid. That is the whole deal. Get 10,000 views consistently and you earn an extra $500 on top of your monthly payout.",
  },
  {
    t: "Use English, or the language people speak where you are",
    d: "Whichever gets you understood. English works everywhere, and so does the main language of your country — pick the one you are natural in, because that is the one people watch to the end.",
  },
  {
    t: "You get paid more every month",
    d: "Finish your first 30 days and you get paid. Every month after that adds $50: your second payout is $150, your third is $200, and so on up to $750.",
  },
  {
    t: "Already have accounts? You get $100",
    d: "If you post on accounts you already had, your first month pays $100 — old accounts already have reach, so use them. Only accounts you make brand new for this pay $50 in month one. From month two everyone is on the same ladder.",
  },
  {
    t: "Put clunoid.com in your bio on day one",
    d: "All three of your profiles need clunoid.com in the bio, description or link field before your first post. That is what lets you say \u201Clink in bio\u201D and have it be true.",
  },
  {
    t: "Faceless is fine",
    d: "You never have to be on camera. A screen recording of a bot running with your voice over the top earns exactly the same as talking to the camera. What matters is that the viewer comes away knowing what Clunoid is.",
  },
  {
    t: "Every video must tell viewers about Clunoid",
    d: "Say what it is, out loud or on screen. Showing the site helps, but telling people is what counts — if someone watches to the end and cannot say what you were talking about, the video does not count towards your 30 days.",
  },
  {
    t: "Post every day, and make it decent",
    d: "Every video is about Clunoid and made by you. Consistency is what gets paid, but a month of throwaway videos is not a month of work, and we do check.",
  },
  {
    t: "Never copy another creator's video",
    d: "Take ideas from anyone. Take footage from nobody. Downloading someone's video and posting it is the fastest way to lose the month and your account.",
  },
  {
    t: "Same video on all three accounts, yes. Yesterday's video again, no.",
    d: "One video going up on all three of your platforms is exactly right — that is one post, not three. What does not count is taking a video you already posted on an earlier day and putting it up again as today's post. Every day needs something new.",
  },
  {
    t: "AI is fine for ideas, not for the video",
    d: "Use AI for hooks, scripts, angles and explanations. Get ideas from other trading creators too. Then make the video yourself — talk to camera, or just screen record and add a voice-over. Either earns.",
  },
  {
    t: "Pick three platforms, post to all three",
    d: "Three is what is required, not a limit — post on more if you want to, it can only help. Instagram, TikTok and YouTube Shorts are the ones we recommend. If one of them is banned or unusable where you live, swap it for Facebook Reels or Snapchat Spotlight. Your three together count as one post. Pick Facebook and you can link it to Instagram so one upload lands on both.",
  },
  {
    t: "Leave everything up until you are paid",
    d: "Deleting, archiving or hiding videos before payout cancels the month. If a platform takes a post down, it stops counting \u2014 tell us.",
  },
] as const;

export function phaseFor(day: number) {
  return PHASES.find((p) => day >= p.from && day <= p.to) ?? PHASES[0];
}

/** Caption skeletons. Change the wording to sound like you. */
export const TEMPLATES = [
  {
    t: "The explainer",
    body: "Most people have never seen a bot actually place a trade. Here is what it looks like.\n\nI use Clunoid for this — it is a site with free fully automated trading bots. The Deriv ones run right in your browser, and there are free Expert Advisors for MetaTrader 5 too. There are TradingView charts and a screener on there as well if you would rather analyse it yourself first.\n\nGo to clunoid.com — link in bio — and watch the bots trade.",
  },
  {
    t: "The myth",
    body: "\u201CTrading bots are a scam.\u201D Some are. Here is how to tell the difference in 30 seconds.\n\nThe one I use is Clunoid. It is free, you connect your own broker account so nobody else is holding your money, and you can watch the bots run before you risk anything.\n\nclunoid.com — link in bio.",
  },
  {
    t: "The one term",
    body: "Nobody explains what a synthetic index actually is, so here it is in plain English.\n\nIf you want to see one being traded instead of just hearing about it, Clunoid has free automated bots that do exactly that — in your browser on Deriv, or as Expert Advisors on MetaTrader 5.\n\nclunoid.com",
  },
  {
    t: "The honest take",
    body: "I am not going to tell you this makes money while you sleep. Here is what it actually does.\n\nClunoid is a site with free trading bots. You connect your own account, pick a bot, and it places the trades instead of you. There are charts and a screener on there too.\n\nHave a look yourself: clunoid.com",
  },
  {
    t: "The MT5 one",
    body: "If you have MetaTrader 5, you can do this today.\n\nClunoid has free Expert Advisors you download and drop straight into MT5 — they work on any MT5 broker, so you do not have to switch anything. There are browser bots for Deriv on there too.\n\nclunoid.com — link in bio.",
  },
  {
    t: "The setup",
    body: "This took 90 seconds start to finish.\n\nclunoid.com, connect your own broker account, pick a bot, press start. Nothing to install for the Deriv ones. It is free.\n\nLink in bio.",
  },
];

/** The footer line, identical on the sign-up page and the dashboard. */
export const DISCLAIMER = "Get paid to post.";

export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const fmt = (d: Date | string) =>
  (typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d)
    .toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const fmtShort = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
