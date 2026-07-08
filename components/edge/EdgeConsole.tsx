"use client";

/**
 * EDGE — Sports Intelligence & Betting Analysis (admin-only). Full-screen premium
 * console: ask any sports-betting question in natural language and get an
 * evidence-based, uncertainty-honest report (model probabilities, market value,
 * confidence, evidence, reasoning, risks) — or browse real upcoming fixtures and
 * analyse one in a click. All security is server-side (/api/edge/* verify admin);
 * this renders a Restricted screen on 403.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Loader2, ShieldAlert, TrendingUp, CalendarDays, Send, Info, Trophy, CircleDollarSign, AlertTriangle } from "lucide-react";
import { EdgeBackground } from "./EdgeBackground";
import type { PredictionReport, Fixture, LeagueDef, MarketOdds } from "@/lib/edge/types";

const E = {
  ground: "#07090b",
  panel: "rgba(12,19,16,0.82)",
  panel2: "rgba(16,24,20,0.9)",
  line: "rgba(140,170,150,0.14)",
  text: "#e9f2ec",
  muted: "#93a89e",
  faint: "#5f6f67",
  accent: "#34d399",
  cyan: "#22d3ee",
  up: "#34d399",
  down: "#f87171",
  warn: "#fbbf24",
};

type FixtureGroup = { league: LeagueDef; fixtures: Fixture[]; oddsById: Record<string, MarketOdds> };
type FixturesResponse = { leagues: { id: string; name: string; emoji?: string; sport: string }[]; groups: FixtureGroup[] };

const EXAMPLES = [
  "Who wins Arsenal vs Chelsea in the Premier League?",
  "Is there value on Real Madrid to beat Barcelona?",
  "Over/under goals for Bayern vs Dortmund?",
  "Best bet in the NBA tonight?",
];

/* ── small pieces ─────────────────────────────────────────────────────────── */
function Logo({ src, alt, size = 22 }: { src?: string; alt: string; size?: number }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return <span className="grid shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold" style={{ width: size, height: size, background: "rgba(140,170,150,0.12)", color: E.faint }}>{alt.slice(0, 3).toUpperCase()}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} referrerPolicy="no-referrer" onError={() => setOk(false)} style={{ width: size, height: size, objectFit: "contain" }} className="shrink-0" />;
}

function StanceBadge({ stance }: { stance: PredictionReport["verdict"]["stance"] }) {
  const map = {
    bet: { label: "VALUE BET", color: E.accent, bg: "rgba(52,211,153,0.14)" },
    lean: { label: "LEAN", color: E.warn, bg: "rgba(251,191,36,0.14)" },
    "no-bet": { label: "NO BET", color: E.muted, bg: "rgba(140,170,150,0.1)" },
  }[stance];
  return <span className="rounded-md px-2.5 py-1 font-mono text-[11px] font-bold tracking-wide" style={{ color: map.color, background: map.bg }}>{map.label}</span>;
}

