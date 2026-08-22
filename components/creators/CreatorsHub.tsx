"use client";

/**
 * CREATOR PROGRAM — the guide creators read before and during their 30 days.
 *
 * Written to be followed, not admired: the money is stated first, then the five
 * steps, then the rules that keep accounts alive. Plain language throughout,
 * because a rule nobody understands is a payout argument later.
 *
 * The date planner is deliberately client-side only — it turns a start date into
 * the three dates a creator cares about without needing an account.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Clapperboard, CalendarDays, Check, X, Sparkles, Wallet,
  TrendingUp, ShieldCheck, Clock, Rocket,
} from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";

const A = "#a78bfa";          // programme accent
const GOOD = "#34d399";
const BAD = "#f2607d";

/** Base ladder: $100 to start, +$50 for each month completed, capped at $750. */
const LADDER = [
  { m: "Month 1", pay: 100, note: "New account: $50" },
  { m: "Month 2", pay: 150, note: "" },
  { m: "Month 3", pay: 200, note: "" },
  { m: "Month 4", pay: 250, note: "" },
  { m: "Month 5", pay: 300, note: "" },
  { m: "Month 6", pay: 350, note: "" },
  { m: "…", pay: null as number | null, note: "+$50 every month" },
  { m: "Month 14+", pay: 750, note: "Maximum base" },
];

const STEPS = [
  {
    n: 1,
    icon: Rocket,
    title: "Apply and get your start date",
    body: "Send us your TikTok, Instagram and YouTube handles. We check the accounts are yours and real. Your 30 days begin the day you are approved — that is your start date.",
  },
  {
    n: 2,
    icon: Clock,
    title: "Days 1–14: post once a day",
    body: "One video per day. Post that same video to TikTok, Instagram Reels and YouTube Shorts — all three together count as one post. Going slower at the start is on purpose: it builds reach and keeps new accounts out of trouble.",
  },
  {
    n: 3,
    icon: TrendingUp,
    title: "Days 15–30: post twice a day",
    body: "Two videos per day, each one posted to all three platforms. From month two onward this is your normal pace, every day.",
  },
  {
    n: 4,
    icon: CalendarDays,
    title: "Finish 30 days, then request payout",
    body: "You get 2 grace days per month, so you need 28 qualifying days out of 30. Leave every video up. Deleting them before payout cancels the month.",
  },
  {
    n: 5,
    icon: Wallet,
    title: "We check, then we pay",
    body: "We review for 3 working days — posts still live, made by you, following the rules, views genuine. You are paid within 7 days of requesting.",
  },
];

