"use client";

/**
 * CREATOR PROGRAM — the dashboard a creator sees after registering.
 *
 * Registration is the start of the work, not the end of it, so what follows is a
 * place to run from: where you are in the 30 days, what today asks for, what you
 * have posted, what you have been paid, and the rules and ideas within reach
 * instead of scrolled past.
 *
 * The one thing to understand about the clock: it does NOT start at registration.
 * It starts when the creator confirms their first post is live, which is also the
 * moment all three handles become mandatory. Until then the dashboard shows one
 * thing — how to start.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Clapperboard, LayoutDashboard, CalendarRange, ListChecks, Wallet, Sparkles,
  BookOpen, UserRound, Check, X, Loader2, Rocket, TrendingUp, Clock, ShieldCheck,
  CircleAlert, PartyPopper, Copy, ExternalLink, Undo2, CalendarCheck,
} from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import {
  A, GOOD, BAD, SOCIALS, PAYOUTS, LADDER, DO, DONT, IDEAS, AI_PROMPTS,
  PHASES, phaseFor, TEMPLATES, fmt, fmtShort, DISCLAIMER,
} from "./content";
import { PayoutPicker } from "./PayoutPicker";
import { Reminders } from "./Reminders";
import { FieldOk, useToast } from "./Feedback";
import { computeProgress, PLATFORMS, GRACE_DAYS, QUALIFYING_DAYS_NEEDED, type Progress } from "@/lib/creators/progress";

// ── the shape /api/creators/me returns ──────────────────────────────────────
export type Creator = {
  id: string; name: string; email: string; country: string;
  tiktok: string | null; instagram: string | null; youtube: string | null;
  payout_method: string | null; new_accounts: boolean; status: string;
  applied_at: string; started_at: string | null; first_post_at: string | null;
  handlesComplete: boolean;
};
export type Payout = {
  id: string; month_number: number; period_start: string; period_end: string;
  base_usd: number; bonus_usd: number; status: string;
  requested_at: string | null; paid_at: string | null; method: string | null; reference: string | null;
};
export type PostEntry = { id: string; posted_on: string; slot: number; platforms: string[]; link: string | null };
export type Me = {
  creator: Creator;
  posts: PostEntry[];
  payouts: Payout[];
  totals: { paidUsd: number; pendingUsd: number; monthsPaid: number };
  nextPayout: { month: number; baseUsd: number; bonusPossibleUsd: number } | null;
  progress: Progress;
  serverTime: string;
};

type Show = (text: string, tone?: "ok" | "bad") => void;

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "plan", label: "My 30 days", icon: CalendarRange },
  { key: "posts", label: "Post log", icon: ListChecks },
  { key: "payouts", label: "Payouts", icon: Wallet },
  { key: "ideas", label: "Ideas & templates", icon: Sparkles },
  { key: "rules", label: "Rules", icon: BookOpen },
  { key: "details", label: "My details", icon: UserRound },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const card = "rounded-2xl border p-4 sm:p-5";
const cardStyle = { borderColor: TC.line, background: TC.panel } as const;
const labelCls = "text-[10.5px] font-semibold uppercase tracking-wider";
const money = (n: number) => `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

export function CreatorDashboard({ me, token, onRefresh, justRegistered = false }: { me: Me; token: string; onRefresh: () => Promise<void>; justRegistered?: boolean }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const { creator } = me;
  const { show, node: toast } = useToast();

  // Recompute locally each second so the countdown moves without polling.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const progress = useMemo(
    () => computeProgress(creator.first_post_at, me.posts, now),
    [creator.first_post_at, me.posts, now],
  );

  // Welcome them once, on the render that follows registering.
  const welcomed = useRef(false);
  useEffect(() => {
    if (justRegistered && !welcomed.current) { welcomed.current = true; show("You are in. Welcome aboard."); }
  }, [justRegistered, show]);

  const started = progress.phase !== "awaiting_first_post";

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      <div className="relative z-10 w-full px-5 py-5 sm:px-8 lg:px-12 xl:px-16">
        <header className="flex w-full flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> <span className="hidden sm:inline">Command</span>
          </Link>
          {/* A phone has room for the back arrow, the name and the day badge —
              the label and the programme chip are what give way. */}
          <span className="hidden h-4 w-px sm:block" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.45)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
            {/* The mark is the first thing to drop on a phone — the name carries it. */}
            <Clapperboard size={14} className="hidden sm:block" style={{ color: A }} />
            <span className="text-[12.5px] font-bold tracking-tight">Creator Program</span>
          </span>
          <span className="ml-auto flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-[12.5px]" style={{ color: TC.muted }}>{creator.name}</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold"
              style={started
                ? { background: `${GOOD}1f`, color: GOOD, boxShadow: `inset 0 0 0 1px ${GOOD}55` }
                : { background: `${A}1f`, color: A, boxShadow: `inset 0 0 0 1px ${A}55` }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: started ? GOOD : A }} />
              {started ? `Day ${progress.day} of 30` : "Not started"}
            </span>
          </span>
        </header>

        <div className="mt-6 gap-6 lg:flex">
          <Sidebar tab={tab} setTab={setTab} progress={progress} started={started} />

          <div className="min-w-0 flex-1">
            {tab === "overview" && <Overview me={me} progress={progress} token={token} onRefresh={onRefresh} now={now} setTab={setTab} show={show} />}
            {tab === "plan" && <PlanPanel progress={progress} />}
            {tab === "posts" && <PostsPanel me={me} progress={progress} token={token} onRefresh={onRefresh} show={show} />}
            {tab === "payouts" && <PayoutsPanel me={me} progress={progress} />}
            {tab === "ideas" && <IdeasPanel />}
            {tab === "rules" && <RulesPanel />}
            {tab === "details" && <DetailsPanel me={me} token={token} onRefresh={onRefresh} show={show} />}
          </div>
        </div>

        <p className="mt-10 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: A }} />
          {DISCLAIMER}
        </p>
      </div>

      {toast}
    </main>
  );
}