function ProbBar({ home, draw, away, homeName, awayName }: { home: number; draw?: number; away: number; homeName: string; awayName: string }) {
  const seg = (label: string, v: number, color: string) => (v > 0.001 ? <div className="grid place-items-center overflow-hidden text-[10px] font-bold" style={{ width: `${v * 100}%`, background: color, color: "#07090b" }} title={`${label} ${(v * 100).toFixed(0)}%`}>{v > 0.08 ? `${(v * 100).toFixed(0)}%` : ""}</div> : null);
  return (
    <div>
      <div className="flex h-7 w-full overflow-hidden rounded-md" style={{ border: `1px solid ${E.line}` }}>
        {seg(homeName, home, E.accent)}
        {draw != null ? seg("Draw", draw, "#64748b") : null}
        {seg(awayName, away, E.cyan)}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px]" style={{ color: E.faint }}>
        <span style={{ color: E.accent }}>{homeName} {(home * 100).toFixed(0)}%</span>
        {draw != null && <span>Draw {(draw * 100).toFixed(0)}%</span>}
        <span style={{ color: E.cyan }}>{awayName} {(away * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

const kindIcon: Record<string, typeof Info> = { stat: TrendingUp, form: TrendingUp, h2h: Trophy, injury: AlertTriangle, market: CircleDollarSign, news: Info, context: Info };

function ReportView({ r }: { r: PredictionReport }) {
  const f = r.fixture;
  return (
    <div className="space-y-3">
      {/* verdict */}
      <div className="rounded-xl border p-4" style={{ borderColor: E.line, background: E.panel2 }}>
        {f && (
          <div className="mb-3 flex items-center gap-3">
            <div className="flex items-center gap-2"><Logo src={f.home.logo} alt={f.home.name} size={30} /><span className="font-bold" style={{ color: E.text }}>{f.home.name}</span></div>
            <span className="font-mono text-[11px]" style={{ color: E.faint }}>vs</span>
            <div className="flex items-center gap-2"><span className="font-bold" style={{ color: E.text }}>{f.away.name}</span><Logo src={f.away.logo} alt={f.away.name} size={30} /></div>
            {r.league && <span className="ml-auto hidden font-mono text-[11px] sm:inline" style={{ color: E.faint }}>{r.league.emoji} {r.league.name} · {f.startsAt.slice(0, 10)}</span>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <StanceBadge stance={r.verdict.stance} />
          <span className="font-bold" style={{ color: E.text }}>{r.verdict.headline}</span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px]" style={{ color: E.muted }}>confidence <b style={{ color: r.verdict.confidence >= 60 ? E.accent : E.muted }}>{r.verdict.confidence}%</b></span>
        </div>
      </div>

      {/* probabilities + market */}
      {r.probabilities && f && (
        <div className="rounded-xl border p-4" style={{ borderColor: E.line, background: E.panel }}>
          <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: E.faint }}>Model probability</h3>
          <ProbBar home={r.probabilities.home} draw={r.probabilities.draw} away={r.probabilities.away} homeName={f.home.abbrev || f.home.shortName || f.home.name} awayName={f.away.abbrev || f.away.shortName || f.away.name} />
          <div className="mt-2 font-mono text-[10.5px]" style={{ color: E.faint }}>{r.probabilities.method}{r.probabilities.expHome != null ? ` · expected goals ${r.probabilities.expHome}–${r.probabilities.expAway}` : ""}{r.probabilities.overProb != null ? ` · over 2.5: ${(r.probabilities.overProb * 100).toFixed(0)}% · BTTS: ${((r.probabilities.bttsProb ?? 0) * 100).toFixed(0)}%` : ""}</div>
        </div>
      )}

      {/* selections with value */}
      {r.selections.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: E.line, background: E.panel }}>
          <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: E.faint }}>Selections & value</h3>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[11.5px]">
              <thead><tr style={{ color: E.faint }}>{["Market", "Pick", "Model", "Book", "Edge", "¼-Kelly"].map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {r.selections.map((s, i) => (
                  <tr key={i} style={{ color: E.text, borderTop: `1px solid ${E.line}` }}>
                    <td className="px-2 py-1.5" style={{ color: E.muted }}>{s.market}</td>
                    <td className="px-2 py-1.5 font-bold">{s.pick}</td>
                    <td className="px-2 py-1.5">{(s.modelProb * 100).toFixed(0)}%</td>
                    <td className="px-2 py-1.5">{s.bookOdds ? s.bookOdds.toFixed(2) : "—"}</td>
                    <td className="px-2 py-1.5" style={{ color: s.edgePct != null ? (s.edgePct >= 4 ? E.accent : s.edgePct >= 0 ? E.warn : E.down) : E.faint }}>{s.edgePct != null ? `${s.edgePct > 0 ? "+" : ""}${s.edgePct}%` : "—"}</td>
                    <td className="px-2 py-1.5" style={{ color: E.faint }}>{s.kellyFraction ? `${(s.kellyFraction * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* reasoning */}
      <div className="rounded-xl border p-4" style={{ borderColor: E.line, background: E.panel }}>
        <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: E.faint }}>The read</h3>
        <p className="text-[13.5px] leading-relaxed" style={{ color: E.text }}>{r.reasoning}</p>
        {r.risks.length > 0 && (
          <div className="mt-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: E.warn }}>Risks</span>
            <ul className="mt-1 space-y-1">{r.risks.map((x, i) => <li key={i} className="flex items-start gap-1.5 text-[12px]" style={{ color: E.muted }}><span style={{ color: E.warn }}>▸</span>{x}</li>)}</ul>
          </div>
        )}
      </div>

      {/* evidence + injuries */}
      {r.evidence.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: E.line, background: E.panel }}>
            <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: E.faint }}>Evidence</h3>
            <ul className="space-y-1.5">
              {r.evidence.map((ev, i) => { const Icon = kindIcon[ev.kind] || Info; return (
                <li key={i} className="flex items-start gap-2 text-[12px]" style={{ color: E.muted }}>
                  <Icon size={13} className="mt-0.5 shrink-0" style={{ color: E.accent }} />
                  <span>{ev.text}{ev.source ? <span style={{ color: E.faint }}> — {ev.source.length > 30 ? "web" : ev.source}</span> : null}</span>
                </li>); })}
            </ul>
          </div>
          {r.availability.length > 0 && (
            <div className="rounded-xl border p-4" style={{ borderColor: E.line, background: E.panel }}>
              <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: E.warn }}><AlertTriangle size={12} /> Availability</h3>
              <ul className="space-y-1">{r.availability.slice(0, 10).map((a, i) => <li key={i} className="text-[12px]" style={{ color: E.muted }}><b style={{ color: E.text }}>{a.player}</b> · {a.status}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {/* disclaimer — always present */}
      <p className="rounded-lg border px-3 py-2 text-[11px] leading-relaxed" style={{ borderColor: "rgba(251,191,36,0.25)", background: "rgba(251,191,36,0.05)", color: E.muted }}>
        <ShieldAlert size={12} className="mr-1 inline" style={{ color: E.warn }} />{r.disclaimer}
      </p>
    </div>
  );
}

function FixtureCard({ f, odds, onAnalyze }: { f: Fixture; odds?: MarketOdds; onAnalyze: () => void }) {
  const imp = odds?.implied;
  return (
    <button type="button" onClick={onAnalyze} className="rounded-xl border p-3 text-left transition hover:brightness-110" style={{ borderColor: E.line, background: E.panel }}>
      <div className="flex items-center justify-between font-mono text-[10px]" style={{ color: E.faint }}>
        <span>{new Date(f.startsAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        {f.status !== "scheduled" && <span style={{ color: E.accent }}>{f.status === "in" ? "LIVE" : `${f.homeScore}-${f.awayScore}`}</span>}
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-2"><Logo src={f.home.logo} alt={f.home.name} /><span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: E.text }}>{f.home.name}</span>{imp?.home != null && <span className="font-mono text-[11px]" style={{ color: E.muted }}>{(imp.home * 100).toFixed(0)}%</span>}</div>
        <div className="flex items-center gap-2"><Logo src={f.away.logo} alt={f.away.name} /><span className="min-w-0 flex-1 truncate text-[13px] font-bold" style={{ color: E.text }}>{f.away.name}</span>{imp?.away != null && <span className="font-mono text-[11px]" style={{ color: E.muted }}>{(imp.away * 100).toFixed(0)}%</span>}</div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] font-bold" style={{ color: E.accent }}><Sparkles size={11} /> analyze{odds ? <span style={{ color: E.faint }}> · odds available</span> : null}</div>
    </button>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */
export function EdgeConsole() {
  const [denied, setDenied] = useState(false);
  const [fx, setFx] = useState<FixturesResponse | null>(null);
  const [league, setLeague] = useState<string>("");
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
      <div className="relative grid min-h-[100dvh] place-items-center px-6 text-center" style={{ background: E.ground }}>
        <div className="pointer-events-none fixed inset-0 z-0"><EdgeBackground /></div>
        <div className="relative z-10">
          <ShieldAlert size={40} className="mx-auto" style={{ color: E.faint }} />
          <h1 className="mt-3 text-xl font-bold" style={{ color: E.text }}>Restricted</h1>
          <p className="mt-1 text-sm" style={{ color: E.muted }}>Edge is limited to the Clunoid administrator account.</p>
          <Link href="/home" className="mt-4 inline-block rounded-md px-4 py-2 font-mono text-[12px] font-bold" style={{ color: E.accent, background: "rgba(52,211,153,0.1)" }}>← back home</Link>
        </div>
      </div>
    );

  const groups = fx?.groups.filter((g) => !league || g.league.id === league) ?? [];

  return (
    <div className="relative min-h-[100dvh] pb-16" style={{ background: E.ground, color: E.text }}>
      <div className="pointer-events-none fixed inset-0 z-0"><EdgeBackground /></div>

      {/* header */}
      <header className="sticky top-0 z-20 border-b backdrop-blur" style={{ borderColor: E.line, background: "rgba(7,9,11,0.85)" }}>
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 xl:px-10">
          <Link href="/home" aria-label="Home" className="flex items-center gap-1 font-mono text-[12px] font-bold transition hover:brightness-125" style={{ color: E.muted }}><ArrowLeft size={14} /> clunoid</Link>
          <span className="font-mono text-[13px] font-black tracking-widest" style={{ color: E.accent }}>EDGE</span>
          <span className="hidden font-mono text-[11px] sm:inline" style={{ color: E.faint }}>Sports Intelligence & Betting Analysis</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold" style={{ color: E.warn, background: "rgba(251,191,36,0.1)" }}><ShieldAlert size={11} /> 18+ · analysis only</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pt-5 sm:px-6 xl:px-10">
        {/* hero ask */}
        <div className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: E.line, background: E.panel2 }}>
          <h1 className="text-lg font-black sm:text-2xl" style={{ color: E.text }}>Ask anything. Get an <span style={{ color: E.accent }}>evidence-based</span> read.</h1>
          <p className="mt-1 text-[13px]" style={{ color: E.muted }}>Real fixtures, live odds, injuries, form & head-to-head — modelled, researched, and explained. When there&apos;s no edge, it says so.</p>
          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(question); } }}
              rows={1}
              placeholder="e.g. Is there value on Arsenal to beat Chelsea?"
              className="max-h-40 min-h-[3rem] w-full resize-none rounded-xl border bg-transparent px-4 py-3 text-[14px] outline-none"
              style={{ borderColor: E.line, color: E.text }}
            />
            <button type="button" onClick={() => void ask(question)} disabled={loading || !question.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl font-bold transition hover:brightness-110 disabled:opacity-40" style={{ background: E.accent, color: "#07090b" }}>
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => void ask(ex)} className="rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition hover:brightness-125" style={{ borderColor: E.line, color: E.muted }}>{ex}</button>)}
          </div>
        </div>

        {err && <p className="mt-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", color: E.down }}>{err}</p>}

        {/* report */}
        {(loading || report) && (
          <div ref={reportRef} className="mt-4">
            {loading ? (
              <div className="grid place-items-center gap-2 rounded-xl border py-14" style={{ borderColor: E.line, background: E.panel }}>
                <Loader2 size={26} className="animate-spin" style={{ color: E.accent }} />
                <span className="font-mono text-[12px]" style={{ color: E.muted }}>Resolving fixture · gathering stats, odds & team news · modelling…</span>
              </div>
            ) : report ? <ReportView r={report} /> : null}
          </div>
        )}

        {/* fixtures browser */}
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: E.faint }}><CalendarDays size={13} /> Upcoming fixtures</span>
            <div className="ml-auto flex flex-wrap gap-1">
              <button type="button" onClick={() => setLeague("")} className="rounded-md px-2 py-1 font-mono text-[10.5px] font-bold transition" style={league === "" ? { color: E.accent, background: "rgba(52,211,153,0.12)" } : { color: E.muted }}>All</button>
              {fx?.leagues.map((l) => <button key={l.id} type="button" onClick={() => setLeague(l.id)} className="rounded-md px-2 py-1 font-mono text-[10.5px] font-bold transition" style={league === l.id ? { color: E.accent, background: "rgba(52,211,153,0.12)" } : { color: E.muted }}>{l.emoji} {l.name}</button>)}
            </div>
          </div>
          {!fx ? (
            <div className="grid place-items-center py-12"><Loader2 size={24} className="animate-spin" style={{ color: E.faint }} /></div>
          ) : groups.length === 0 ? (
            <p className="py-8 text-center font-mono text-[12px]" style={{ color: E.faint }}>No fixtures in the current window for this selection.</p>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.league.id}>
                  <h3 className="mb-2 font-mono text-[11px] font-bold" style={{ color: E.muted }}>{g.league.emoji} {g.league.name}</h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {g.fixtures.map((f) => <FixtureCard key={f.id} f={f} odds={g.oddsById[f.id]} onAnalyze={() => void ask(`Analyse ${f.home.name} vs ${f.away.name} in the ${g.league.name} — is there value and who wins?`)} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
