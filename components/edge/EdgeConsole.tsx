"use client";

/**
 * EDGE — Sports Intelligence & Betting Analysis (admin-only). A clean, modern,
 * full-bleed console: ask any sports-betting question in natural language and get
 * an evidence-based, uncertainty-honest report (model probabilities, market value,
 * confidence, evidence, reasoning, risks) — or browse real fixtures and analyse
 * one in a click. Full width edge-to-edge like the Trading Desk. Security is
 * server-side (/api/edge/* verify admin); this renders a Restricted screen on 403.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Loader2, ShieldAlert, TrendingUp, CalendarDays, ArrowRight, Info, Trophy, CircleDollarSign, AlertTriangle, Activity, LineChart, Clapperboard } from "lucide-react";
import { EdgeBackground } from "./EdgeBackground";
import { EdgeVideoStudio } from "./EdgeVideoStudio";
import type { PredictionReport, Fixture, LeagueDef, MarketOdds } from "@/lib/edge/types";

/* palette — deep ink + the Edge emerald (matches the home chip), cool blue for
   the away side (never white) */
const C = {
  bg: "#0a0c0d",
  panel: "rgba(255,255,255,0.026)",
  panelHi: "rgba(255,255,255,0.05)",
  line: "rgba(255,255,255,0.09)",
  text: "#f3f6f4",
  muted: "#9aa5a0",
  faint: "#626d68",
  accent: "#34d399", // emerald — the /home Edge chip colour
  accentDim: "rgba(52,211,153,0.13)",
  blue: "#7dd3fc",
  amber: "#fbbf24",
  red: "#f87171",
};
const mono = { fontFamily: "var(--edge-mono), ui-monospace, monospace" } as const;

type FixtureGroup = { league: LeagueDef; fixtures: Fixture[]; oddsById: Record<string, MarketOdds> };
type FixturesResponse = { leagues: { id: string; name: string; emoji?: string; sport: string }[]; groups: FixtureGroup[] };

const EXAMPLES = ["Value on Arsenal vs Chelsea?", "Who wins Real Madrid vs Barcelona?", "Over/under goals: Bayern vs Dortmund", "Best NBA edge tonight"];

/* ── atoms ────────────────────────────────────────────────────────────────── */
function Logo({ src, alt, size = 24 }: { src?: string; alt: string; size?: number }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok)
    return <span className="grid shrink-0 place-items-center rounded-full text-[9px] font-bold" style={{ ...mono, width: size, height: size, background: "rgba(255,255,255,0.06)", color: C.faint }}>{alt.slice(0, 3).toUpperCase()}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} referrerPolicy="no-referrer" onError={() => setOk(false)} style={{ width: size, height: size, objectFit: "contain" }} className="shrink-0" />;
}

function Stance({ stance }: { stance: PredictionReport["verdict"]["stance"] }) {
  const m = {
    bet: { label: "VALUE", color: "#0a0c0d", bg: C.accent },
    lean: { label: "LEAN", color: C.amber, bg: "rgba(251,191,36,0.15)" },
    "no-bet": { label: "NO BET", color: C.muted, bg: "rgba(255,255,255,0.06)" },
  }[stance];
  return <span className="rounded-full px-3 py-1 text-[11px] font-bold tracking-[0.12em]" style={{ ...mono, color: m.color, background: m.bg }}>{m.label}</span>;
}

