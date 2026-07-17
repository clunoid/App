/**
 * DERIV MT5 BACKTEST — runner.
 *
 *   node lib/deriv/mt5/backtest/run.mjs <dataDir> <mode> [args]
 *
 * modes:
 *   baseline                — current production parameters, all 3 profiles
 *   variant <json>          — one config override (JSON string), all profiles
 *   window <from> <to> ...  — restrict epoch window
 */
import { loadBars, resample, runPortfolio } from "./sim.mjs";

const dataDir = process.argv[2];
const mode = process.argv[3] || "baseline";

// mirrors markets.ts FOREX (ws symbol, pip, cluster)
export const PAIRS = {
  frxEURUSD: { pip: 0.0001, cluster: "USD" },
  frxGBPUSD: { pip: 0.0001, cluster: "USD" },
  frxAUDUSD: { pip: 0.0001, cluster: "AUD-USD" },
  frxUSDCAD: { pip: 0.0001, cluster: "USD-CAD" },
  frxUSDCHF: { pip: 0.0001, cluster: "USD-CHF" },
  frxUSDJPY: { pip: 0.01, cluster: "JPY" },
  frxEURJPY: { pip: 0.01, cluster: "JPY" },
  frxGBPJPY: { pip: 0.01, cluster: "JPY" },
  frxAUDJPY: { pip: 0.01, cluster: "JPY" },
  frxEURGBP: { pip: 0.0001, cluster: "EUR-GBP" },
  frxEURAUD: { pip: 0.0001, cluster: "AUD" },
  frxEURCAD: { pip: 0.0001, cluster: "CAD" },
  frxEURCHF: { pip: 0.0001, cluster: "CHF" },
  frxGBPAUD: { pip: 0.0001, cluster: "AUD" },
  frxAUDCAD: { pip: 0.0001, cluster: "AUD" },
  frxAUDCHF: { pip: 0.0001, cluster: "CHF" },
  frxAUDNZD: { pip: 0.0001, cluster: "AUD-NZD" },
  frxEURNZD: { pip: 0.0001, cluster: "NZD" },
  frxGBPCAD: { pip: 0.0001, cluster: "CAD" },
  frxGBPCHF: { pip: 0.0001, cluster: "CHF" },
  frxGBPNZD: { pip: 0.0001, cluster: "NZD" },
  frxNZDUSD: { pip: 0.0001, cluster: "USD-NZD" },
  frxNZDJPY: { pip: 0.01, cluster: "JPY" },
};

// Deriv MT5 standard-account typical spreads (pips) — calibrate with sample-spreads.mjs
export const SPREADS = {
  frxEURUSD: 1.2, frxGBPUSD: 1.5, frxAUDUSD: 1.4, frxUSDCAD: 1.6, frxUSDCHF: 1.6,
  frxUSDJPY: 1.3, frxEURJPY: 1.9, frxGBPJPY: 2.6, frxAUDJPY: 1.9, frxEURGBP: 1.5,
  frxEURAUD: 2.6, frxEURCAD: 2.4, frxEURCHF: 2.0, frxGBPAUD: 3.4, frxAUDCAD: 2.0,
  frxAUDCHF: 1.9, frxAUDNZD: 2.4, frxEURNZD: 3.6, frxGBPCAD: 3.3, frxGBPCHF: 2.8,
  frxGBPNZD: 4.4, frxNZDUSD: 1.7, frxNZDJPY: 2.2,
};

// mirrors profiles.ts
export const PROFILES = {
  conservative: { adxGate: 30, riskPct: 0.4, trailMult: 3.0, minRR: 2.0, partials: [{ atR: 1, closePct: 50 }], maxAdds: 0, tradeTransitional: false, rsiLo: 30, rsiHi: 70, maxOpenRisk: 1, corrCap: 1, dailyLossPct: 2 },
  moderate: { adxGate: 25, riskPct: 0.75, trailMult: 2.5, minRR: 1.75, partials: [{ atR: 1, closePct: 33 }, { atR: 2, closePct: 33 }], maxAdds: 2, tradeTransitional: false, rsiLo: 30, rsiHi: 70, maxOpenRisk: 2.5, corrCap: 1.5, dailyLossPct: 3 },
  aggressive: { adxGate: 21, riskPct: 1.5, trailMult: 2.0, minRR: 1.2, partials: [{ atR: 1.5, closePct: 25 }], maxAdds: 4, tradeTransitional: true, rsiLo: 30, rsiHi: 70, maxOpenRisk: 5, corrCap: 2, dailyLossPct: 5 },
};