/**
 * The single most important thing to understand about this programme, so it goes
 * first on both pages: consistency is what gets paid, views are only the bonus.
 * People throttle themselves worrying about reach — this is here to stop that.
 */
export function PostDailyBanner() {
  return (
      <section className="flex items-start gap-3 rounded-2xl border p-4"
        style={{ borderColor: `${GOOD}66`, background: `linear-gradient(180deg, ${GOOD}16, rgba(255,255,255,0.015))` }}>
        <CalendarCheck size={18} className="mt-0.5 shrink-0" style={{ color: GOOD }} />
        <p className="text-[13px] leading-relaxed sm:text-[13.5px]" style={{ color: TC.muted }}>
          <b style={{ color: TC.text }}>Post every day. You do not need views to get paid.</b> Post decent videos
          every day, follow the rules, and you get paid. Get <b style={{ color: TC.text }}>10,000 views</b>{" "}
          consistently and you earn <b style={{ color: GOOD }}>$500</b> on top.
        </p>
      </section>
  );
}

/* ── sidebar ──────────────────────────────────────────────────────────────── */

function Sidebar({ tab, setTab, progress, started }: { tab: TabKey; setTab: (t: TabKey) => void; progress: Progress; started: boolean }) {
  return (
    <nav className="lg:w-[212px] lg:shrink-0">
      {/* Desktop: a sticky column. Mobile: a scrolling strip of the same items. */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 lg:mx-0 lg:sticky lg:top-5 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {TABS.map(({ key, label, icon: Icon }) => {
          const on = tab === key;
          return (
            <button key={key} type="button" onClick={() => setTab(key)}
              className="flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition lg:w-full"
              style={on
                ? { borderColor: `${A}88`, background: `${A}1f`, color: TC.text }
                : { borderColor: TC.line, background: "rgba(0,0,0,0.22)", color: TC.muted }}>
              <Icon size={15} style={{ color: on ? A : TC.faint }} />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          );
        })}
      </div>

      {started && (
        <div className="mt-3 hidden rounded-xl border p-3 lg:block" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.22)" }}>
          <div className={labelCls} style={{ color: TC.faint }}>Progress</div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progress.percent}%`, background: A }} />
          </div>
          <div className="mt-2 text-[11.5px]" style={{ color: TC.muted }}>
            <b style={{ color: TC.text }}>{progress.qualifyingDays}</b> of {QUALIFYING_DAYS_NEEDED} days needed
          </div>
        </div>
      )}
    </nav>
  );
}

/* ── overview ─────────────────────────────────────────────────────────────── */

function Overview({ me, progress, token, onRefresh, now, setTab, show }: {
  me: Me; progress: Progress; token: string; onRefresh: () => Promise<void>; now: Date; setTab: (t: TabKey) => void; show: Show;
}) {
  const { creator, totals, nextPayout } = me;

  if (progress.phase === "awaiting_first_post") {
    return (
      <div className="space-y-4">
        <PostDailyBanner />
        <PayoutReminder creator={creator} setTab={setTab} />
        <StartCard me={me} token={token} onRefresh={onRefresh} setTab={setTab} show={show} />
      </div>
    );
  }

  const phase = phaseFor(progress.day);
  const done = progress.todayDone;

  return (
    <div className="space-y-4">
      <PostDailyBanner />
      <PayoutReminder creator={creator} setTab={setTab} />

      {/* headline */}
      <section className={card} style={{ borderColor: `${A}55`, background: `linear-gradient(180deg, ${A}10, rgba(255,255,255,0.015))` }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className={labelCls} style={{ color: TC.faint }}>You are on</div>
            <div className="mt-1 text-[30px] font-bold leading-none sm:text-[36px]">
              Day {progress.day} <span className="text-[18px] font-semibold" style={{ color: TC.faint }}>of 30</span>
            </div>
            <div className="mt-2 text-[13px]" style={{ color: TC.muted }}>
              Finish these 30 days and you get <b style={{ color: GOOD }}>{nextPayout ? money(nextPayout.baseUsd) : "paid"}</b>
              {nextPayout && nextPayout.baseUsd < 750 ? (
                <> — then <b style={{ color: TC.text }}>{money(nextPayout.baseUsd + 50)}</b> the month after, and $50 more every month after that.</>
              ) : (
                <> — the top of the ladder.</>
              )}
            </div>
          </div>
          <Countdown to={progress.payoutOpensAt} now={now} label="Until you can ask to be paid" />
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progress.percent}%`, background: `linear-gradient(90deg, ${A}, ${GOOD})` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11.5px]" style={{ color: TC.faint }}>
          <span>{progress.percent}% of the month&rsquo;s videos delivered</span>
          <span>Finishes {progress.finishDate ? fmt(progress.finishDate) : "—"}</span>
        </div>
      </section>

      {/* today */}
      <section className={card} style={done ? { borderColor: `${GOOD}55`, background: `linear-gradient(180deg, ${GOOD}12, rgba(255,255,255,0.015))` } : cardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              {done ? <Check size={16} style={{ color: GOOD }} /> : <Clock size={16} style={{ color: A }} />}
              {done ? "Today is done" : `Today: ${progress.requiredToday} video${progress.requiredToday > 1 ? "s" : ""}`}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              {done
                ? `${progress.doneToday} of ${progress.requiredToday} logged. Come back tomorrow — the streak is what gets paid.`
                : `${progress.doneToday} of ${progress.requiredToday} logged. Each video goes to all three platforms; that counts as one.`}
            </p>
          </div>
          <button type="button" onClick={() => setTab("posts")}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90"
            style={done ? { background: "rgba(255,255,255,0.07)", color: TC.text } : { background: A, color: "#12091f" }}>
            <ListChecks size={15} /> {done ? "Open post log" : "Log today's post"}
          </button>
        </div>
      </section>

      {/* the numbers */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Days done" value={`${progress.qualifyingDays}`} sub={`You need ${QUALIFYING_DAYS_NEEDED} to get paid`} tone={progress.onTrack ? A : BAD} />
        <Stat label="Days you can still miss" value={`${progress.graceLeft}`} sub={`${GRACE_DAYS} a month, no more`} tone={progress.graceLeft > 0 ? A : BAD} />
        <Stat label="Videos posted" value={`${progress.postsLogged}`} sub="Since you started" tone={A} />
        <Stat label="Your total earnings" value={money(totals.paidUsd)} sub={totals.pendingUsd > 0 ? `${money(totals.pendingUsd)} coming to you` : "Money already paid to you"} tone={GOOD} />
      </section>

      {!progress.onTrack && (
        <section className={card} style={{ borderColor: `${BAD}55`, background: `linear-gradient(180deg, ${BAD}12, rgba(255,255,255,0.015))` }}>
          <h2 className="flex items-center gap-2 text-[14px] font-bold" style={{ color: BAD }}>
            <CircleAlert size={15} /> This month can no longer reach 28 days
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
            You have missed {progress.missedDays} days and only {GRACE_DAYS} are allowed. Keep posting — the habit is
            what carries into next month, and your ladder position is unaffected — but this month will not qualify
            for payout.
          </p>
        </section>
      )}

      {/* what this month pays */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className={card} style={cardStyle}>
          <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
            <Wallet size={14} style={{ color: A }} /> What this month pays
          </h2>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-[30px] font-bold leading-none" style={{ ...monoFont, color: A }}>
              {nextPayout ? money(nextPayout.baseUsd) : "—"}
            </span>
            <span className="pb-0.5 text-[12px]" style={{ color: TC.faint }}>
              for your month {nextPayout?.month ?? 1}{nextPayout?.month === 1 ? (creator.new_accounts ? " — brand-new accounts" : " — accounts you already had") : ""}
            </span>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
            You can earn <b style={{ color: GOOD }}>$500</b> on top if at least 75% of this month&rsquo;s posts pass
            10,000 views on any one platform.
          </p>
        </div>

        <div className={card} style={cardStyle}>
          <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
            <CalendarRange size={14} style={{ color: A }} /> Your dates
          </h2>
          <div className="mt-3 space-y-2">
            <DateRow k="Day 1 — first post" v={progress.startDate} />
            <DateRow k="Day 15 — go to 2 a day" v={progress.paceChangeDate} tone={progress.day < 15 ? A : undefined} />
            <DateRow k="Day 30 — request payout" v={progress.finishDate} tone={GOOD} />
            <DateRow k="Paid by" v={progress.paidByDate} tone={GOOD} />
          </div>
        </div>
      </section>

      {/* where you are in the plan */}
      <section className={card} style={cardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
            <Rocket size={14} style={{ color: A }} /> What days {phase.from}–{phase.to} are for
          </h2>
          <button type="button" onClick={() => setTab("plan")} className="text-[12px] font-medium transition hover:opacity-80" style={{ color: A }}>
            See the whole month →
          </button>
        </div>
        <div className="mt-3 text-[14.5px] font-bold">{phase.title}</div>
        <ul className="mt-2 space-y-1.5">
          {phase.todo.map((t) => (
            <li key={t} className="flex gap-2 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              <Check size={13} className="mt-0.5 shrink-0" style={{ color: A }} /> {t}
            </li>
          ))}
        </ul>
      </section>

      <Reminders title="Reminders for every creator" />
    </div>
  );
}

/**
 * Nags — gently, and only while it is true — for a payout rail. Choosing one is
 * optional at sign-up, so this is where it gets asked for, on every visit until
 * it is set. Once set it disappears; My details is where it gets changed.
 */
function PayoutReminder({ creator, setTab }: { creator: Creator; setTab: (t: TabKey) => void }) {
  if (creator.payout_method) return null;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border p-4"
      style={{ borderColor: `${A}66`, background: `linear-gradient(180deg, ${A}14, rgba(255,255,255,0.015))` }}>
      <Wallet size={17} className="shrink-0" style={{ color: A }} />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-bold">Choose how you want to be paid</div>
        <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
          Not urgent — nothing is owed yet — but it has to be set before your first payout. You can change it any time.
        </p>
      </div>
      <button type="button" onClick={() => setTab("details")}
        className="shrink-0 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition hover:opacity-90"
        style={{ background: A, color: "#12091f" }}>
        Set it now
      </button>
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-2xl border p-4" style={cardStyle}>
      <div className={labelCls} style={{ color: TC.faint }}>{label}</div>
      <div className="mt-1.5 text-[24px] font-bold leading-none" style={{ ...monoFont, color: tone }}>{value}</div>
      <div className="mt-1.5 text-[11.5px]" style={{ color: TC.faint }}>{sub}</div>
    </div>
  );
}

function DateRow({ k, v, tone }: { k: string; v: string | null; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b pb-2 last:border-0 last:pb-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <span className="text-[12.5px]" style={{ color: TC.muted }}>{k}</span>
      <span className="text-[13px] font-bold" style={{ ...monoFont, color: tone ?? TC.text }}>{v ? fmt(v) : "—"}</span>
    </div>
  );
}

function Countdown({ to, now, label }: { to: string | null; now: Date; label: string }) {
  if (!to) return null;
  const ms = Date.parse(to) - now.getTime();
  const done = ms <= 0;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);

  return (
    <div className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: done ? `${GOOD}55` : TC.line, background: "rgba(0,0,0,0.28)" }}>
      <div className={labelCls} style={{ color: TC.faint }}>{done ? "Payout is open" : label}</div>
      {done ? (
        <div className="mt-1 flex items-center gap-1.5 text-[16px] font-bold" style={{ color: GOOD }}>
          <PartyPopper size={16} /> Request it now
        </div>
      ) : (
        <div className="mt-1 flex items-baseline gap-1" style={{ ...monoFont, color: A }}>
          {[[d, "d"], [h, "h"], [m, "m"], [s, "s"]].map(([n, u]) => (
            <span key={u as string} className="text-[18px] font-bold">
              {String(n).padStart(2, "0")}<span className="text-[11px] font-semibold" style={{ color: TC.faint }}>{u}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── the gate: confirming the first post starts everything ────────────────── */

function StartCard({ me, token, onRefresh, setTab, show }: { me: Me; token: string; onRefresh: () => Promise<void>; setTab: (t: TabKey) => void; show: Show }) {
  const { creator } = me;
  const [handles, setHandles] = useState({
    tiktok: creator.tiktok ?? "", instagram: creator.instagram ?? "", youtube: creator.youtube ?? "",
  });
  const [checked, setChecked] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allHandles = SOCIALS.every((s) => handles[s.key].trim().length > 0);
  const allPlatforms = PLATFORMS.every((p) => checked.includes(p));

  async function start() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      // Handles first — the clock must not start against a half-filled profile.
      const save = await fetch("/api/creators/profile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...handles }),
      });
      const saved = await save.json().catch(() => ({}));
      if (!save.ok) { setErr(saved.error || "Could not save your handles."); return; }

      const res = await fetch("/api/creators/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, platforms: checked, link }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || "Could not start. Please try again."); return; }
      show("Day 1 has begun. Your countdown is running.");
      await onRefresh();
    } catch {
      setErr("Could not reach us just now. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <section className={card} style={{ borderColor: `${A}55`, background: `linear-gradient(180deg, ${A}12, rgba(255,255,255,0.015))` }}>
        <h1 className="text-[22px] font-bold sm:text-[26px]">You are in. Day 1 starts with your first video.</h1>
        <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
          Your 30 days begin when your <b style={{ color: TC.text }}>first video is live</b> — not when you
          registered. That way nobody loses days to a slow start. Post your first video to all three platforms, then
          confirm it below and the countdown starts.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px]" style={{ color: TC.faint }}>
          <span className="rounded-lg px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.28)" }}>
            Registered {fmt(creator.applied_at)}
          </span>
          <span className="rounded-lg px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.28)" }}>
            Clock starts on your first post
          </span>
        </div>
      </section>

      {/* step 1 — handles */}
      <section className={card} style={cardStyle}>
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <span className="grid h-6 w-6 place-items-center rounded-lg text-[12px] font-bold" style={{ background: `${A}22`, color: A }}>1</span>
          Add your three accounts
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          Paste the link to each profile, or just type the handle — either works. All three are needed before the
          clock starts, because they are what we check your posts against. Put{" "}
          <b style={{ color: TC.text }}>clunoid.com</b> in the bio of each one before you post, so &ldquo;link in
          bio&rdquo; is true from day one.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SOCIALS.map((s) => (
            <label key={s.key} className="flex items-center gap-2.5 rounded-xl border px-3 py-2" style={{ borderColor: handles[s.key] ? `${A}66` : TC.line, background: "rgba(0,0,0,0.25)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.logo} alt={s.label} className="h-5 w-5 shrink-0" />
              <input value={handles[s.key]} onChange={(e) => setHandles((p) => ({ ...p, [s.key]: e.target.value }))}
                placeholder={s.ph} aria-label={s.label}
                className="w-full bg-transparent text-[13.5px] outline-none" style={{ color: TC.text }} />
              {handles[s.key] && <Check size={14} className="shrink-0" style={{ color: A }} />}
            </label>
          ))}
        </div>
        {allHandles && (
          <div className="mt-2.5">
            <FieldOk>All three accounts added — confirm your first video below</FieldOk>
          </div>
        )}
      </section>

      {/* step 2 — confirm the post */}
      <section className={card} style={cardStyle}>
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <span className="grid h-6 w-6 place-items-center rounded-lg text-[12px] font-bold" style={{ background: `${A}22`, color: A }}>2</span>
          Confirm your first video is live
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          Tick each platform it is up on. All three are needed — one video on all three is what counts as one post.
        </p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
          {SOCIALS.map((s) => {
            const on = checked.includes(s.key);
            return (
              <label key={s.key} className="flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition"
                style={on ? { borderColor: GOOD, background: `${GOOD}1a` } : { borderColor: TC.line, background: "rgba(0,0,0,0.25)" }}>
                <input type="checkbox" className="sr-only" checked={on}
                  onChange={() => { setChecked((p) => (on ? p.filter((x) => x !== s.key) : [...p, s.key])); if (!on) show(s.label + " confirmed"); }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.logo} alt="" aria-hidden className="h-5 w-5 shrink-0" />
                <span className="text-[13px] font-medium" style={{ color: on ? TC.text : TC.muted }}>{s.label}</span>
                {on && <Check size={15} className="ml-auto shrink-0" style={{ color: GOOD }} />}
              </label>
            );
          })}
        </div>
        {allPlatforms && (
          <div className="mt-2.5">
            <FieldOk>All three confirmed — press start and your 30 days begin</FieldOk>
          </div>
        )}

        <label className="mt-3 flex flex-col gap-1.5">
          <span className={labelCls} style={{ color: TC.faint }}>Link to the video (optional)</span>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…"
            className="rounded-xl border px-3 py-2.5 text-[13.5px] outline-none transition focus:border-violet-400"
            style={{ borderColor: TC.line, background: "rgba(0,0,0,0.25)", color: TC.text }} />
        </label>

        {err && <p className="mt-3 text-[12.5px] font-medium" style={{ color: BAD }}>{err}</p>}

        <button type="button" onClick={start} disabled={busy || !allHandles || !allPlatforms}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          style={{ background: A, color: "#12091f" }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
          {busy ? "Starting…" : "Start my 30 days"}
        </button>
        {!allHandles && <p className="mt-2 text-[11.5px]" style={{ color: TC.faint }}>Add all three handles first.</p>}
        {allHandles && !allPlatforms && <p className="mt-2 text-[11.5px]" style={{ color: TC.faint }}>Tick all three platforms once the video is up on each.</p>}
      </section>

      <Reminders title="Read this before your first post" />

      <section className={card} style={cardStyle}>
        <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
          <Sparkles size={14} style={{ color: A }} /> Not sure what to make first?
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          The easiest first video is a screen recording of a bot placing trades, with no balance on screen.
        </p>
        <button type="button" onClick={() => setTab("ideas")}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12.5px] font-medium transition hover:opacity-85"
          style={{ borderColor: TC.line, background: "rgba(0,0,0,0.25)", color: TC.text }}>
          <Sparkles size={14} style={{ color: A }} /> Ideas and caption templates
        </button>
      </section>
    </div>
  );
}

/* ── my 30 days ───────────────────────────────────────────────────────────── */

function PlanPanel({ progress }: { progress: Progress }) {
  const started = progress.phase !== "awaiting_first_post";
  return (
    <div className="space-y-4">
      <section className={card} style={cardStyle}>
        <h2 className="text-[17px] font-bold">Your first month, phase by phase</h2>
        <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          The pace is deliberately slow for two weeks. Posting once a day builds reach and keeps a new account out of
          trouble; doubling too early is what gets people throttled.
        </p>
      </section>

      <div className="space-y-3">
        {PHASES.map((p) => {
          const current = started && progress.day >= p.from && progress.day <= p.to;
          const past = started && progress.day > p.to;
          return (
            <section key={p.from} className={card}
              style={current
                ? { borderColor: `${A}77`, background: `linear-gradient(180deg, ${A}12, rgba(255,255,255,0.015))` }
                : { ...cardStyle, opacity: past ? 0.72 : 1 }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg px-2 py-1 text-[11px] font-bold" style={{ background: current ? `${A}26` : "rgba(255,255,255,0.06)", color: current ? A : TC.faint, ...monoFont }}>
                  Days {p.from}–{p.to}
                </span>
                <h3 className="text-[15px] font-bold">{p.title}</h3>
                {current && <span className="rounded-lg px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider" style={{ background: `${A}26`, color: A }}>You are here</span>}
                {past && <Check size={15} style={{ color: GOOD }} />}
                <span className="ml-auto text-[11.5px]" style={{ ...monoFont, color: TC.faint }}>
                  {p.from < 15 ? "1 video a day" : "2 videos a day"}
                </span>
              </div>
              <p className="mt-2 text-[13px]" style={{ color: TC.muted }}>{p.aim}</p>
              <ul className="mt-2.5 space-y-1.5">
                {p.todo.map((t) => (
                  <li key={t} className="flex gap-2 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                    <Check size={13} className="mt-0.5 shrink-0" style={{ color: current ? A : TC.faint }} /> {t}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {started && <DayGrid progress={progress} />}
    </div>
  );
}

function DayGrid({ progress }: { progress: Progress }) {
  return (
    <section className={card} style={cardStyle}>
      <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
        <CalendarRange size={14} style={{ color: A }} /> All 30 days
      </h2>
      <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {progress.days.map((d) => {
          const bg = d.qualified ? `${GOOD}26` : d.missed ? `${BAD}22` : d.isToday ? `${A}26` : "rgba(255,255,255,0.04)";
          const fg = d.qualified ? GOOD : d.missed ? BAD : d.isToday ? A : TC.faint;
          return (
            <div key={d.day} title={`Day ${d.day} · ${fmtShort(d.date)} · ${d.done}/${d.required} posted`}
              className="rounded-lg py-2 text-center"
              style={{ background: bg, boxShadow: d.isToday ? `inset 0 0 0 1px ${A}` : undefined }}>
              <div className="text-[12px] font-bold" style={{ ...monoFont, color: fg }}>{d.day}</div>
              <div className="text-[9.5px]" style={{ color: fg, opacity: 0.85 }}>{d.done}/{d.required}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px]" style={{ color: TC.faint }}>
        <Legend c={GOOD} t="Qualified" /><Legend c={A} t="Today" /><Legend c={BAD} t="Missed" /><Legend c="rgba(255,255,255,0.25)" t="Ahead" />
      </div>
    </section>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded" style={{ background: c }} />{t}</span>;
}

/* ── post log ─────────────────────────────────────────────────────────────── */

function PostsPanel({ me, progress, token, onRefresh, show }: { me: Me; progress: Progress; token: string; onRefresh: () => Promise<void>; show: Show }) {
  const [checked, setChecked] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  // Which row is asking "are you sure?". Deleting a logged day can cost a
  // qualifying day, so it never happens on one click.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);

  const started = progress.phase !== "awaiting_first_post";
  const allPlatforms = PLATFORMS.every((p) => checked.includes(p));
  const roomToday = started && progress.doneToday < progress.requiredToday;

  async function log() {
    if (busy) return;
    setBusy(true); setErr(null); setOk(false);
    try {
      const res = await fetch("/api/creators/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, platforms: checked, link }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || "Could not save that."); return; }
      setChecked([]); setLink(""); setOk(true);
      show("Logged. Day " + progress.day + " is recorded.");
      await onRefresh();
    } catch { setErr("Could not reach us just now."); }
    finally { setBusy(false); }
  }

  async function undo(id: string) {
    if (undoing) return;
    setUndoing(id);
    try {
      const res = await fetch("/api/creators/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "undo", id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { show(data.error || "Could not remove that.", "bad"); return; }
      show(data.restarted ? "Removed. Your clock is stopped until you log a first post again." : "Entry removed.");
      setConfirming(null);
      await onRefresh();
    } catch {
      show("Could not reach us just now.", "bad");
    } finally { setUndoing(null); }
  }

  if (!started) {
    return (
      <section className={card} style={cardStyle}>
        <h2 className="text-[16px] font-bold">Nothing to log yet</h2>
        <p className="mt-1.5 text-[12.5px]" style={{ color: TC.muted }}>
          Confirm your first post on the Overview tab — that starts your 30 days and opens this log.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className={card} style={cardStyle}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-bold">
            Log a video for today <span style={{ color: TC.faint }}>· day {progress.day}</span>
          </h2>
          <span className="text-[12px]" style={{ ...monoFont, color: progress.todayDone ? GOOD : A }}>
            {progress.doneToday}/{progress.requiredToday} done
          </span>
        </div>

        {roomToday ? (
          <>
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              Tick every platform the video is live on. All three are needed for it to count.
            </p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
              {SOCIALS.map((s) => {
                const on = checked.includes(s.key);
                return (
                  <label key={s.key} className="flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition"
                    style={on ? { borderColor: GOOD, background: `${GOOD}1a` } : { borderColor: TC.line, background: "rgba(0,0,0,0.25)" }}>
                    <input type="checkbox" className="sr-only" checked={on}
                      onChange={() => { setChecked((p) => (on ? p.filter((x) => x !== s.key) : [...p, s.key])); if (!on) show(s.label + " confirmed"); }} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.logo} alt="" aria-hidden className="h-5 w-5 shrink-0" />
                    <span className="text-[13px] font-medium" style={{ color: on ? TC.text : TC.muted }}>{s.label}</span>
                    {on && <Check size={15} className="ml-auto shrink-0" style={{ color: GOOD }} />}
                  </label>
                );
              })}
            </div>
            {allPlatforms && (
              <div className="mt-2.5">
                <FieldOk>All three confirmed — this will count as one post</FieldOk>
              </div>
            )}
            <label className="mt-3 flex flex-col gap-1.5">
              <span className={labelCls} style={{ color: TC.faint }}>Link (optional)</span>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…"
                className="rounded-xl border px-3 py-2.5 text-[13.5px] outline-none transition focus:border-violet-400"
                style={{ borderColor: TC.line, background: "rgba(0,0,0,0.25)", color: TC.text }} />
            </label>
            {err && <p className="mt-3 text-[12.5px] font-medium" style={{ color: BAD }}>{err}</p>}
            <button type="button" onClick={log} disabled={busy || !allPlatforms}
              className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: A, color: "#12091f" }}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {busy ? "Saving…" : "Log this video"}
            </button>
          </>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-[13px]" style={{ color: GOOD }}>
            <Check size={16} /> Everything today asks for is logged. {progress.day < 14 ? "Tomorrow: one more." : progress.day < 30 ? "Tomorrow: two more." : "That is the month done."}
          </p>
        )}
        {ok && !roomToday && <p className="mt-2 text-[12px]" style={{ color: TC.faint }}>Saved.</p>}
      </section>

      <section className={card} style={cardStyle}>
        <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
          <ListChecks size={14} style={{ color: A }} /> Everything you have posted ({me.posts.length})
        </h2>
        <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
          Undo is for something logged by mistake. Removing an entry can cost you the qualifying day, so it asks first.
        </p>
        {me.posts.length === 0 ? (
          <p className="mt-3 text-[12.5px]" style={{ color: TC.faint }}>Nothing logged yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-left">
              <thead>
                <tr>
                  {["Day", "Date", "Platforms", "Link", ""].map((h) => (
                    <th key={h} className={`pb-2 ${labelCls}`} style={{ color: TC.faint }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {me.posts.map((p) => {
                  const dayNo = progress.days.find((d) => d.date === p.posted_on.slice(0, 10))?.day;
                  return (
                    <tr key={p.id} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <td className="py-2 text-[13px] font-bold" style={{ ...monoFont, color: A }}>{dayNo ?? "—"}</td>
                      <td className="py-2 text-[12.5px]" style={{ color: TC.muted }}>{fmtShort(p.posted_on.slice(0, 10))}</td>
                      <td className="py-2">
                        <span className="flex gap-1.5">
                          {SOCIALS.filter((s) => p.platforms.includes(s.key)).map((s) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={s.key} src={s.logo} alt={s.label} title={s.label} className="h-4 w-4" />
                          ))}
                        </span>
                      </td>
                      <td className="py-2 text-[12px]">
                        {p.link ? (
                          <a href={p.link} target="_blank" rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 transition hover:opacity-80" style={{ color: A }}>
                            Open <ExternalLink size={11} />
                          </a>
                        ) : <span style={{ color: TC.faint }}>—</span>}
                      </td>
                      <td className="py-2 text-right">
                        {confirming === p.id ? (
                          <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <span className="text-[11px]" style={{ color: BAD }}>Remove it?</span>
                            <button type="button" onClick={() => undo(p.id)} disabled={undoing === p.id}
                              className="rounded-lg px-2 py-1 text-[11px] font-semibold transition hover:opacity-85 disabled:opacity-50"
                              style={{ background: `${BAD}26`, color: BAD }}>
                              {undoing === p.id ? "Removing…" : "Yes, remove"}
                            </button>
                            <button type="button" onClick={() => setConfirming(null)}
                              className="rounded-lg px-2 py-1 text-[11px] font-medium transition hover:opacity-85"
                              style={{ background: "rgba(255,255,255,0.07)", color: TC.muted }}>
                              Keep
                            </button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setConfirming(p.id)} title="Remove this entry"
                            className="inline-flex items-center gap-1 text-[11.5px] transition hover:opacity-80" style={{ color: TC.faint }}>
                            <Undo2 size={12} /> Undo
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ── payouts ──────────────────────────────────────────────────────────────── */

function PayoutsPanel({ me, progress }: { me: Me; progress: Progress }) {
  const { totals, payouts, nextPayout, creator } = me;
  const rail = PAYOUTS.find((p) => p.key === creator.payout_method);

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Your total earnings" value={money(totals.paidUsd)} sub={`${totals.monthsPaid} month${totals.monthsPaid === 1 ? "" : "s"} paid so far`} tone={GOOD} />
        <Stat label="Coming to you" value={money(totals.pendingUsd)} sub="Asked for, not paid yet" tone={A} />
        <Stat label="This month you earn" value={nextPayout ? money(nextPayout.baseUsd) : "—"} sub={`Your month ${nextPayout?.month ?? 1}`} tone={A} />
      </section>

      <section className={card} style={cardStyle}>
        <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
          <Wallet size={14} style={{ color: A }} /> How your money reaches you
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {rail ? (
            <span className="inline-flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: `${A}66`, background: `${A}14` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={rail.logo} alt="" aria-hidden className="h-5 w-5" />
              <span className="text-[13px] font-semibold">{rail.label}</span>
            </span>
          ) : (
            <span className="text-[12.5px]" style={{ color: TC.faint }}>No method chosen yet — set one in My details.</span>
          )}
          <span className="text-[12px]" style={{ color: TC.muted }}>
            Account details are collected after your first 30 days, when there is a payment to make.
          </span>
        </div>
        {progress.finishDate && (
          <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
            Ask to be paid on <b style={{ color: TC.text }}>{fmt(progress.finishDate)}</b>. We check your posts for 3
            working days, then pay within 7 — so the money is with you by <b style={{ color: GOOD }}>{fmt(progress.paidByDate!)}</b>.
          </p>
        )}
      </section>

      <section className={card} style={cardStyle}>
        <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
          <TrendingUp size={14} style={{ color: A }} /> Money paid to you
        </h2>
        {payouts.length === 0 ? (
          <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: TC.faint }}>
            Nothing yet. Your first payment shows up here once you finish 30 days and we have checked your posts.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr>
                  {["Month", "Period", "Base", "Bonus", "Total", "Status", "Paid"].map((h) => (
                    <th key={h} className={`pb-2 ${labelCls}`} style={{ color: TC.faint }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => {
                  const total = Number(p.base_usd) + Number(p.bonus_usd);
                  const paid = p.status === "paid";
                  return (
                    <tr key={p.id} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <td className="py-2 text-[13px] font-bold">{p.month_number}</td>
                      <td className="py-2 text-[12px]" style={{ color: TC.muted }}>{fmtShort(p.period_start)} – {fmtShort(p.period_end)}</td>
                      <td className="py-2 text-[13px]" style={{ ...monoFont }}>{money(Number(p.base_usd))}</td>
                      <td className="py-2 text-[13px]" style={{ ...monoFont, color: Number(p.bonus_usd) > 0 ? GOOD : TC.faint }}>{money(Number(p.bonus_usd))}</td>
                      <td className="py-2 text-[14px] font-bold" style={{ ...monoFont, color: A }}>{money(total)}</td>
                      <td className="py-2">
                        <span className="rounded-lg px-2 py-1 text-[11px] font-semibold capitalize"
                          style={paid ? { background: `${GOOD}22`, color: GOOD } : { background: "rgba(255,255,255,0.07)", color: TC.muted }}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-2 text-[12px]" style={{ color: TC.muted }}>{p.paid_at ? fmtShort(p.paid_at.slice(0, 10)) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card} style={cardStyle}>
        <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
          <TrendingUp size={14} style={{ color: A }} /> How much you earn each month
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-left">
            <thead>
              <tr>
                <th className={`pb-2 ${labelCls}`} style={{ color: TC.faint }}>Month finished</th>
                <th className={`pb-2 text-right ${labelCls}`} style={{ color: TC.faint }}>You get</th>
                <th className={`pb-2 pl-3 ${labelCls}`} style={{ color: TC.faint }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {LADDER.map((r) => (
                <tr key={r.m + r.note} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <td className="py-2 text-[13px] font-medium">{r.m}</td>
                  <td className="py-2 text-right text-[14px] font-bold" style={{ ...monoFont, color: r.pay ? A : TC.faint }}>{r.pay ? `$${r.pay}` : "…"}</td>
                  <td className="py-2 pl-3 text-[11.5px]" style={{ color: TC.faint }}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          Plus <b style={{ color: GOOD }}>$500</b> in any month where at least 75% of your posts reached 10,000+
          views on at least one platform. It can be earned more than once and does not affect the ladder.
        </p>
      </section>
    </div>
  );
}

/* ── ideas & templates ────────────────────────────────────────────────────── */

function IdeasPanel() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = useCallback(async (t: string, body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(t);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1600);
    } catch { /* clipboard blocked — the text is on screen to copy by hand */ }
  }, []);

  return (
    <div className="space-y-4">
      <section className={card} style={cardStyle}>
        <h2 className="text-[17px] font-bold">Videos that actually work</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {IDEAS.map((i) => (
            <div key={i.t} className="rounded-xl border p-3.5" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.22)" }}>
              <div className="text-[13.5px] font-bold">{i.t}</div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{i.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={card} style={cardStyle}>
        <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
          <Copy size={14} style={{ color: A }} /> Caption templates
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          Starting points, not scripts. Change the wording so it sounds like you, and keep clunoid.com in there.
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {TEMPLATES.map((t) => (
            <div key={t.t} className="rounded-xl border p-3.5" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.22)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold">{t.t}</span>
                <button type="button" onClick={() => copy(t.t, t.body)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-medium transition hover:opacity-80"
                  style={{ background: copied === t.t ? `${GOOD}22` : "rgba(255,255,255,0.06)", color: copied === t.t ? GOOD : TC.muted }}>
                  {copied === t.t ? <Check size={12} /> : <Copy size={12} />} {copied === t.t ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{t.body}</pre>
            </div>
          ))}
        </div>
      </section>

      <section className={card} style={cardStyle}>
        <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
          <Sparkles size={14} style={{ color: A }} /> Use AI to find ideas
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          Ask an AI for angles, hooks and simpler explanations — then film it yourself, in your own words.
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
      </section>
    </div>
  );
}

/* ── rules ────────────────────────────────────────────────────────────────── */

function RulesPanel() {
  return (
    <div className="space-y-4">
      <section className={card} style={{ borderColor: `${A}55`, background: `linear-gradient(180deg, ${A}12, rgba(255,255,255,0.015))` }}>
        <h2 className="text-[15px] font-bold">Every video must show Clunoid</h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed" style={{ color: TC.muted }}>
          A video that does not clearly feature or mention the platform does not count towards your 30 days — even if
          it did well. Show the site, show a bot running, or say the name clearly. If someone watches your video and
          cannot tell what you are talking about, it will not be counted.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} style={{ borderColor: `${GOOD}55`, background: `linear-gradient(180deg, ${GOOD}12, rgba(255,255,255,0.015))` }}>
          <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: GOOD }}><Check size={14} /> Always do this</h2>
          <ul className="mt-3 space-y-2">
            {DO.map((t) => (
              <li key={t} className="flex gap-2 text-[13px] leading-relaxed" style={{ color: TC.muted }}>
                <Check size={14} className="mt-0.5 shrink-0" style={{ color: GOOD }} /> {t}
              </li>
            ))}
          </ul>
        </section>
        <section className={card} style={{ borderColor: `${BAD}55`, background: `linear-gradient(180deg, ${BAD}12, rgba(255,255,255,0.015))` }}>
          <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: BAD }}><X size={14} /> Never do this</h2>
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
        </section>
      </div>

      <section className={card} style={cardStyle}>
        <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
          <Clock size={14} style={{ color: A }} /> How often to post
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            { k: "Days 1–14", v: "1 video a day", s: "Slow start builds reach and protects the account" },
            { k: "Days 15–30", v: "2 videos a day", s: "Same for every month after this one" },
            { k: "Each video", v: "All 3 platforms", s: "TikTok + Reels + Shorts together = one post" },
          ].map((c) => (
            <div key={c.k} className="rounded-xl border p-3.5" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.22)" }}>
              <div className={labelCls} style={{ color: TC.faint }}>{c.k}</div>
              <div className="mt-1.5 text-[16px] font-bold" style={{ color: A }}>{c.v}</div>
              <div className="mt-1 text-[11.5px] leading-snug" style={{ color: TC.muted }}>{c.s}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed" style={{ color: TC.faint }}>
          Videos should be 30 seconds to 2 minutes. You have {GRACE_DAYS} grace days each month —{" "}
          {QUALIFYING_DAYS_NEEDED} qualifying days out of 30 is a pass.
        </p>
      </section>
    </div>
  );
}

/* ── my details ───────────────────────────────────────────────────────────── */

function DetailsPanel({ me, token, onRefresh, show }: { me: Me; token: string; onRefresh: () => Promise<void>; show: Show }) {
  const { creator } = me;
  const [handles, setHandles] = useState({
    tiktok: creator.tiktok ?? "", instagram: creator.instagram ?? "", youtube: creator.youtube ?? "",
  });
  const [payout, setPayout] = useState(creator.payout_method ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/creators/profile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...handles, payoutMethod: payout || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data.error || "Could not save." }); show(data.error || "Could not save.", "bad"); return; }
      setMsg({ ok: true, text: "Saved." });
      show("Saved. Your details are up to date.");
      await onRefresh();
    } catch { setMsg({ ok: false, text: "Could not reach us just now." }); show("Could not reach us just now.", "bad"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <section className={card} style={cardStyle}>
        <h2 className="text-[16px] font-bold">What you registered with</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field k="Name" v={creator.name} />
          <Field k="Email" v={creator.email} />
          <Field k="Country" v={creator.country} />
          <Field k="Registered" v={fmt(creator.applied_at)} />
          <Field k="First post" v={creator.first_post_at ? fmt(creator.first_post_at) : "Not started"} />
          <Field k="Account age" v={creator.new_accounts ? "Brand new — month 1 pays $50" : "Established — month 1 pays $100"} />
        </div>
        <p className="mt-3 text-[11.5px]" style={{ color: TC.faint }}>
          Name, email and country are fixed at registration. Email us if one of them is wrong.
        </p>
      </section>

      <section className={card} style={cardStyle}>
        <h2 className="text-[16px] font-bold">Your accounts</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          Paste the link to each profile, or just type the handle — either works. All three must be filled in and
          correct before you can be paid, because this is what we check your posts against.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SOCIALS.map((sc) => {
            const saved = handles[sc.key].trim().length > 0 && handles[sc.key].trim() === (creator[sc.key] ?? "");
            return (
              <div key={sc.key} className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2.5 rounded-xl border px-3 py-2" style={{ borderColor: handles[sc.key] ? `${A}55` : TC.line, background: "rgba(0,0,0,0.25)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sc.logo} alt={sc.label} className="h-5 w-5 shrink-0" />
                  <input value={handles[sc.key]} onChange={(e) => setHandles((p) => ({ ...p, [sc.key]: e.target.value }))}
                    placeholder={sc.ph} aria-label={sc.label}
                    className="w-full bg-transparent text-[13.5px] outline-none" style={{ color: TC.text }} />
                  {saved && <Check size={14} className="shrink-0" style={{ color: GOOD }} />}
                </label>
                {handles[sc.key].trim() && !saved && <FieldOk tone="bad">Not saved yet</FieldOk>}
              </div>
            );
          })}
        </div>
      </section>

      <section className={card} style={cardStyle}>
        <h2 className="text-[16px] font-bold">How you want to be paid</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
          You set up the account details after your first 30 days, when there is a payment to make.
        </p>
        <div className="mt-3 sm:max-w-md">
          <PayoutPicker value={payout} onChange={(v) => { setPayout(v); show((PAYOUTS.find((p) => p.key === v)?.label ?? "Payout method") + " chosen — press save to keep it"); }} accent={A} />
        </div>
        {payout && (
          <div className="mt-2">
            <FieldOk>
              {payout === creator.payout_method
                ? "Saved — you will be paid by " + (PAYOUTS.find((p) => p.key === payout)?.label ?? "")
                : "Not saved yet — press Save changes below"}
            </FieldOk>
          </div>
        )}

        {msg && <p className="mt-4 text-[12.5px] font-medium" style={{ color: msg.ok ? GOOD : BAD }}>{msg.text}</p>}

        <button type="button" onClick={save} disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90 disabled:opacity-60"
          style={{ background: A, color: "#12091f" }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {busy ? "Saving…" : "Save changes"}
        </button>
      </section>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.22)" }}>
      <div className={labelCls} style={{ color: TC.faint }}>{k}</div>
      <div className="mt-1 break-words text-[13px] font-medium">{v}</div>
    </div>
  );
}
