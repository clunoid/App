"use client";

/**
 * CLUNOID TRADING — the public landing / face of the platform.
 *
 * Full-bleed, modern, serious trading design: cool near-black + a faint dotted
 * grid, sky-blue as the "profit" accent (per the owner's spec), an animated
 * equity curve, and a broker-agnostic platform lineup pulled from the registry
 * (lib/trading/platforms) — nothing hardcoded to Deriv/MT5. No auth or live
 * integration yet (built step by step); admins get an unobtrusive toggle back
 * to classic Clunoid.
 */
import { useState } from "react";
import { Activity, ArrowUpRight, BrainCircuit, Cpu, LineChart, Lock, ShieldCheck, Zap, ChevronRight, Loader2 } from "lucide-react";
import { useClunoid } from "@/lib/store/useClunoid";
import { PLATFORMS, type PlatformStatus } from "@/lib/trading/platforms";

const C = {
  bg: "#070b12",
  panel: "rgba(255,255,255,0.032)",
  panelHi: "rgba(255,255,255,0.06)",
  line: "rgba(125,211,252,0.14)",
  text: "#eaf2fb",
  muted: "#93a7bd",
  faint: "#586a80",
  profit: "#38bdf8", // sky blue = profit / positive
  profitSoft: "#7dd3fc",
  loss: "#f2607d",
};
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } as const;
const DOT_GRID = {
  backgroundImage: "radial-gradient(rgba(125,211,252,0.10) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
} as const;

const STATUS_META: Record<PlatformStatus, { label: string; color: string }> = {
  live: { label: "Live", color: C.profit },
  beta: { label: "Beta", color: C.profitSoft },
  soon: { label: "Coming soon", color: "#fbbf24" },
  planned: { label: "Planned", color: C.faint },
};

/* the markets we automate — decorative strip (names only, not live quotes) */
const MARKETS = ["Volatility 75", "Volatility 100", "Boom 1000", "Crash 500", "Jump 25", "EUR/USD", "XAU/USD", "BTC/USD", "US Tech 100", "Step Index"];