export function loadDatasets(tf, from, to) {
  const datasets = {};
  for (const sym of Object.keys(PAIRS)) {
    const bars = loadBars(dataDir, sym);
    if (!bars || bars.length < 5000) { console.error(`(skip ${sym}: no data)`); continue; }
    const rs = resample(bars, tf);
    datasets[sym] = rs.filter((b) => b[0] >= (from ?? 0) - 90 * 86400 && b[0] <= (to ?? Infinity)); // keep 90d warmup before window
  }
  return datasets;
}

export function baseCfg(tf, profile, from, to, over = {}) {
  return {
    tf,
    spreadPips: SPREADS,
    pip: Object.fromEntries(Object.entries(PAIRS).map(([s, v]) => [s, v.pip])),
    cluster: Object.fromEntries(Object.entries(PAIRS).map(([s, v]) => [s, v.cluster])),
    profile: { ...PROFILES[profile], ...(over.profile || {}) },
    sessionBlockUTC: over.sessionBlockUTC ?? null,
    rolloverSpreadMult: over.rolloverSpreadMult ?? 3,
    erFloor: over.erFloor ?? 0,
    volFloorP: over.volFloorP ?? 0,
    htfGate: over.htfGate ?? false,
    noTrail: over.noTrail ?? false,
    noPartials: over.noPartials ?? false,
    fadeTrend: over.fadeTrend ?? false,
    breakoutBufferAtr: over.breakoutBufferAtr ?? 0,
    costGate: over.costGate ?? 0.25,
    minRRnet: over.minRRnet ?? 0,
    htfTf: over.htfTf ?? 240,
    cooldownSec: 15 * 60,
    from: from ?? 0,
    to: to ?? Math.floor(Date.now() / 1000),
  };
}

export function report(tag, res) {
  const worst = Object.entries(res.bySym).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([s, v]) => `${s.replace("frx", "")}:${v}`).join(" ");
  const best = Object.entries(res.bySym).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, v]) => `${s.replace("frx", "")}:${v}`).join(" ");
  console.log(
    `${tag.padEnd(34)} net ${res.netPct.toFixed(1).padStart(7)}%  PF ${res.profitFactor.toFixed(2)}  win ${res.winRate.toFixed(1)}%  ` +
    `DD ${res.maxDDPct.toFixed(1)}%  trades ${String(res.trades).padStart(5)} (${res.tradesPerDay.toFixed(1)}/d)  avgR ${res.avgR.toFixed(3)}`,
  );
  console.log(`  worst: ${worst}\n  best:  ${best}  byKind: ${res.byKind.map((k) => `${k.kind}:${k.n}/${k.pnl}`).join(" ")}`);
}

if (mode === "baseline" || mode === "variant") {
  const over = mode === "variant" ? JSON.parse(process.argv[4] || "{}") : {};
  const from = over.from ?? Math.floor(Date.now() / 1000) - 3 * 365 * 86400;
  const to = over.to ?? Math.floor(Date.now() / 1000);
  const tf = over.tf ?? 5;
  const datasets = loadDatasets(tf, from, to);
  console.log(`symbols: ${Object.keys(datasets).length}, tf=M${tf}, window ${new Date(from * 1e3).toISOString().slice(0, 10)} → ${new Date(to * 1e3).toISOString().slice(0, 10)}`);
  for (const p of ["conservative", "moderate", "aggressive"]) {
    const cfg = baseCfg(tf, p, from, to, over);
    const t0 = Date.now();
    const res = runPortfolio(datasets, cfg);
    report(`${p} ${JSON.stringify(over).slice(0, 24)}`, res);
    console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}
