"use client";

/**
 * PLAYBOOKS — the transparency tab. Every validation candidate (pass AND fail)
 * with its full dossier: OOS metrics, equity curve, walk-forward windows, Monte
 * Carlo, parameter-neighborhood stability, volatility-regime split, and the
 * exact gate notes that rejected the failures. Nothing trades that isn't shown
 * here, and nothing shown here is hidden marketing — it's the research output.
 */
import { useEffect, useRef, useState } from "react";
import type { ValidationReport } from "@/lib/trading/types";

type ReportsFile = { generatedAt: string; gates: Record<string, number>; reports: ValidationReport[] };

function Equity({ curve, pass }: { curve: number[]; pass: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || !curve.length) return;
    const W = (cv.width = cv.clientWidth * 2);
    const H = (cv.height = 96);
    ctx.clearRect(0, 0, W, H);
    const min = Math.min(0, ...curve);
    const max = Math.max(0, ...curve);
    const y = (v: number) => H - 6 - ((v - min) / Math.max(1e-9, max - min)) * (H - 12);
    // zero line
    ctx.strokeStyle = "rgba(140,150,175,0.25)";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y(0));
    ctx.lineTo(W, y(0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    curve.forEach((v, i) => {
      const x = (i / (curve.length - 1)) * W;
      if (i === 0) ctx.moveTo(x, y(v));
      else ctx.lineTo(x, y(v));
    });
    ctx.strokeStyle = pass ? "#34d399" : "#8b93a7";
    ctx.lineWidth = 2;
    ctx.stroke();
    // endpoint
    const last = curve[curve.length - 1];
    ctx.fillStyle = pass ? "#34d399" : "#8b93a7";
    ctx.beginPath();
    ctx.arc(W - 3, y(last), 4, 0, Math.PI * 2);
    ctx.fill();
  }, [curve, pass]);
  return <canvas ref={ref} className="h-12 w-full" />;
}

const pf = (x: number) => (x === null || x === undefined ? "—" : x === Infinity ? "∞" : x.toFixed(2));

export function Playbooks() {
  const [data, setData] = useState<ReportsFile | null>(null);
  const [pair, setPair] = useState<string>("USDJPY");
  useEffect(() => {
    // the dossier file is sizable — load it only when this tab opens
    void import("@/lib/trading/research/reports.json").then((m) => setData(m.default as unknown as ReportsFile));
  }, []);
  if (!data) return <p className="py-10 text-center text-sm text-[#8b93a7]">Loading validation dossiers…</p>;

  const pairs = [...new Set(data.reports.map((r) => r.pair))];
  const reports = data.reports.filter((r) => r.pair === pair).sort((a, b) => Number(b.passed) - Number(a.passed) || b.oosMetrics.expectancyR - a.oosMetrics.expectancyR);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {pairs.map((p) => (
          <button key={p} type="button" onClick={() => setPair(p)} className={`rounded-md px-3 py-1.5 font-mono text-[12px] font-bold transition ${pair === p ? "bg-[#134e4a] text-[#4fd1c5]" : "bg-white/[0.04] text-[#8b93a7] hover:bg-white/[0.08]"}`}>
            {p}
          </button>
        ))}
        <span className="ml-auto font-mono text-[11px] text-[#5c6478]">validated {data.generatedAt.slice(0, 10)} · walk-forward + Monte Carlo + neighborhood + regime</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 min-[1700px]:grid-cols-3">
        {reports.map((r) => (
          <div key={`${r.strategy}-${r.timeframe}`} className={`rounded-xl border p-4 ${r.passed ? "border-[#34d399]/25 bg-[#0d1a16]/60" : "border-white/[0.07] bg-white/[0.02]"}`}>
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${r.passed ? "bg-[#34d399]/15 text-[#34d399]" : "bg-white/[0.06] text-[#8b93a7]"}`}>{r.passed ? "LIVE" : "REJECTED"}</span>
              <span className="text-[14px] font-bold text-[#e8eaf2]">{r.strategy}</span>
              <span className="font-mono text-[11px] text-[#5c6478]">{r.timeframe} · {r.dataStart} → {r.dataEnd}</span>
            </div>
            <Equity curve={r.oosMetrics.equityCurve} pass={r.passed} />
            <div className="grid grid-cols-4 gap-2 font-mono text-[11px]">
              {[
                ["OOS trades", String(r.oosMetrics.trades)],
                ["Profit factor", pf(r.oosMetrics.profitFactor)],
                ["Expectancy", `${r.oosMetrics.expectancyR.toFixed(3)}R`],
                ["Win rate", `${(r.oosMetrics.winRate * 100).toFixed(0)}%`],
                ["Max DD", `${r.oosMetrics.maxDrawdownR.toFixed(1)}R`],
                ["Loss streak", String(r.oosMetrics.maxLossStreak)],
                ["Avg hold", `${r.oosMetrics.avgBarsHeld.toFixed(0)} bars`],
                ["Net", `${r.oosMetrics.totalR.toFixed(1)}R`],
                ["MC dd p95", `${r.monteCarlo.ddP95}R`],
                ["MC P(profit)", `${(r.monteCarlo.pProfit * 100).toFixed(0)}%`],
                ["Neighborhood", `${(r.neighborhoodProfitable * 100).toFixed(0)}%`],
                ["Windows", String(r.walkForward.length)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-black/25 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-[#5c6478]">{k}</div>
                  <div className="text-[12px] font-bold text-[#c9cede]">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2 font-mono text-[10px] text-[#8b93a7]">
              <span>regime R —</span>
              <span>low {r.regimeR.low}</span>
              <span>mid {r.regimeR.mid}</span>
              <span>high {r.regimeR.high}</span>
              <span className="ml-auto">params {Object.entries(r.params).map(([k, v]) => `${k}=${v}`).join(" ")}</span>
            </div>
            {!!r.gateNotes.length && (
              <ul className="mt-2 space-y-0.5">
                {r.gateNotes.map((n) => (
                  <li key={n} className="text-[11px] text-[#d8b45a]">✕ {n}</li>
                ))}
              </ul>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-[#5c6478] hover:text-[#8b93a7]">walk-forward windows ({r.walkForward.length})</summary>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full font-mono text-[10.5px] text-[#8b93a7]">
                  <thead><tr className="text-left text-[#5c6478]"><th className="pr-3">test window</th><th className="pr-3">trades</th><th className="pr-3">net R</th><th>PF</th></tr></thead>
                  <tbody>
                    {r.walkForward.map((w) => (
                      <tr key={w.testStart}><td className="pr-3">{w.testStart} → {w.testEnd}</td><td className="pr-3">{w.oos.trades}</td><td className={`pr-3 ${w.oos.totalR >= 0 ? "text-[#34d399]" : "text-[#f87171]"}`}>{w.oos.totalR.toFixed(1)}</td><td>{pf(w.oos.profitFactor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