export function TradingLanding() {
  const isAuthed = useClunoid((s) => s.user.isAuthed);
  const userId = useClunoid((s) => s.user.id);
  const userEmail = useClunoid((s) => s.user.email);
  const openAuth = useClunoid((s) => s.openAuth);
  const isAdmin = userId === "5191f3cf-f0e5-4187-9c08-8921eb57a64c" || userEmail?.toLowerCase() === "clunoid@gmail.com";
  const [switching, setSwitching] = useState(false);

  const toClassic = async () => {
    setSwitching(true);
    try {
      await fetch("/api/mode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "classic" }) });
      window.location.href = "/home";
    } catch {
      setSwitching(false);
    }
  };

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: C.bg, color: C.text }}>
      {/* dotted grid + top glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px]" style={{ background: "radial-gradient(120% 90% at 50% -10%, rgba(56,189,248,0.16), transparent 60%)" }} />

      <div className="relative z-10">
        {/* ── top bar ── */}
        <header className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4 sm:px-8">
          <span className="flex items-center gap-2 text-[15px] font-bold tracking-[0.2em]">
            <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "rgba(56,189,248,0.14)" }}><LineChart size={16} style={{ color: C.profit }} /></span>
            CLUNOID <span style={{ color: C.profit }}>TRADING</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            {isAdmin ? (
              <button onClick={() => void toClassic()} disabled={switching} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-white/5 disabled:opacity-50" style={{ borderColor: C.line, color: C.muted }}>
                {switching ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />} Classic Clunoid
              </button>
            ) : !isAuthed ? (
              <button onClick={() => openAuth("login")} className="rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition hover:bg-white/5" style={{ borderColor: C.line, color: C.muted }}>
                Sign in
              </button>
            ) : null}
          </div>
        </header>

        {/* ── hero ── */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-8 pt-6 sm:px-8 lg:grid-cols-2 lg:pt-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ borderColor: C.line, color: C.profit }}>
              <Zap size={12} /> Automated · AI-driven · broker-agnostic
            </span>
            <h1 className="mt-5 text-[34px] font-bold leading-[1.08] sm:text-[46px]">
              Intelligent trading that <span style={{ color: C.profit }}>executes for you</span>.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed" style={{ color: C.muted }}>
              Clunoid Trading turns advanced AI into automated strategies that run on your own broker account —
              analysing the market, deciding, and placing the trades, around the clock. You keep custody; the machine does the work.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold transition hover:opacity-90" style={{ background: C.profit, color: "#04121f" }}>
                Get started <ArrowUpRight size={16} />
              </button>
              <a href="#platforms" className="inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-[14px] font-medium transition hover:bg-white/5" style={{ borderColor: C.line, color: C.text }}>
                See supported platforms
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px]" style={{ color: C.faint }}>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} style={{ color: C.profit }} /> You keep account custody</span>
              <span className="inline-flex items-center gap-1.5"><Cpu size={14} style={{ color: C.profit }} /> Runs 24/7</span>
              <span className="inline-flex items-center gap-1.5"><Activity size={14} style={{ color: C.profit }} /> Starts with Deriv MT5</span>
            </div>
          </div>

          {/* animated equity curve */}
          <EquityCurve />
        </section>

        {/* ── markets ticker ── */}
        <div className="relative overflow-hidden border-y py-3" style={{ borderColor: C.line }}>
          <div className="flex w-max animate-[ticker_36s_linear_infinite] gap-8 pr-8">
            {[...MARKETS, ...MARKETS].map((m, i) => (
              <span key={i} className="inline-flex shrink-0 items-center gap-2 text-[12.5px] font-medium" style={{ ...mono, color: C.muted }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: C.profit }} /> {m}
              </span>
            ))}
          </div>
        </div>

        {/* ── pillars ── */}
        <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: BrainCircuit, t: "Intelligent by design", d: "Advanced AI reads the market and forms the strategy — not a rigid script. It thinks, then acts." },
              { icon: Zap, t: "Automated execution", d: "Signals become real orders on your broker automatically. No screen-watching, no manual clicks." },
              { icon: Lock, t: "Your account, your control", d: "It trades on your own account and you stay in custody. Pause or stop any time." },
            ].map(({ icon: I, t, d }) => (
              <div key={t} className="rounded-2xl border p-5" style={{ borderColor: C.line, background: C.panel }}>
                <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "rgba(56,189,248,0.12)" }}><I size={19} style={{ color: C.profit }} /></span>
                <h3 className="mt-3.5 text-[15px] font-semibold">{t}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── platforms ── */}
        <section id="platforms" className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-bold sm:text-[26px]">Built to run anywhere</h2>
              <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed" style={{ color: C.muted }}>
                The engine is broker-agnostic — one intelligence, many platforms. We start with Deriv MT5, then Deriv Options, then cTrader and more.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORMS.map((p) => {
              const s = STATUS_META[p.status];
              return (
                <div key={p.id} className="flex flex-col rounded-2xl border p-4" style={{ borderColor: C.line, background: C.panel }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold">{p.label}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: `${s.color}1f`, color: s.color }}>{s.label}</span>
                  </div>
                  <p className="mt-2 flex-1 text-[12px] leading-relaxed" style={{ color: C.muted }}>{p.note}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.markets.slice(0, 4).map((m) => (
                      <span key={m} className="rounded px-1.5 py-0.5 text-[10px]" style={{ ...mono, background: C.panelHi, color: C.faint }}>{m}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-[12px]" style={{ color: C.faint }}>
            On MT5, automation runs through an Expert Advisor in your own terminal — you keep custody of your account. Live execution is being wired next.
          </p>
        </section>

        {/* ── footer ── */}
        <footer className="border-t px-5 py-6 text-center text-[12px] sm:px-8" style={{ borderColor: C.line, color: C.faint }}>
          Clunoid Trading — intelligent automated trading. Trading involves risk; you can lose money. Nothing here is financial advice.
        </footer>
      </div>

      <style>{`@keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </main>
  );
}

/** A calm, upward equity curve rendered as SVG — sky-blue line + area, drawn in. */
function EquityCurve() {
  // a gently rising, slightly noisy path
  const pts = [8, 22, 16, 34, 28, 46, 40, 60, 52, 72, 66, 86, 78, 96];
  const W = 520;
  const H = 300;
  const stepX = W / (pts.length - 1);
  const toY = (v: number) => H - (v / 100) * (H - 24) - 12;
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ");
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border p-4" style={{ borderColor: C.line, background: "linear-gradient(180deg, rgba(56,189,248,0.06), rgba(255,255,255,0.015))" }}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-medium" style={{ color: C.muted }}>Strategy equity · illustrative</span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ ...mono, background: "rgba(56,189,248,0.14)", color: C.profit }}>
            <ArrowUpRight size={12} /> +37.4%
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }}>
          <defs>
            <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(56,189,248,0.35)" />
              <stop offset="100%" stopColor="rgba(56,189,248,0)" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="rgba(125,211,252,0.08)" strokeWidth="1" />
          ))}
          <path d={area} fill="url(#eqfill)" />
          <path d={line} fill="none" stroke={C.profit} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 6px rgba(56,189,248,0.55))", strokeDasharray: 1400, strokeDashoffset: 1400, animation: "draw 2.4s ease-out forwards" }} />
          <circle cx={W} cy={toY(pts[pts.length - 1])} r="4.5" fill={C.profit} style={{ filter: "drop-shadow(0 0 6px rgba(56,189,248,0.9))" }} />
        </svg>
      </div>
      <style>{`@keyframes draw { to { stroke-dashoffset: 0 } }`}</style>
    </div>
  );
}
