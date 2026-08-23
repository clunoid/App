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

export const SOCIALS = [
  { key: "tiktok", label: "TikTok", logo: "/logos/tiktok.svg", ph: "@yourhandle" },
  { key: "instagram", label: "Instagram", logo: "/logos/instagram.svg", ph: "@yourhandle" },
  { key: "youtube", label: "YouTube", logo: "/logos/youtube.svg", ph: "@yourchannel" },
] as const;

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
  { m: "Month 1", pay: 100, note: "New account: $50" },
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
  { n: 2, icon: Clock, title: "Days 1–14: post once a day", body: "One video per day. Post that same video to TikTok, Instagram Reels and YouTube Shorts — all three together count as one post. Going slower at the start is on purpose: it builds reach and keeps accounts out of trouble." },
  { n: 3, icon: TrendingUp, title: "Days 15–30: post twice a day", body: "Two videos per day, each one posted to all three platforms. From month two onward this is your normal pace, every day." },
  { n: 4, icon: CalendarDays, title: "Finish 30 days, then request payout", body: "You get 2 grace days per month, so you need 28 qualifying days out of 30. Leave every video up. Deleting them before payout cancels the month." },
  { n: 5, icon: Wallet, title: "We check, then we pay", body: "We review for 3 working days — posts still live, made by you, following the rules, views genuine. You are paid within 7 days of requesting." },
];

export const DO = [
  "Show the platform in every single video — screen recording, the site, or the bots running.",
  "Say what it does in your own words. Your voice beats a script.",
  "Keep videos 30 seconds to 2 minutes. Go longer only if the content earns it.",
  "Re-export each video before posting so the three platforms do not get an identical file.",
  "Change the hook and caption for each platform.",
  "Add “Trading carries risk. Not financial advice.” to every caption.",
  "Mark it as paid: use #ad or the platform’s paid-partnership setting.",
  "Send people to clunoid.com — never straight to a broker signup page.",
  "Use only music from the platform’s own library.",
];

export const DONT = [
  "No profit screenshots. No account balances. No “I made $500 today”.",
  "No promises — nothing is guaranteed, risk-free, or passive income.",
  "No fake urgency, countdowns, or “only 3 spots left”.",
  "No borrowed clips, reposts, or anyone else’s footage.",
  "No bought views, follow-for-follow, or engagement groups.",
  "No posting the exact same file twice on the same platform.",
  "No second or third account to farm more posts. One account per platform.",
  "No speaking as Clunoid. Say “I use this”, never “we offer”.",
];

export const IDEAS = [
  { t: "Show it working", d: "Screen record a bot placing trades. No balance on screen. Let people watch the thing do its job." },
  { t: "Explain one word", d: "Pick one term — synthetic index, martingale, stop loss — and explain it in 45 seconds." },
  { t: "Bust a myth", d: "“Why most trading bots fail.” Honest takes travel further than hype." },
  { t: "Before and after", d: "How you used to do it by hand, and what changed." },
  { t: "Answer a real question", d: "Take a comment you actually got and answer it properly on camera." },
];

export const AI_PROMPTS = [
  "Give me 10 short-video hooks about automated trading that make no income claims.",
  "Explain what a synthetic index is, in 60 seconds, for a total beginner.",
  "Rewrite this caption so it is honest and has no guarantees.",
  "List 5 myths about trading bots I can correct in a 45-second video.",
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
      "Write the caption before you film. It keeps the video to one idea.",
    ],
  },
  {
    from: 8, to: 14,
    title: "Build the habit",
    aim: "One a day without thinking about it, and a small backlog ready.",
    todo: [
      "Batch-film 3 videos in one sitting so a bad day never breaks your streak.",
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
    aim: "Land all 30 days and get ready to request payout.",
    todo: [
      "Do not delete or archive anything — every video must still be live when we check.",
      "Make sure all three handles on your dashboard are correct.",
      "On day 30, request payout. Payment follows within 7 days of the check.",
    ],
  },
] as const;

export function phaseFor(day: number) {
  return PHASES.find((p) => day >= p.from && day <= p.to) ?? PHASES[0];
}

/** Caption skeletons that already carry the required disclosure and risk line. */
export const TEMPLATES = [
  {
    t: "The explainer",
    body: "Most people have never seen a bot actually place a trade. Here is what it looks like.\n\nI use Clunoid for this — link in bio.\n\n#ad Trading carries risk. Not financial advice.",
  },
  {
    t: "The myth",
    body: "“Trading bots are a scam.” Some are. Here is how to tell the difference in 30 seconds.\n\nI use Clunoid — clunoid.com\n\n#ad Trading carries risk. Not financial advice.",
  },
  {
    t: "The one term",
    body: "Nobody explains what a synthetic index actually is, so here it is in plain English.\n\nMore on clunoid.com\n\n#ad Trading carries risk. Not financial advice.",
  },
  {
    t: "The honest take",
    body: "I am not going to tell you this makes money while you sleep. Here is what it actually does.\n\nclunoid.com\n\n#ad Trading carries risk. Not financial advice.",
  },
];

/** The footer line, identical on the sign-up page and the dashboard. */
export const DISCLAIMER = "Payouts depend on meeting the terms in Rules. This is promotion work";

export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const fmt = (d: Date | string) =>
  (typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d)
    .toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const fmtShort = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
