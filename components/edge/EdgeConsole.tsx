"use client";

/**
 * EDGE — Sports Intelligence & Betting Analysis (a Pro/Max feature). A clean,
 * modern, full-bleed console: ask any sports-betting question in natural language
 * and get an evidence-based, uncertainty-honest report (model probabilities, market
 * value, confidence, evidence, reasoning, risks) — or browse real fixtures and
 * analyse one in a click. Full width edge-to-edge like the Trading Desk. Security is
 * server-side (/api/edge/* verify the session + plan + charge credits); signed-out
 * users get a sign-in screen, free users an upgrade prompt.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Loader2, ShieldAlert, TrendingUp, CalendarDays, ArrowRight, Info, Trophy, CircleDollarSign, AlertTriangle, Activity, LineChart, Clapperboard, Download } from "lucide-react";
import { EdgeBackground } from "./EdgeBackground";
import { EdgeVideoStudio } from "./EdgeVideoStudio";
import { EdgeGateBanner } from "./EdgeGate";
import { edgeGate } from "@/lib/edge/gate";
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
    "no-bet": { label: "PICK", color: C.accent, bg: C.accentDim },
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
        {r.verdict.bestChance && (
          <div className="flex flex-wrap items-center gap-2 border-t px-5 py-2.5 text-[12.5px]" style={{ borderColor: C.line }}>
            <Trophy size={14} style={{ color: C.accent }} />
            <span style={{ color: C.muted }}>Best chance to win:</span>
            <b style={{ color: C.accent }}>{r.verdict.bestChance.pick}</b>
            <span style={{ ...mono, color: C.text }}>{(r.verdict.bestChance.modelProb * 100).toFixed(0)}%</span>
            <span className="text-[11px]" style={{ color: C.faint }}>· {r.verdict.bestChance.market} — the safest strong play</span>
          </div>
        )}
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

function BulkCard({ r }: { r: PredictionReport }) {
  const f = r.fixture;
  const best = r.verdict.bestChance;
  const val = r.verdict.topSelection;
  const p = r.probabilities;
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: C.line, background: C.panel }}>
      <div className="flex items-center justify-between text-[10px]" style={{ ...mono, color: C.faint }}>
        <span className="truncate">{r.league?.emoji} {r.league?.name}</span>
        <span>{f ? new Date(f.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</span>
      </div>
      {f && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2"><Logo src={f.home.logo} alt={f.home.name} size={18} /><span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: C.text }}>{f.home.name}</span>{p && <span className="text-[10.5px]" style={{ ...mono, color: C.muted }}>{(p.home * 100).toFixed(0)}%</span>}</div>
          <div className="flex items-center gap-2"><Logo src={f.away.logo} alt={f.away.name} size={18} /><span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: C.text }}>{f.away.name}</span>{p && <span className="text-[10.5px]" style={{ ...mono, color: C.muted }}>{(p.away * 100).toFixed(0)}%</span>}</div>
        </div>
      )}
      {best ? (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px]" style={{ background: C.accentDim, color: C.accent }}>
          <Trophy size={12} className="shrink-0" /> <b className="truncate">{best.pick}</b> <span style={mono}>{(best.modelProb * 100).toFixed(0)}%</span>
          {val?.edgePct != null && val.edgePct >= 3 && <span className="ml-auto shrink-0 text-[10.5px]" style={{ color: C.text }}>+{val.edgePct}% val</span>}
        </div>
      ) : <p className="mt-2.5 text-[11px]" style={{ color: C.faint }}>{r.verdict.headline}</p>}
    </div>
  );
}

/** The single headline PREDICTION for a report — the best-chance pick, or the model
 *  favourite if no market/pick. Never "no bet". */
function predictionOf(r: PredictionReport): { pick: string; prob: number; market?: string } | null {
  const b = r.verdict.bestChance;
  if (b) return { pick: b.pick, prob: b.modelProb, market: b.market };
  const p = r.probabilities;
  if (p && r.fixture) {
    const homeFav = p.home >= p.away;
    return { pick: `${homeFav ? r.fixture.home.name : r.fixture.away.name} to win`, prob: Math.max(p.home, p.away) };
  }
  return null;
}