function Card({ title, icon: Icon, children, className = "" }: { title?: string; icon?: typeof Info; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${className}`} style={{ borderColor: C.line, background: C.panel }}>
      {title && (
        <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.faint }}>
          {Icon && <Icon size={12} style={{ color: C.accent }} />} {title}
        </h3>
      )}
      {children}
    </section>
  );
}

function ProbBar({ home, draw, away, homeName, awayName }: { home: number; draw?: number; away: number; homeName: string; awayName: string }) {
  const seg = (v: number, color: string) => (v > 0.001 ? <div style={{ width: `${v * 100}%`, background: color }} /> : null);
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
        <span className="font-semibold" style={{ color: C.accent }}>{homeName} <span style={mono}>{pct(home)}</span></span>
        {draw != null && <span style={{ color: C.muted }}>Draw <span style={mono}>{pct(draw)}</span></span>}
        <span className="font-semibold" style={{ color: C.blue }}>{awayName} <span style={mono}>{pct(away)}</span></span>
      </div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
        {seg(home, C.accent)}
        {draw != null ? seg(draw, "#5b6b64") : null}
        {seg(away, C.blue)}
      </div>
    </div>
  );
}

const kindIcon: Record<string, typeof Info> = { stat: TrendingUp, form: Activity, h2h: Trophy, injury: AlertTriangle, market: CircleDollarSign, news: Info, context: Info };

function ReportView({ r }: { r: PredictionReport }) {
  const f = r.fixture;
  return (
    <div className="space-y-4">
      {/* verdict band — full width, the headline */}
      <section className="overflow-hidden rounded-2xl border" style={{ borderColor: C.line, background: C.panelHi }}>
        {f && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3.5" style={{ borderColor: C.line }}>
            <div className="flex items-center gap-2.5"><Logo src={f.home.logo} alt={f.home.name} size={32} /><span className="text-[15px] font-semibold" style={{ color: C.text }}>{f.home.name}</span></div>
            <span className="text-[12px] font-medium" style={{ ...mono, color: C.faint }}>vs</span>
            <div className="flex items-center gap-2.5"><span className="text-[15px] font-semibold" style={{ color: C.text }}>{f.away.name}</span><Logo src={f.away.logo} alt={f.away.name} size={32} /></div>
            {r.league && <span className="ml-auto text-[12px]" style={{ ...mono, color: C.faint }}>{r.league.emoji} {r.league.name} · {f.startsAt.slice(0, 10)}{f.venue ? ` · ${f.venue}` : ""}</span>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
          <Stance stance={r.verdict.stance} />
          <span className="text-[16px] font-semibold" style={{ color: C.text }}>{r.verdict.headline}</span>
          <span className="ml-auto flex items-center gap-2 text-[12px]" style={{ color: C.muted }}>
            confidence
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}><span className="block h-full rounded-full" style={{ width: `${r.verdict.confidence}%`, background: r.verdict.confidence >= 60 ? C.accent : C.muted }} /></span>
              <b style={{ ...mono, color: r.verdict.confidence >= 60 ? C.accent : C.text }}>{r.verdict.confidence}</b>
            </span>
          </span>
        </div>
      </section>

      {/* wide grid fills the screen: analysis left, context right */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          {r.probabilities && f && (
            <Card title="Model probability" icon={TrendingUp}>
              <ProbBar home={r.probabilities.home} draw={r.probabilities.draw} away={r.probabilities.away} homeName={f.home.abbrev || f.home.shortName || f.home.name} awayName={f.away.abbrev || f.away.shortName || f.away.name} />
              <p className="mt-3 text-[11.5px]" style={{ color: C.faint }}>
                {r.probabilities.method}
                {r.probabilities.expHome != null ? ` · expected goals ${r.probabilities.expHome}–${r.probabilities.expAway}` : ""}
                {r.probabilities.overProb != null ? ` · over 2.5 ${(r.probabilities.overProb * 100).toFixed(0)}% · BTTS ${((r.probabilities.bttsProb ?? 0) * 100).toFixed(0)}%` : ""}
              </p>
            </Card>
          )}
          {r.selections.length > 0 && (
            <Card title="Selections & value" icon={CircleDollarSign}>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]" style={mono}>
                  <thead><tr style={{ color: C.faint }}>{["Market", "Pick", "Model", "Book", "Edge", "¼-Kelly"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {r.selections.map((s, i) => (
                      <tr key={i} style={{ color: C.text, borderTop: `1px solid ${C.line}` }}>
                        <td className="px-2 py-2" style={{ color: C.muted }}>{s.market}</td>
                        <td className="px-2 py-2 font-semibold">{s.pick}</td>
                        <td className="px-2 py-2">{(s.modelProb * 100).toFixed(0)}%</td>
                        <td className="px-2 py-2">{s.bookOdds ? s.bookOdds.toFixed(2) : "—"}</td>
                        <td className="px-2 py-2 font-semibold" style={{ color: s.edgePct != null ? (s.edgePct >= 4 ? C.accent : s.edgePct >= 0 ? C.amber : C.red) : C.faint }}>{s.edgePct != null ? `${s.edgePct > 0 ? "+" : ""}${s.edgePct}%` : "—"}</td>
                        <td className="px-2 py-2" style={{ color: C.faint }}>{s.kellyFraction ? `${(s.kellyFraction * 100).toFixed(1)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Card title="The read" icon={Sparkles}>
            <p className="text-[14px] leading-relaxed" style={{ color: C.text }}>{r.reasoning}</p>
            {r.risks.length > 0 && (
              <div className="mt-4 border-t pt-3" style={{ borderColor: C.line }}>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.amber }}>Risks</span>
                <ul className="mt-1.5 space-y-1.5">{r.risks.map((x, i) => <li key={i} className="flex items-start gap-2 text-[12.5px]" style={{ color: C.muted }}><span style={{ color: C.amber }}>▸</span>{x}</li>)}</ul>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-5">
          {r.evidence.length > 0 && (
            <Card title="Evidence" icon={Info}>
              <ul className="space-y-2">
                {r.evidence.map((ev, i) => { const Icon = kindIcon[ev.kind] || Info; return (
                  <li key={i} className="flex items-start gap-2.5 text-[12.5px]" style={{ color: C.muted }}>
                    <Icon size={13} className="mt-0.5 shrink-0" style={{ color: C.accent }} />
                    <span>{ev.text}{ev.source ? <span style={{ color: C.faint }}> — {ev.source.length > 26 ? "web" : ev.source}</span> : null}</span>
                  </li>); })}
              </ul>
            </Card>
          )}
          {r.availability.length > 0 && (
            <Card title="Availability" icon={AlertTriangle}>
              <ul className="space-y-1.5">{r.availability.slice(0, 12).map((a, i) => (
                <li key={i} className="flex items-center justify-between text-[12.5px]"><span style={{ color: C.text }}>{a.player}</span><span style={{ ...mono, color: C.amber }}>{a.status}</span></li>
              ))}</ul>
            </Card>
          )}
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-xl border px-4 py-2.5 text-[11.5px] leading-relaxed" style={{ borderColor: "rgba(251,191,36,0.22)", background: "rgba(251,191,36,0.04)", color: C.muted }}>
        <ShieldAlert size={13} className="mt-0.5 shrink-0" style={{ color: C.amber }} />{r.disclaimer}
      </p>
    </div>
  );
}

function FixtureCard({ f, odds, onAnalyze }: { f: Fixture; odds?: MarketOdds; onAnalyze: () => void }) {
  const imp = odds?.implied;
  return (
    <button type="button" onClick={onAnalyze} className="group rounded-2xl border p-3.5 text-left transition hover:border-white/25" style={{ borderColor: C.line, background: C.panel }}>
      <div className="flex items-center justify-between text-[10.5px]" style={{ ...mono, color: C.faint }}>
        <span>{new Date(f.startsAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
        {f.status !== "scheduled" && <span style={{ color: C.accent }}>{f.status === "in" ? "● LIVE" : `${f.homeScore}-${f.awayScore}`}</span>}
      </div>
      <div className="mt-2.5 space-y-2">
        <div className="flex items-center gap-2.5"><Logo src={f.home.logo} alt={f.home.name} /><span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" style={{ color: C.text }}>{f.home.name}</span>{imp?.home != null && <span className="text-[11px]" style={{ ...mono, color: C.muted }}>{(imp.home * 100).toFixed(0)}%</span>}</div>
        <div className="flex items-center gap-2.5"><Logo src={f.away.logo} alt={f.away.name} /><span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" style={{ color: C.text }}>{f.away.name}</span>{imp?.away != null && <span className="text-[11px]" style={{ ...mono, color: C.muted }}>{(imp.away * 100).toFixed(0)}%</span>}</div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[10.5px] font-semibold transition group-hover:gap-2.5" style={{ color: C.accent }}>
        Analyse <ArrowRight size={12} />{odds ? <span style={{ color: C.faint }}>· odds live</span> : null}
      </div>
    </button>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */
export function EdgeConsole() {
  const [denied, setDenied] = useState(false);
  const [mode, setMode] = useState<"analyse" | "video">("analyse");
  const [fx, setFx] = useState<FixturesResponse | null>(null);
  const [league, setLeague] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<PredictionReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/edge/fixtures", { cache: "no-store" });
        if (res.status === 403) { setDenied(true); return; }
        if (res.ok) setFx((await res.json()) as FixturesResponse);
      } catch { /* transient */ }
    })();
  }, []);

  const ask = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query || loading) return;
    setQuestion(query);
    setLoading(true);
    setErr(null);
    setReport(null);
    try {
      const res = await fetch("/api/edge/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: query }) });
      if (res.status === 403) { setDenied(true); return; }
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Analysis failed."); return; }
      setReport(d.report as PredictionReport);
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch {
      setErr("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  if (denied)
    return (
      <div className="relative grid min-h-[100dvh] place-items-center px-6 text-center" style={{ background: C.bg, color: C.text }}>
        <div className="pointer-events-none fixed inset-0 z-0"><EdgeBackground /></div>
        <div className="relative z-10">
          <ShieldAlert size={38} className="mx-auto" style={{ color: C.faint }} />
          <h1 className="mt-3 text-2xl font-bold tracking-tight">Restricted</h1>
          <p className="mt-1 text-sm" style={{ color: C.muted }}>Edge is limited to the Clunoid administrator account.</p>
          <Link href="/home" className="mt-5 inline-block rounded-full px-4 py-2 text-[13px] font-semibold" style={{ color: "#0a0c0d", background: C.accent }}>← back home</Link>
        </div>
      </div>
    );

  const groups = fx?.groups.filter((g) => !league || g.league.id === league) ?? [];

  return (
    <div className="relative min-h-[100dvh] pb-20" style={{ background: C.bg, color: C.text }}>
      <div className="pointer-events-none fixed inset-0 z-0"><EdgeBackground /></div>

      {/* header — full bleed */}
      <header className="sticky top-0 z-20 border-b backdrop-blur-xl" style={{ borderColor: C.line, background: "rgba(10,12,13,0.72)" }}>
        <div className="flex w-full items-center gap-4 px-4 py-3 sm:px-6 xl:px-10">
          <Link href="/home" aria-label="Home" className="flex items-center gap-1 text-[13px] transition hover:text-white" style={{ color: C.muted }}><ArrowLeft size={15} /> clunoid</Link>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[19px] font-bold tracking-[0.14em]" style={{ color: C.accent }}>EDGE</span>
            <span className="hidden text-[12px] sm:inline" style={{ color: C.faint }}>Sports Intelligence</span>
          </div>
          {/* mode toggle */}
          <div className="ml-auto flex items-center gap-1 rounded-full border p-0.5" style={{ borderColor: C.line, background: "rgba(255,255,255,0.03)" }}>
            {([["analyse", "Analyse", LineChart], ["video", "Videos", Clapperboard]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setMode(id)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition" style={mode === id ? { color: "#0a0c0d", background: C.accent } : { color: C.muted }}>
                <Icon size={14} /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <span className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide md:flex" style={{ ...mono, color: C.amber, background: "rgba(251,191,36,0.1)" }}><ShieldAlert size={11} /> 18+</span>
        </div>
      </header>

      {/* body — full width edge to edge (no centered max-width) */}
      <main className="relative z-10 w-full px-4 pt-6 sm:px-6 xl:px-10">
        {mode === "video" ? (
          <EdgeVideoStudio />
        ) : (
        <>
        {/* hero ask */}
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
            Ask anything. Get an <span style={{ color: C.accent }}>evidence-based</span> read.
          </h1>
          <p className="mt-2 max-w-2xl text-[14px]" style={{ color: C.muted }}>
            Real fixtures, live market odds, injuries, form and head-to-head — modelled, researched by top-tier AI, and explained. When there is no edge, it says so.
          </p>
          <div className="mt-5 flex items-stretch gap-2.5">
            <div className="flex flex-1 items-center rounded-full border px-4" style={{ borderColor: C.line, background: C.panelHi }}>
              <Sparkles size={17} className="shrink-0" style={{ color: C.accent }} />
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void ask(question); } }}
                placeholder="Is there value on Arsenal to beat Chelsea?"
                className="w-full bg-transparent px-3 py-3.5 text-[15px] outline-none placeholder:text-white/25"
                style={{ color: C.text }}
              />
            </div>
            <button type="button" onClick={() => void ask(question)} disabled={loading || !question.trim()} className="flex shrink-0 items-center gap-2 rounded-full px-5 text-[14px] font-bold transition hover:brightness-110 disabled:opacity-40" style={{ background: C.accent, color: "#0a0c0d" }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              <span className="hidden sm:inline">Analyse</span>
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => void ask(ex)} className="rounded-full border px-3 py-1.5 text-[12px] transition hover:border-white/25 hover:text-white" style={{ borderColor: C.line, color: C.muted }}>{ex}</button>)}
          </div>
        </div>

        {err && <p className="mt-4 rounded-xl border px-4 py-2.5 text-[12.5px]" style={{ borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", color: C.red }}>{err}</p>}

        {(loading || report) && (
          <div ref={reportRef} className="mt-6">
            {loading ? (
              <div className="grid place-items-center gap-3 rounded-2xl border py-16" style={{ borderColor: C.line, background: C.panel }}>
                <Loader2 size={28} className="animate-spin" style={{ color: C.accent }} />
                <span className="text-[13px]" style={{ color: C.muted }}>Resolving the fixture · gathering stats, odds & team news · modelling · reasoning…</span>
              </div>
            ) : report ? <ReportView r={report} /> : null}
          </div>
        )}

        {/* fixtures — full-bleed dense grid */}
        <div className="mt-10">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.faint }}><CalendarDays size={13} /> Upcoming fixtures</span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setLeague("")} className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition" style={league === "" ? { color: "#0a0c0d", background: C.accent } : { color: C.muted, background: "rgba(255,255,255,0.04)" }}>All</button>
              {fx?.leagues.map((l) => <button key={l.id} type="button" onClick={() => setLeague(l.id)} className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition" style={league === l.id ? { color: "#0a0c0d", background: C.accent } : { color: C.muted, background: "rgba(255,255,255,0.04)" }}>{l.emoji} {l.name}</button>)}
            </div>
          </div>
          {!fx ? (
            <div className="grid place-items-center py-14"><Loader2 size={24} className="animate-spin" style={{ color: C.faint }} /></div>
          ) : groups.length === 0 ? (
            <p className="py-10 text-center text-[13px]" style={{ color: C.faint }}>No fixtures in the current window for this selection.</p>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <div key={g.league.id}>
                  <h3 className="mb-2.5 text-[12px] font-semibold" style={{ color: C.muted }}>{g.league.emoji} {g.league.name}</h3>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1600px]:grid-cols-5">
                    {g.fixtures.map((f) => <FixtureCard key={f.id} f={f} odds={g.oddsById[f.id]} onAnalyze={() => void ask(`Analyse ${f.home.name} vs ${f.away.name} in the ${g.league.name} — is there value and who wins?`)} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        )}
      </main>
    </div>
  );
}
