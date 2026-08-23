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
 * recommended set and are picked by default — they have the reach. The rest are
 * here because a recommended one is not always usable: TikTok is banned in
 * India, blocked or restricted in other places, and someone who cannot open it
 * should not be shut out of the programme over it.
 */
export const PLATFORM_CATALOGUE = [
  { key: "tiktok",    label: "TikTok",           logo: "/logos/tiktok.svg",    ph: "@handle or paste your link", main: true },
  { key: "instagram", label: "Instagram Reels",  logo: "/logos/instagram.svg", ph: "@handle or paste your link", main: true },
  { key: "youtube",   label: "YouTube Shorts",   logo: "/logos/youtube.svg",   ph: "@channel or paste your link", main: true },
  { key: "facebook",  label: "Facebook Reels",   logo: "/logos/facebook.svg",  ph: "@page or paste your link",   main: false, note: "Link it to Instagram and one upload posts to both" },
  { key: "rednote",   label: "RedNote",          logo: "/logos/rednote.svg",   ph: "@handle or paste your link", main: false, note: "Xiaohongshu — big in China and among Chinese speakers" },
  { key: "snapchat",  label: "Snapchat Spotlight", logo: "/logos/snapchat.svg", ph: "@handle or paste your link", main: false },
  { key: "josh",      label: "Josh",             logo: "/logos/josh.svg",      ph: "@handle or paste your link", main: false, note: "India" },
  { key: "moj",       label: "Moj",              logo: "/logos/moj.svg",       ph: "@handle or paste your link", main: false, note: "India" },
  { key: "kwai",      label: "Kwai",             logo: "/logos/kwai.svg",      ph: "@handle or paste your link", main: false, note: "Brazil and Latin America" },
  { key: "likee",     label: "Likee",            logo: "/logos/likee.svg",     ph: "@handle or paste your link", main: false },
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
  { n: 4, icon: CalendarDays, title: "Finish 30 days, then ask to be paid", body: "You can miss 2 days a month, so you need 28 days out of 30. Leave every video up — deleting them before you are paid cancels the month." },
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
    aim: "Land all 30 days and get ready to be paid.",
    todo: [
      "Do not delete or archive anything — every video must still be live when we check.",
      "Make sure all three handles on your dashboard are correct.",
      "On day 30, ask to be paid. The money follows within 7 days of our check.",
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
    d: "Instagram, TikTok and YouTube Shorts are the ones we recommend — they have the reach. If one of them is banned or unusable where you live, swap it for Facebook Reels, RedNote, Snapchat, Josh, Moj, Kwai or Likee. Your three together count as one post. Pick Facebook and you can link it to Instagram so one upload lands on both.",
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
    body: "Most people have never seen a bot actually place a trade. Here is what it looks like.\n\nI use Clunoid for this — link in bio.",
  },
  {
    t: "The myth",
    body: "“Trading bots are a scam.” Some are. Here is how to tell the difference in 30 seconds.\n\nI use Clunoid — clunoid.com",
  },
  {
    t: "The one term",
    body: "Nobody explains what a synthetic index actually is, so here it is in plain English.\n\nMore on clunoid.com",
  },
  {
    t: "The honest take",
    body: "I am not going to tell you this makes money while you sleep. Here is what it actually does.\n\nclunoid.com",
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