/** Today's slate as a clean table: match · competition · kickoff · prediction. */
function DailyTable({ reports }: { reports: PredictionReport[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead><tr style={{ color: C.faint }}>{["#", "Match", "Competition", "Kickoff", "Prediction", ""].map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {reports.map((r, i) => {
            const f = r.fixture;
            const pr = predictionOf(r);
            return (
              <tr key={i} style={{ color: C.text, borderTop: `1px solid ${C.line}` }}>
                <td className="px-2 py-2.5" style={{ ...mono, color: C.faint }}>{i + 1}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    {f && <Logo src={f.home.logo} alt={f.home.name} size={18} />}
                    <span className="font-semibold">{f ? f.home.name : "—"}</span>
                    <span style={{ color: C.faint }}>v</span>
                    <span className="font-semibold">{f ? f.away.name : "—"}</span>
                    {f && <Logo src={f.away.logo} alt={f.away.name} size={18} />}
                  </div>
                </td>
                <td className="whitespace-nowrap px-2 py-2.5" style={{ color: C.muted }}>{r.league?.emoji} {r.league?.name}</td>
                <td className="whitespace-nowrap px-2 py-2.5" style={{ ...mono, color: C.muted }}>{f ? new Date(f.startsAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td className="px-2 py-2.5">
                  {pr ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 font-semibold" style={{ background: C.accentDim, color: C.accent }}>{pr.pick} <span style={mono}>{Math.round(pr.prob * 100)}%</span></span> : <span style={{ color: C.faint }}>—</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-2.5" style={{ color: C.faint }}>{pr?.market || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */
export function EdgeConsole() {
  const [denied, setDenied] = useState(false);
  const [mode, setMode] = useState<"analyse" | "video">("analyse");
  const [videoStatus, setVideoStatus] = useState({ busy: false, pct: 0, label: "" });
  const [fx, setFx] = useState<FixturesResponse | null>(null);
  const [league, setLeague] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<PredictionReport | null>(null);
  const [reports, setReports] = useState<PredictionReport[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);
  const [entitled, setEntitled] = useState<boolean | null>(null); // null = verifying access
  const [daily, setDaily] = useState<PredictionReport[] | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyErr, setDailyErr] = useState<string | null>(null);
  const [dailyUpsell, setDailyUpsell] = useState(false);
  const [videoSeed, setVideoSeed] = useState({ text: "", n: 0 });
  const reportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // verify entitlement on open (Pro/Max sub or purchased credits; admins always).
    // Drives whether the inputs + AI/voice tools are enabled — the server still
    // atomically gates + charges every action, so this is UX, not the security.
    void (async () => {
      try {
        const res = await fetch("/api/edge/access", { cache: "no-store" });
        const d = (await res.json().catch(() => ({}))) as { authed?: boolean; entitled?: boolean };
        if (!d.authed) { setDenied(true); return; } // signed out → sign-in screen
        setEntitled(!!d.entitled);
      } catch {
        setEntitled(true); // transient — server route still blocks a non-entitled action
      }
    })();
    // browsing fixtures is free for any signed-in user (view-only teaser)
    void (async () => {
      try {
        const res = await fetch("/api/edge/fixtures", { cache: "no-store" });
        if (res.status === 401) { setDenied(true); return; }
        if (res.ok) setFx((await res.json()) as FixturesResponse);
      } catch { /* transient */ }
    })();
  }, []);

  const ask = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query || loading || entitled === false) return; // gated → no request fires
    setQuestion(query);
    setLoading(true);
    setErr(null);
    setUpsell(false);
    setReport(null);
    setReports(null);
    try {
      const res = await fetch("/api/edge/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: query }) });
      if (res.status === 401) { setDenied(true); return; }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const g = edgeGate(res.status, (d as { error?: string }).error);
        setErr(g?.message || (d as { error?: string }).error || "Analysis failed.");
        setUpsell(!!g?.upgrade);
        return;
      }
      if (Array.isArray(d.reports)) setReports(d.reports as PredictionReport[]); // bulk (a whole slate/competition)
      else setReport(d.report as PredictionReport);
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch {
      setErr("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }, [loading, entitled]);

  const runDaily = useCallback(async () => {
    if (dailyLoading || entitled === false) return; // gated → no request fires
    setDailyLoading(true);
    setDailyErr(null);
    setDailyUpsell(false);
    try {
      const res = await fetch("/api/edge/daily", { method: "POST" });
      if (res.status === 401) { setDenied(true); return; }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const g = edgeGate(res.status, (d as { error?: string }).error);
        setDailyErr(g?.message || (d as { error?: string }).error || "Couldn't load today's predictions.");
        setDailyUpsell(!!g?.upgrade);
        return;
      }
      setDaily((d.reports as PredictionReport[]) || []);
    } catch {
      setDailyErr("Network error — try again.");
    } finally {
      setDailyLoading(false);
    }
  }, [dailyLoading, entitled]);

  const downloadDaily = useCallback(() => {
    if (!daily?.length) return;
    const rows: string[][] = [["#", "Match", "Competition", "Kickoff", "Prediction", "Confidence"]];
    daily.forEach((r, i) => {
      const pr = predictionOf(r);
      const f = r.fixture;
      const kickoff = f ? new Date(f.startsAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
      rows.push([String(i + 1), f ? `${f.home.name} vs ${f.away.name}` : r.question, r.league?.name || "", kickoff, pr ? pr.pick : "—", pr ? `${Math.round(pr.prob * 100)}%` : ""]);
    });
    const csv = rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "edge-todays-predictions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [daily]);

  const dailyToVideo = useCallback(() => {
    const matchups = (daily || []).filter((r) => r.fixture).slice(0, 6).map((r) => `${r.fixture!.home.name} vs ${r.fixture!.away.name}`).join(", ");
    if (!matchups) return;
    setVideoSeed((s) => ({ text: matchups, n: s.n + 1 }));
    setMode("video");
  }, [daily]);

  if (denied)
    return (
      <div className="relative grid min-h-[100dvh] place-items-center px-6 text-center" style={{ background: C.bg, color: C.text }}>
        <div className="pointer-events-none fixed inset-0 z-0"><EdgeBackground /></div>
        <div className="relative z-10">
          <ShieldAlert size={38} className="mx-auto" style={{ color: C.faint }} />
          <h1 className="mt-3 text-2xl font-bold tracking-tight">Sign in to use Edge</h1>
          <p className="mt-1 text-sm" style={{ color: C.muted }}>Edge is a Pro feature — sign in to run AI match predictions and prediction videos.</p>
          <Link href="/home" className="mt-5 inline-block rounded-full px-4 py-2 text-[13px] font-semibold" style={{ color: "#0a0c0d", background: C.accent }}>Sign in →</Link>
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
          {videoStatus.busy && mode === "analyse" && (
            <button type="button" onClick={() => setMode("video")} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ color: C.accent, background: C.accentDim }}>
              <Loader2 size={11} className="animate-spin" /> video {videoStatus.pct}%
            </button>
          )}
          <span className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide md:flex" style={{ ...mono, color: C.amber, background: "rgba(251,191,36,0.1)" }}><ShieldAlert size={11} /> 18+</span>
        </div>
      </header>

      {/* body — full width edge to edge (no centered max-width) */}
      <main className="relative z-10 w-full px-4 pt-6 sm:px-6 xl:px-10">
        {/* video studio stays MOUNTED across mode switches so encoding continues
            in the background while the user browses/analyses */}
        <div className={mode === "video" ? "" : "hidden"}>
          <EdgeVideoStudio onStatus={setVideoStatus} entitled={entitled} seed={videoSeed.text} seedNonce={videoSeed.n} />
        </div>
        <div className={mode === "analyse" ? "" : "hidden"}>
        {/* hero ask */}
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
            Ask anything. Get an <span style={{ color: C.accent }}>evidence-based</span> read.
          </h1>
          <p className="mt-2 max-w-2xl text-[14px]" style={{ color: C.muted }}>
            Real fixtures, live market odds, injuries, form and head-to-head — modelled, researched by top-tier AI, and explained. When there is no edge, it says so.
          </p>
          {entitled === false && <div className="mt-5"><EdgeGateBanner /></div>}
          <div className="mt-5 flex items-stretch gap-2.5">
            <div className="flex flex-1 items-center rounded-full border px-4" style={{ borderColor: C.line, background: C.panelHi, opacity: entitled === true ? 1 : 0.55 }}>
              <Sparkles size={17} className="shrink-0" style={{ color: C.accent }} />
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void ask(question); } }}
                placeholder={entitled === false ? "Subscribe or add credits to analyse…" : "Is there value on Arsenal to beat Chelsea?"}
                disabled={entitled !== true}
                className="w-full bg-transparent px-3 py-3.5 text-[15px] outline-none placeholder:text-white/25 disabled:cursor-not-allowed"
                style={{ color: C.text }}
              />
            </div>
            <button type="button" onClick={() => void ask(question)} disabled={loading || !question.trim() || entitled !== true} className="flex shrink-0 items-center gap-2 rounded-full px-5 text-[14px] font-bold transition hover:brightness-110 disabled:opacity-40" style={{ background: C.accent, color: "#0a0c0d" }}>
              {loading || entitled === null ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              <span className="hidden sm:inline">Analyse</span>
            </button>
          </div>
          {entitled === null && <p className="mt-2 text-[11.5px]" style={{ color: C.faint }}>Verifying your access…</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => void ask(ex)} disabled={entitled !== true} className="rounded-full border px-3 py-1.5 text-[12px] transition hover:border-white/25 hover:text-white disabled:opacity-40 disabled:hover:border-white/10" style={{ borderColor: C.line, color: C.muted }}>{ex}</button>)}
          </div>
        </div>

        {err && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-[12.5px]" style={{ borderColor: upsell ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.3)", background: upsell ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.06)", color: upsell ? C.text : C.red }}>
            <span>{err}</span>
            {upsell && <Link href="/pricing" className="ml-auto rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: C.accent, color: "#0a0c0d" }}>See plans →</Link>}
          </div>
        )}

        {/* Today's Top 10 Predictions — the daily slate (Pro/Max) */}
        <div className="mt-8 rounded-2xl border p-4 sm:p-5" style={{ borderColor: C.line, background: C.panel }}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[16px] font-bold" style={{ color: C.text }}><Trophy size={17} style={{ color: C.accent }} /> Today&apos;s Top 10 Predictions</h2>
              <p className="mt-0.5 text-[12.5px]" style={{ color: C.muted }}>The day&apos;s biggest matches — Premier League, World Cup, La Liga &amp; more — each with our prediction. Download it, or turn it into a video.</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {daily && daily.length > 0 && (
                <>
                  <button type="button" onClick={downloadDaily} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition hover:border-white/25" style={{ borderColor: C.line, color: C.text }}><Download size={13} /> Download</button>
                  <button type="button" onClick={dailyToVideo} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition hover:border-white/25" style={{ borderColor: C.line, color: C.accent }}><Clapperboard size={13} /> Make a video</button>
                </>
              )}
              <button type="button" onClick={() => void runDaily()} disabled={dailyLoading || entitled !== true} className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-bold transition hover:brightness-110 disabled:opacity-40" style={{ background: C.accent, color: "#0a0c0d" }}>
                {dailyLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {daily ? "Refresh" : "Generate"}
              </button>
            </div>
          </div>
          {dailyErr && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2 text-[12.5px]" style={{ borderColor: dailyUpsell ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.3)", background: dailyUpsell ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.06)", color: dailyUpsell ? C.text : C.red }}>
              <span>{dailyErr}</span>{dailyUpsell && <Link href="/pricing" className="ml-auto rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: C.accent, color: "#0a0c0d" }}>See plans →</Link>}
            </div>
          )}
          {dailyLoading && !daily && (
            <div className="mt-4 grid place-items-center gap-2 py-10"><Loader2 size={22} className="animate-spin" style={{ color: C.accent }} /><span className="text-[12.5px]" style={{ color: C.muted }}>Building today&apos;s slate across the top competitions…</span></div>
          )}
          {daily && daily.length > 0 && <DailyTable reports={daily} />}
          {daily && daily.length === 0 && <p className="mt-4 text-[12.5px]" style={{ color: C.faint }}>No upcoming fixtures to predict right now — check back closer to matchday.</p>}
        </div>

        {(loading || report || reports) && (
          <div ref={reportRef} className="mt-6">
            {loading ? (
              <div className="grid place-items-center gap-3 rounded-2xl border py-16" style={{ borderColor: C.line, background: C.panel }}>
                <Loader2 size={28} className="animate-spin" style={{ color: C.accent }} />
                <span className="text-[13px]" style={{ color: C.muted }}>Resolving fixtures · gathering stats, odds & team news · modelling · reasoning…</span>
              </div>
            ) : reports ? (
              <div>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.faint }}>{reports.length} fixtures analysed</h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {reports.map((r, i) => <BulkCard key={i} r={r} />)}
                </div>
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
        </div>
      </main>
    </div>
  );
}
