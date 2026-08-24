"use client";

/**
 * CREATOR PROGRAM — the front door.
 *
 * Two pages in one, chosen by whether this browser already belongs to a creator:
 *
 *   · Not registered → the pitch and the form. Ordered the way someone actually
 *     uses it: what this is, then the form while they are still interested, then
 *     everything they need to know, and only at the very bottom the two
 *     confirmations and the button. The whole thing is one form, so nobody has
 *     to scroll back up to submit what they filled in.
 *   · Registered → their dashboard, which is where the real work happens.
 *
 * Registration hands back a token; we keep it in localStorage and present it on
 * every dashboard call. A signed-in creator is also findable by user id, so
 * clearing site data does not lock them out.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Clapperboard, CalendarDays, Check, X, Sparkles, Wallet,
  TrendingUp, ShieldCheck, Clock, Rocket, Loader2,
} from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { CountryPicker } from "./CountryPicker";
import { CreatorDashboard, PostDailyBanner, type Me } from "./CreatorDashboard";
import { PayoutPicker } from "./PayoutPicker";
import { PlatformPicker } from "./PlatformPicker";
import { Reminders } from "./Reminders";
import { FieldOk, useToast } from "./Feedback";
import {
  A, GOOD, BAD, PAYOUTS, LADDER, STEPS, DO, DONT, IDEAS, AI_PROMPTS, addDays, fmt,
  DEFAULT_PLATFORMS, PLATFORMS_REQUIRED, platformInfo,
  DISCLAIMER,
} from "./content";

/** Where this browser remembers which creator it belongs to. */
const TOKEN_KEY = "cln_creator_token";