const DO = [
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

const DONT = [
  "No profit screenshots. No account balances. No “I made $500 today”.",
  "No promises — nothing is guaranteed, risk-free, or passive income.",
  "No fake urgency, countdowns, or “only 3 spots left”.",
  "No borrowed clips, reposts, or anyone else’s footage.",
  "No bought views, follow-for-follow, or engagement groups.",
  "No posting the exact same file twice on the same platform.",
  "No second or third account to farm more posts. One account per platform.",
  "No speaking as Clunoid. Say “I use this”, never “we offer”.",
];

const IDEAS = [
  { t: "Show it working", d: "Screen record a bot placing trades. No balance on screen. Let people watch the thing do its job." },
  { t: "Explain one word", d: "Pick one term — synthetic index, martingale, stop loss — and explain it in 45 seconds." },
  { t: "Bust a myth", d: "“Why most trading bots fail.” Honest takes travel further than hype." },
  { t: "Before and after", d: "How you used to do it by hand, and what changed." },
  { t: "Answer a real question", d: "Take a comment you actually got and answer it properly on camera." },
];

const AI_PROMPTS = [
  "Give me 10 short-video hooks about automated trading that make no income claims.",
  "Explain what a synthetic index is, in 60 seconds, for a total beginner.",
  "Rewrite this caption so it is honest and has no guarantees.",
  "List 5 myths about trading bots I can correct in a 45-second video.",
];

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function CreatorsHub() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [start, setStart] = useState(today);

  const dates = useMemo(() => {
    const d = new Date(start + "T00:00:00");
    if (Number.isNaN(d.getTime())) return null;
    return {
      start: d,
      switchDay: addDays(d, 14),   // day 15 — pace doubles
      finish: addDays(d, 29),      // day 30 — request payout
      paidBy: addDays(d, 39),      // 3 working days review + 7 to pay
    };
  }, [start]);

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-5 sm:px-8 lg:px-12">
        <header className="flex w-full flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> Command
          </Link>
          <span className="h-4 w-px" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.45)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
            <Clapperboard size={14} style={{ color: A }} />
            <span className="text-[12.5px] font-bold tracking-tight">Creator Program</span>
          </span>
        </header>

        {/* ── the offer, first ───────────────────────────────────────────── */}
        <section className="mt-8">
          <h1 className="text-[28px] font-bold leading-tight sm:text-[36px] lg:text-[40px]">
            Get paid every month to post about Clunoid
          </h1>
          <p className="mt-3 max-w-3xl text-[14px] leading-relaxed sm:text-[15.5px]" style={{ color: TC.muted }}>
            Make short videos, post them on your own TikTok, Instagram and YouTube, and get paid at the end of
            every 30 days. <b style={{ color: TC.text }}>Views are not required to get paid</b> — posting every day is.
            Views are how you earn more.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { v: "$100", l: "Your first month", s: "$50 if the account is brand new" },
              { v: "+$50", l: "Every month you finish", s: "Rising to $750 a month" },
              { v: "+$500", l: "Bonus for 10k+ view videos", s: "Any month you qualify" },
            ].map((c) => (
              <div key={c.l} className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: "rgba(167,139,250,0.35)", background: "linear-gradient(180deg, rgba(167,139,250,0.09), rgba(255,255,255,0.015))" }}>
                <div className="text-[28px] font-bold leading-none sm:text-[32px]" style={{ ...monoFont, color: A }}>{c.v}</div>
                <div className="mt-2 text-[13px] font-semibold">{c.l}</div>
                <div className="mt-0.5 text-[11.5px] leading-snug" style={{ color: TC.faint }}>{c.s}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed" style={{ color: TC.faint }}>
            Most you can earn in one month: <b style={{ color: TC.muted }}>$750 base + $500 bonus = $1,250</b>.
          </p>
        </section>

        {/* ── the five steps ─────────────────────────────────────────────── */}
        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
            <Check size={14} style={{ color: A }} /> What to do, step by step
          </h2>
          <ol className="mt-4 grid gap-3 lg:grid-cols-2">
            {STEPS.map(({ n, icon: Icon, title, body }) => (
              <li key={n} className="flex gap-3.5 rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: TC.panel }}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[14px] font-bold" style={{ background: `${A}22`, color: A, boxShadow: `inset 0 0 0 1px ${A}55` }}>{n}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Icon size={14} style={{ color: A }} />
                    <h3 className="text-[14.5px] font-bold">{title}</h3>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: TC.muted }}>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── posting rhythm ─────────────────────────────────────────────── */}
        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
            <Clock size={14} style={{ color: A }} /> How often to post
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { k: "Days 1–14", v: "1 video a day", s: "Slow start builds reach and protects the account" },
              { k: "Days 15–30", v: "2 videos a day", s: "Same for every month after this one" },
              { k: "Each video", v: "All 3 platforms", s: "TikTok + Reels + Shorts together = one post" },
            ].map((c) => (
              <div key={c.k} className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: TC.panel }}>
                <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{c.k}</div>
                <div className="mt-1.5 text-[17px] font-bold" style={{ color: A }}>{c.v}</div>
                <div className="mt-1 text-[11.5px] leading-snug" style={{ color: TC.muted }}>{c.s}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed" style={{ color: TC.faint }}>
            Videos should be 30 seconds to 2 minutes. Longer is fine when the content is worth it — never pad it out.
          </p>
        </section>

        {/* ── money detail ───────────────────────────────────────────────── */}
        <section className="mt-12 grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
              <Wallet size={14} style={{ color: A }} /> What you get paid
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[320px] border-collapse text-left">
                <thead>
                  <tr>
                    <th className="pb-2 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>Month finished</th>
                    <th className="pb-2 text-right text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>You get</th>
                    <th className="pb-2 pl-3 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {LADDER.map((r) => (
                    <tr key={r.m} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <td className="py-2 text-[13px] font-medium">{r.m}</td>
                      <td className="py-2 text-right text-[14px] font-bold" style={{ ...monoFont, color: r.pay ? A : TC.faint }}>
                        {r.pay ? `$${r.pay}` : "…"}
                      </td>
                      <td className="py-2 pl-3 text-[11.5px]" style={{ color: TC.faint }}>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: `${GOOD}55`, background: `linear-gradient(180deg, ${GOOD}14, rgba(255,255,255,0.015))` }}>
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
              <TrendingUp size={14} style={{ color: GOOD }} /> The $500 bonus
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: TC.muted }}>
              Get <b style={{ color: TC.text }}>$500 on top</b> of your monthly payout in any month where
              your videos consistently pass <b style={{ color: TC.text }}>10,000 views</b>.
            </p>
            <div className="mt-3 rounded-xl border p-3" style={{ borderColor: `${GOOD}44`, background: "rgba(0,0,0,0.2)" }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: GOOD }}>What counts as consistent</div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                At least <b style={{ color: TC.text }}>75% of your posts that month</b> reached 10,000+ views
                on at least one platform. Highest count across TikTok, Instagram or YouTube is the one we use.
              </p>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: TC.faint }}>
              You can earn this in any month, more than once, and it does not affect your base ladder.
            </p>
          </div>
        </section>

        {/* ── date planner ───────────────────────────────────────────────── */}
        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
            <CalendarDays size={14} style={{ color: A }} /> Your dates
          </h2>
          <div className="mt-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: TC.panel }}>
            <label className="flex flex-col gap-1.5 sm:max-w-xs">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>The day you start</span>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-xl border px-3 py-2 text-[13.5px] outline-none transition focus:border-violet-400"
                style={{ ...monoFont, borderColor: TC.line, background: "rgba(0,0,0,0.25)", color: TC.text, colorScheme: "dark" }}
              />
            </label>

            {dates && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  { k: "Day 15 — go to 2 a day", v: fmt(dates.switchDay), c: A },
                  { k: "Day 30 — request payout", v: fmt(dates.finish), c: GOOD },
                  { k: "Paid by", v: fmt(dates.paidBy), c: GOOD },
                ].map((d) => (
                  <div key={d.k} className="rounded-xl border p-3" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.2)" }}>
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{d.k}</div>
                    <div className="mt-1 text-[14px] font-bold" style={{ ...monoFont, color: d.c }}>{d.v}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              You have 2 grace days each month — 28 qualifying days out of 30 is a pass. Payment is within 7 days
              of your request, after a 3 working-day check.
            </p>
          </div>
        </section>

        {/* ── do / don't ─────────────────────────────────────────────────── */}
        <section className="mt-12 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: `${GOOD}55`, background: `linear-gradient(180deg, ${GOOD}12, rgba(255,255,255,0.015))` }}>
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: GOOD }}>
              <Check size={14} /> Always do this
            </h2>
            <ul className="mt-3 space-y-2">
              {DO.map((t) => (
                <li key={t} className="flex gap-2 text-[13px] leading-relaxed" style={{ color: TC.muted }}>
                  <Check size={14} className="mt-0.5 shrink-0" style={{ color: GOOD }} /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: `${BAD}55`, background: `linear-gradient(180deg, ${BAD}12, rgba(255,255,255,0.015))` }}>
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: BAD }}>
              <X size={14} /> Never do this
            </h2>
            <ul className="mt-3 space-y-2">
              {DONT.map((t) => (
                <li key={t} className="flex gap-2 text-[13px] leading-relaxed" style={{ color: TC.muted }}>
                  <X size={14} className="mt-0.5 shrink-0" style={{ color: BAD }} /> {t}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              These are not house rules for their own sake. Profit claims and copied clips are exactly what gets
              accounts restricted or banned in this subject. Breaking them cancels the month.
            </p>
          </div>
        </section>

        {/* ── what to make ───────────────────────────────────────────────── */}
        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
            <Sparkles size={14} style={{ color: A }} /> Videos that actually work
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IDEAS.map((i) => (
              <div key={i.t} className="rounded-2xl border p-4" style={{ borderColor: TC.line, background: TC.panel }}>
                <div className="text-[13.5px] font-bold">{i.t}</div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{i.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: TC.line, background: "rgba(255,255,255,0.02)" }}>
            <div className="text-[13.5px] font-bold">Use AI to find ideas</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              Ask an AI for angles, hooks and simpler explanations — then film it yourself, in your own words.
              Try these:
            </p>
            <ul className="mt-3 space-y-1.5">
              {AI_PROMPTS.map((p) => (
                <li key={p} className="rounded-lg border px-3 py-2 text-[12px] leading-relaxed" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.2)", color: TC.muted }}>
                  &ldquo;{p}&rdquo;
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              Do not post AI-generated video with no face or voice of your own. It performs badly and platforms
              increasingly label it.
            </p>
          </div>
        </section>

        {/* ── the one rule that voids everything ─────────────────────────── */}
        <section className="mt-12">
          <div className="rounded-2xl border p-5" style={{ borderColor: `${A}55`, background: `linear-gradient(180deg, ${A}12, rgba(255,255,255,0.015))` }}>
            <h2 className="text-[15px] font-bold">Every video must show Clunoid</h2>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed" style={{ color: TC.muted }}>
              A video that does not clearly feature or mention the platform does not count towards your 30 days —
              even if it did well. Show the site, show a bot running, or say the name clearly. If someone watches
              your video and cannot tell what you are talking about, it will not be counted.
            </p>
          </div>
        </section>

        {/* ── apply ──────────────────────────────────────────────────────── */}
        <section className="mt-12">
          <div className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: TC.line, background: TC.panel }}>
            <h2 className="text-[18px] font-bold sm:text-[20px]">Ready to start?</h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed" style={{ color: TC.muted }}>
              Send your TikTok, Instagram and YouTube handles. We check the accounts are yours, then give you a
              start date. Places are limited so each creator gets proper support.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold" style={{ background: `${A}22`, color: A, boxShadow: `inset 0 0 0 1px ${A}55` }}>
              <Clapperboard size={15} /> Applications open soon
            </div>
          </div>
        </section>

        <p className="mt-10 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: A }} />
          Trading carries risk, and so does talking about it online. You are responsible for your own accounts and
          for following each platform&rsquo;s rules. Payouts depend on meeting the terms above. This is promotion
          work, not financial advice, and nothing here is a promise of trading results.
        </p>
      </div>
    </main>
  );
}
