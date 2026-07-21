"use client";

/**
 * THE TRADING HUB — the public, indexable half of /trading.
 *
 * This section exists to be found. Everything in it is general market knowledge
 * or a published public figure, arranged around what people actually search for.
 *
 * It says NOTHING about how Clunoid works — no strategy, no settings, no engine
 * detail. Content lives in lib/trading/knowledge.ts; this file is only how it
 * looks. Add a topic there, not here.
 */
import { useState } from "react";
import { ArrowUpRight, Search, BookOpen, Shield, Landmark, Users, Layers, BarChart3 } from "lucide-react";
import { TC, monoFont } from "@/lib/trading/theme";
import { DERIV_AFFILIATE_URL, BINANCE_REFERRAL_URL } from "@/lib/trading/affiliates";
import {
  MARKET_STATS, VENUES, PROP_FIRMS, EXPLAINERS, PRINCIPLES, TRADERS, BANKS,
  SEARCH_TOPICS, TOPIC_COUNT,
} from "@/lib/trading/knowledge";

const CARD = { borderColor: TC.line, background: TC.panel } as const;

/** Section heading with an eyebrow — one rhythm for the whole hub. */
function Head({ icon: I, eyebrow, title, lede }: { icon: typeof Search; eyebrow: string; title: string; lede?: string }) {
  return (
    <div className="mb-6 max-w-2xl">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: TC.profit }}>
        <I size={13} /> {eyebrow}
      </span>
      <h3 className="mt-2 text-[20px] font-bold sm:text-[24px]">{title}</h3>
      {lede && <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>{lede}</p>}
    </div>
  );
}