export function CreatorsHub() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [start, setStart] = useState(today);

  const [f, setF] = useState({ name: "", email: "", country: "" });
  const [platforms, setPlatforms] = useState<string[]>([...DEFAULT_PLATFORMS]);
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [payout, setPayout] = useState("");
  const [newAccounts, setNewAccounts] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const { show, node: toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Session: null while we are still asking, false once we know there is none.
  const [me, setMe] = useState<Me | null>(null);
  const [token, setToken] = useState("");
  // Starts false so the server, and the very first client render, both emit the
  // marketing page — this is a public landing page and its copy has to be in the
  // HTML. Only a browser that already holds a token blanks to a spinner, and it
  // does that after mount, so hydration still matches.
  const [checking, setChecking] = useState(false);
  // The welcome belongs on the dashboard: this component unmounts the moment the
  // dashboard takes over, so a toast raised here would never be seen.
  const [justRegistered, setJustRegistered] = useState(false);

  const load = useCallback(async (t: string) => {
    try {
      const res = await fetch("/api/creators/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      if (!res.ok) return false;
      setMe((await res.json()) as Me);
      return true;
    } catch {
      return false;
    }
  }, []);

  // On arrival: if this browser holds a token — or the visitor is signed in and
  // already registered — go straight to their dashboard.
  useEffect(() => {
    let live = true;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) ?? "" : "";
    setToken(stored);
    // A known creator should never see the sign-up page flash past; a first-time
    // visitor should never see a spinner over content that is already correct.
    if (stored) setChecking(true);
    load(stored).finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [load]);

  const refresh = useCallback(async () => { await load(token); }, [load, token]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const dates = useMemo(() => {
    const d = new Date(start + "T00:00:00");
    if (Number.isNaN(d.getTime())) return null;
    return { switchDay: addDays(d, 14), finish: addDays(d, 29), paidBy: addDays(d, 39) };
  }, [start]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/creators/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, platforms, handles, payoutMethod: payout, newAccounts, agreed }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; token?: string; already?: boolean };
      if (!res.ok || !data.ok) { setErr(data.error || "Something went wrong. Please try again."); return; }
      // Already registered and we could prove who they are — straight to the
      // dashboard rather than an error they cannot act on.
      if (data.already) { setJustRegistered(false); } else { setJustRegistered(true); }
      const t = data.token ?? "";
      if (t) window.localStorage.setItem(TOKEN_KEY, t);
      setToken(t);
      window.scrollTo({ top: 0 });
      await load(t);
    } catch {
      setErr("Could not reach us just now. Please try again.");
    } finally { setBusy(false); }
  }

  const handlesAdded = platforms.filter((k) => (handles[k] ?? "").trim().length > 0).length;

  const field = "rounded-xl border px-3 py-2.5 text-[13.5px] outline-none transition focus:border-violet-400";
  const fieldStyle = { borderColor: TC.line, background: "rgba(0,0,0,0.25)", color: TC.text } as const;
  const label = "text-[10.5px] font-semibold uppercase tracking-wider";

  // Already a creator → the dashboard is the page.
  if (me) return <CreatorDashboard me={me} token={token} onRefresh={refresh} justRegistered={justRegistered} />;

  if (checking) {
    return (
      <main className="relative grid min-h-[100dvh] w-full place-items-center" style={{ background: TC.bg, color: TC.text }}>
        <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
        <Loader2 size={22} className="relative z-10 animate-spin" style={{ color: A }} />
      </main>
    );
  }

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      <div className="relative z-10 w-full px-5 py-5 sm:px-8 lg:px-12 xl:px-16">
        <header className="flex w-full flex-wrap items-center gap-3">
          <Link href="/trading/command" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> <span className="hidden sm:inline">Command</span>
          </Link>
          {/* On a phone the arrow alone is enough — the label and the programme
              chip are the first things to go so the rest of the row fits. */}
          <span className="hidden h-4 w-px sm:block" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.45)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
            {/* The mark is the first thing to drop on a phone — the name carries it. */}
            <Clapperboard size={14} className="hidden sm:block" style={{ color: A }} />
            <span className="text-[12.5px] font-bold tracking-tight">Creator Program</span>
          </span>
        </header>

        {/* ── what this is, in four lines ────────────────────────────────── */}
        <section className="mt-8">
          <h1 className="text-[27px] font-bold leading-tight sm:text-[34px] lg:text-[38px]">
            Get paid every month to post about Clunoid
          </h1>
          <p className="mt-3 max-w-4xl text-[14px] leading-relaxed sm:text-[15.5px]" style={{ color: TC.muted }}>
            Make short videos, post them on three social accounts of your choosing, and get paid at the end of
            every 30 days. <b style={{ color: TC.text }}>You do not need views to get paid</b> — you need to post
            every day. Get <b style={{ color: TC.text }}>10,000 views</b> consistently and you earn <b style={{ color: TC.text }}>$500</b> on top. Use accounts you already have and month one pays{" "}
            <b style={{ color: TC.text }}>$100</b>; make new ones for this and month one pays{" "}
            <b style={{ color: TC.text }}>$50</b>. <b style={{ color: TC.text }}>You start the day you register</b> —
            there is nothing to wait for.
          </p>
          <p className="mt-2.5 max-w-4xl text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            <b style={{ color: TC.text }}>You can post about anything.</b> Take a format that is already working —
            another creator, a video going viral in any niche — and rebuild it as your own with Clunoid in it. The
            only thing that decides whether a video counts is whether it tells viewers about Clunoid.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {[
              { v: "$100", l: "first month on accounts you have" },
              { v: "+$50", l: "more every month after" },
              { v: "$750", l: "monthly ceiling" },
              { v: "+$500", l: "bonus for 10k+ views" },
            ].map((c) => (
              <div key={c.l} className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: "rgba(167,139,250,0.35)", background: "rgba(167,139,250,0.08)" }}>
                <span className="text-[18px] font-bold" style={{ ...monoFont, color: A }}>{c.v}</span>
                <span className="ml-1.5 text-[11.5px]" style={{ color: TC.muted }}>{c.l}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6">
          <PostDailyBanner />
        </div>

        {/* One form from here to the bottom, so nothing has to be scrolled back to. */}
        <form onSubmit={submit}>
          {/* ── the application ──────────────────────────────────────────── */}
            <section id="apply" className="mt-8 rounded-2xl border p-5 sm:p-6" style={{ borderColor: `${A}55`, background: `linear-gradient(180deg, ${A}10, rgba(255,255,255,0.015))` }}>
              <h2 className="text-[18px] font-bold sm:text-[20px]">Register and start today</h2>
              <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                Fill this in, read the rules below, then confirm at the bottom. Your 30 days start the moment you
                register — no waiting, no approval.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className={label} style={{ color: TC.faint }}>Your name</span>
                  <input required value={f.name} onChange={set("name")} className={field} style={fieldStyle} placeholder="Jane Doe" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={label} style={{ color: TC.faint }}>Email</span>
                  <input required type="email" value={f.email} onChange={set("email")} className={field} style={fieldStyle} placeholder="you@email.com" />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className={label} style={{ color: TC.faint }}>Country</span>
                  <CountryPicker value={f.country} onChange={(v) => { setF((p) => ({ ...p, country: v })); show(v + " selected"); }} accent={A} />
                  {f.country && <FieldOk>{f.country} selected</FieldOk>}
                </div>
              </div>

              {/* where they post — three of their choosing */}
              <div className="mt-6 sm:max-w-md">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className={label} style={{ color: TC.faint }}>Where will you post?</span>
                  <span className="text-[11.5px]" style={{ color: TC.muted }}>
                    Pick {PLATFORMS_REQUIRED} — that is the minimum, not a limit, so post on more if you want to.
                    Instagram, TikTok and YouTube are the ones we recommend; swap any of them if it is banned or
                    unusable where you live.
                  </span>
                </div>
                <div className="mt-2.5">
                  <PlatformPicker
                    platforms={platforms}
                    handles={handles}
                    onPlatforms={(next) => {
                      // Works for a swap as well as an add: whatever is in the
                      // new list and was not in the old one is what they picked.
                      const added = next.find((k) => !platforms.includes(k));
                      setPlatforms(next);
                      if (added) show((platformInfo(added)?.label ?? "Platform") + " added");
                    }}
                    onHandle={(k, v) => setHandles((p) => ({ ...p, [k]: v }))}
                    accent={A}
                  />
                </div>
                <p className="mt-2 text-[11.5px]" style={{ color: TC.muted }}>
                  Handles are optional today —{" "}
                  <b style={{ color: TC.text }}>all three must be there before your first post.</b>
                </p>
                {handlesAdded > 0 && (
                  <div className="mt-2">
                    <FieldOk>
                      {handlesAdded} of {PLATFORMS_REQUIRED} handles added
                      {handlesAdded === PLATFORMS_REQUIRED ? " — all set" : ", the rest can wait"}
                    </FieldOk>
                  </div>
                )}
              </div>

              {/* payout rail — one dropdown at every width, and optional here */}
              <div className="mt-6 sm:max-w-md">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className={label} style={{ color: TC.faint }}>How would you like to be paid?</span>
                  <span className="text-[11.5px]" style={{ color: TC.muted }}>
                    Optional — you can set this later on your dashboard, and change it any time.
                  </span>
                </div>
                <div className="mt-2.5">
                  <PayoutPicker value={payout} onChange={(v) => { setPayout(v); show((PAYOUTS.find((p) => p.key === v)?.label ?? "Payout method") + " selected"); }} accent={A} />
                </div>
                {payout && (
                  <div className="mt-2">
                    <FieldOk>Payouts will go out by {PAYOUTS.find((p) => p.key === payout)?.label}. Account details come after your first 30 days.</FieldOk>
                  </div>
                )}
              </div>

              {/* Confirm and register right here — nobody should have to scroll to
                  the bottom of a long page to finish something they started at the top. */}
              <div className="mt-6 border-t pt-5" style={{ borderColor: TC.line }}>
                <div className="space-y-3">
                  <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: TC.muted }}>
                    <input type="checkbox" checked={newAccounts} onChange={(e) => { setNewAccounts(e.target.checked); if (e.target.checked) show("Noted — month 1 pays $50 for brand-new accounts"); }} className="mt-0.5 h-4 w-4 shrink-0" style={{ accentColor: A }} />
                    <span>I made these accounts brand new for this. <span style={{ color: TC.faint }}>Leave this unticked if you are using accounts you already had — those pay <b style={{ color: TC.text }}>$100</b> in month one. Brand-new accounts pay <b style={{ color: TC.text }}>$50</b> in month one because they have no reach yet. From month two everyone is the same. <b style={{ color: TC.text }}>Do not worry about getting this wrong</b> — we check your accounts ourselves, and you can change it on your dashboard any time.</span></span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: TC.muted }}>
                    <input required type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); if (e.target.checked) show("Thanks — you can register now"); }} className="mt-0.5 h-4 w-4 shrink-0" style={{ accentColor: A }} />
                    <span>I have read the rules and I will follow them. <span style={{ color: TC.faint }}>They are all on this page, below.</span></span>
                  </label>
                </div>

                {err && <p className="mt-4 text-[12.5px] font-medium" style={{ color: BAD }}>{err}</p>}

                <button type="submit" disabled={busy}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
                  style={{ background: A, color: "#12091f" }}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Clapperboard size={16} />}
                  {busy ? "Registering…" : "Register and start today"}
                </button>
                <p className="mt-2.5 text-[11.5px]" style={{ color: TC.faint }}>
                  Day 1 is today. Post your first video as soon as you have registered.
                </p>
              </div>
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

          {/* ── the reminders, in point form ───────────────────────────────── */}
          <div className="mt-12">
            <Reminders title="Reminders for every creator" />
          </div>

          {/* ── posting rhythm ─────────────────────────────────────────────── */}
          <section className="mt-12">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
              <Clock size={14} style={{ color: A }} /> How often to post
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { k: "Posted days 1–14", v: "1 video a day", s: "Slow start builds reach and protects the account" },
                { k: "Posted days 15–28", v: "2 videos a day", s: "Same for every month after this one" },
                { k: "Each video", v: "3 platforms minimum", s: "Same video on your three = one post. More is fine." },
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
                <Wallet size={14} style={{ color: A }} /> How much you earn each month
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
                      <tr key={r.m + r.note} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                        <td className="py-2 text-[13px] font-medium">{r.m}</td>
                        <td className="py-2 text-right text-[14px] font-bold" style={{ ...monoFont, color: r.pay ? A : TC.faint }}>{r.pay ? `$${r.pay}` : "…"}</td>
                        <td className="py-2 pl-3 text-[11.5px]" style={{ color: TC.faint }}>{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: `${GOOD}55`, background: `linear-gradient(180deg, ${GOOD}14, rgba(255,255,255,0.015))` }}>
              <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.faint }}>
                <TrendingUp size={14} style={{ color: GOOD }} /> Earn $500 more
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed" style={{ color: TC.muted }}>
You get <b style={{ color: TC.text }}>$500 on top</b> of what you already earn, in any month where your videos
                keep passing <b style={{ color: TC.text }}>10,000 views</b>.
              </p>
              <div className="mt-3 rounded-xl border p-3" style={{ borderColor: `${GOOD}44`, background: "rgba(0,0,0,0.2)" }}>
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: GOOD }}>What counts as consistent</div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                  At least <b style={{ color: TC.text }}>75% of your posts that month</b> reached 10,000+ views on at
                  least one platform. Highest count across TikTok, Instagram or YouTube is the one we use.
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
                <span className={label} style={{ color: TC.faint }}>The day you registered</span>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-[13.5px] outline-none transition focus:border-violet-400"
                  style={{ ...monoFont, borderColor: TC.line, background: "rgba(0,0,0,0.25)", color: TC.text, colorScheme: "dark" }} />
              </label>
              {dates && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { k: "Posted day 15 — go to 2 a day", v: fmt(dates.switchDay), c: A },
                    { k: "28 posted days — ask to be paid", v: fmt(dates.finish), c: GOOD },
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
                A month is 28 days you actually posted, not 28 dates — miss one and your finish moves out a day
                instead of the month being lost. You tick the days you posted on your dashboard calendar. We check
                your posts for 3 working days, then pay you within 7.
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
                Copied clips are exactly what gets social media accounts restricted or banned.
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
                Ask an AI for angles, hooks and simpler explanations — then make the video yourself. Try these:
              </p>
              <ul className="mt-3 space-y-1.5">
                {AI_PROMPTS.map((p) => (
                  <li key={p} className="rounded-lg border px-3 py-2 text-[12px] leading-relaxed" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.2)", color: TC.muted }}>
                    &ldquo;{p}&rdquo;
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
                A realistic AI voice over your own screen recording is fine, and common — there is an example to
                listen to on your dashboard. What does not work is a video that is entirely generated, with nothing
                of yours in it.
              </p>
            </div>
          </section>

          {/* ── the one rule that voids everything ─────────────────────────── */}
          <section className="mt-12">
            <div className="rounded-2xl border p-5" style={{ borderColor: `${A}55`, background: `linear-gradient(180deg, ${A}12, rgba(255,255,255,0.015))` }}>
              <h2 className="text-[15px] font-bold">Every video must tell viewers about Clunoid</h2>
              <p className="mt-2 max-w-3xl text-[13px] leading-relaxed" style={{ color: TC.muted }}>
                A video that does not clearly tell viewers about the platform does not count towards
                your 30 days — even if it did well. Say the name, say what it does, or show the site or a bot
                running while you explain it. Telling people matters more than showing them: if someone watches your
                video and cannot say what you were talking about, it will not be counted. You never have to be on
                camera — a screen recording with your voice over it is fine. And say the bots are{" "}
                <b style={{ color: TC.text }}>100% FREE</b> — every video, no exceptions.
              </p>
            </div>
          </section>

        </form>

        <p className="mt-10 flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          <ShieldCheck size={13} className="mt-0.5 shrink-0" style={{ color: A }} />
          {DISCLAIMER}
        </p>
      </div>

      {toast}
    </main>
  );
}