export function TradingHub() {
  const [openTopic, setOpenTopic] = useState<string>(SEARCH_TOPICS[0].title);

  return (
    <section id="platforms" className="w-full px-6 pb-20 sm:px-10 lg:px-16">
      {/* ── intro ── */}
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-[26px] font-bold sm:text-[32px]">The trading world, in one place</h2>
        <p className="mt-3 text-[14px] leading-relaxed" style={{ color: TC.muted }}>
          The markets, the platforms, the people and the rules that actually keep an account alive —
          written plainly, for anyone who is starting out or checking a detail.
        </p>
      </div>

      {/* ── market scale ── */}
      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MARKET_STATS.map((s) => (
          <div key={s.label} className="rounded-2xl border p-5" style={CARD}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: TC.faint }}>{s.label}</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-[28px] font-bold leading-none" style={{ ...monoFont, color: TC.profit }}>{s.value}</span>
              <span className="text-[12px] font-semibold" style={{ color: TC.muted }}>{s.unit}</span>
            </div>
            <p className="mt-2.5 text-[11px] leading-snug" style={{ color: TC.faint }}>{s.note} · {s.asOf}</p>
          </div>
        ))}
      </div>

      {/* ── venues ── */}
      <div className="mt-16">
        <Head icon={Layers} eyebrow="Where people trade" title="Platforms, terminals and exchanges"
          lede="The venues the retail market runs on, and what each one is actually known for." />
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {VENUES.map((v) => (
            <div key={v.name} className="flex flex-col rounded-2xl border p-5 transition duration-200 hover:-translate-y-0.5" style={CARD}>
              <div className="flex h-7 items-center">
                {v.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.logo} alt={v.name} decoding="async" className="max-h-full w-auto max-w-[110px] object-contain object-left" />
                ) : (
                  <span className="text-[15px] font-bold">{v.name}</span>
                )}
              </div>
              <div className="mt-3.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>{v.kind}</div>
              {v.stat && <div className="mt-1 text-[12.5px] font-semibold" style={{ color: TC.profit }}>{v.stat}</div>}
              <p className="mt-2 flex-1 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{v.blurb}</p>
            </div>
          ))}
        </div>

        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {PROP_FIRMS.map((f) => (
            <div key={f.name} className="flex items-center gap-3.5 rounded-2xl border p-4" style={CARD}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.logo} alt={f.name} decoding="async" className="h-5 w-auto max-w-[84px] shrink-0 object-contain object-left" />
              <div className="min-w-0">
                <div className="text-[11px]" style={{ color: TC.faint }}>{f.founded}</div>
                <p className="mt-0.5 text-[12px] leading-snug" style={{ color: TC.muted }}>{f.blurb}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── explainers ── */}
      <div className="mt-16">
        <Head icon={BookOpen} eyebrow="Start here" title="What trading actually is"
          lede="The questions every beginner types first, answered without jargon." />
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {EXPLAINERS.map((e) => (
            <div key={e.q} className="rounded-2xl border p-5" style={CARD}>
              <h4 className="text-[14.5px] font-bold">{e.q}</h4>
              <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{e.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── principles ── */}
      <div className="mt-16">
        <Head icon={Shield} eyebrow="Risk management" title="The principles that keep accounts alive"
          lede="Most accounts are not lost on a bad forecast. They are lost on size, and on the absence of a limit." />
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <div key={p.title} className="rounded-2xl border p-5" style={CARD}>
              <span className="grid h-7 w-7 place-items-center rounded-lg text-[12px] font-bold"
                style={{ background: "rgba(56,189,248,0.14)", color: TC.profit, ...monoFont }}>{i + 1}</span>
              <h4 className="mt-3 text-[14px] font-bold">{p.title}</h4>
              <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{p.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── people & institutions ── */}
      <div className="mt-16 grid gap-3.5 lg:grid-cols-2">
        <div className="rounded-2xl border p-6" style={CARD}>
          <Head icon={Users} eyebrow="The names" title="Traders people study" />
          <ul className="-mt-2 divide-y" style={{ borderColor: TC.line }}>
            {TRADERS.map((t) => (
              <li key={t.name} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="w-[150px] shrink-0 text-[13px] font-semibold">{t.name}</span>
                <span className="text-[12px] leading-snug" style={{ color: TC.muted }}>{t.known}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border p-6" style={CARD}>
          <Head icon={Landmark} eyebrow="The institutions" title="Banks that move the market" />
          <ul className="-mt-2 divide-y" style={{ borderColor: TC.line }}>
            {BANKS.map((b) => (
              <li key={b.name} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="w-[150px] shrink-0 text-[13px] font-semibold">{b.name}</span>
                <span className="text-[12px] leading-snug" style={{ color: TC.muted }}>{b.known}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── search topics ── */}
      <div className="mt-16">
        <Head icon={Search} eyebrow="Explore" title="What traders are searching for"
          lede={`${TOPIC_COUNT} topics across automation, platforms, strategy and risk — pick a theme to browse it.`} />

        <div className="flex flex-wrap gap-2">
          {SEARCH_TOPICS.map((g) => {
            const on = g.title === openTopic;
            return (
              <button key={g.title} onClick={() => setOpenTopic(g.title)}
                className="rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition hover:bg-white/5"
                style={{ borderColor: on ? TC.profit : TC.line, color: on ? TC.profit : TC.muted, background: on ? "rgba(56,189,248,0.08)" : "transparent" }}>
                {g.title} <span className="opacity-60">{g.queries.length}</span>
              </button>
            );
          })}
        </div>

        {/* Every group stays in the DOM so all of it is indexable; only the
            selected one is shown, which keeps the page from becoming a wall. */}
        {SEARCH_TOPICS.map((g) => (
          <div key={g.title} className={g.title === openTopic ? "mt-4 rounded-2xl border p-5" : "hidden"} style={CARD}>
            <ul className="flex flex-wrap gap-2">
              {g.queries.map((q) => (
                <li key={q} className="rounded-lg px-2.5 py-1 text-[12px]" style={{ background: TC.panelHi, color: TC.muted }}>{q}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* ── open an account ── */}
      <div className="mt-16">
        <Head icon={BarChart3} eyebrow="Get set up" title="Open a trading account"
          lede="You trade on your own account with your own broker. These are the two you can open today — more partners are being added." />
        <div className="grid gap-3.5 sm:grid-cols-2">
          {[
            { name: "Deriv", logo: "/logos/deriv-wordmark.svg", href: DERIV_AFFILIATE_URL, accent: "#ff444f", cap: 22,
              headline: "Open a Deriv account", sub: "Forex, metals, stock indices and synthetic indices that price around the clock. Free demo included." },
            { name: "Binance", logo: "/logos/binance.svg", href: BINANCE_REFERRAL_URL, accent: "#f3ba2f", cap: 26,
              headline: "Open a Binance account", sub: "Claim your welcome rewards when you sign up, then trade crypto spot and futures 24/7." },
          ].map((a) => (
            <a key={a.name} href={a.href} target="_blank" rel="noopener noreferrer sponsored"
              className="group flex items-center gap-4 rounded-2xl border p-5 transition hover:-translate-y-0.5"
              style={{ borderColor: `${a.accent}44`, background: `linear-gradient(180deg, ${a.accent}14, rgba(255,255,255,0.015))` }}>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: `${a.accent}1f` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.logo} alt={a.name} decoding="async" className="w-auto max-w-[34px] object-contain" style={{ maxHeight: a.cap }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-bold">{a.headline}</div>
                <p className="mt-1 text-[12px] leading-snug" style={{ color: TC.muted }}>{a.sub}</p>
              </div>
              <ArrowUpRight size={17} className="shrink-0 transition group-hover:translate-x-0.5" style={{ color: a.accent }} />
            </a>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
          Sign-up links are partner links — opening an account through them supports Clunoid at no extra cost to you.
          Trading carries risk; never risk money you cannot afford to lose.
        </p>
      </div>
    </section>
  );
}
