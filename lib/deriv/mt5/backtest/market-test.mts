/**
 * Tests the DEPLOYED ARDE strategy on a market: EDGE (zero-cost + with-cost
 * t-stat — is there anything to exploit?) and SAFETY (clean vs realistic
 * "pessimistic" stop fills — does a gap/spike blow the risk caps like Crash/Boom
 * did?). Enable a market only if it's SAFE (worst-trade not catastrophic);
 * profitability is a bonus we don't expect on efficient/synthetic markets.
 *   npx tsx lib/deriv/mt5/backtest/market-test.mts
 */
import { evaluate } from "../strategy.ts";
import { PROFILES } from "../profiles.ts";
import { marketByWs } from "../markets.ts";
import type { Candle, Signal } from "../types.ts";
import fs from "node:fs";
import path from "node:path";

const SCRATCH = "C:/Users/ADMINI~1/AppData/Local/Temp/claude/C--Users-Administrator-clunoid-App/fccfb3cd-3264-4e72-8c66-2139c11d8c0f/scratchpad";
const DIRS = [path.join(SCRATCH, "synth5"), path.join(SCRATCH, "extra5")];
const WIN = 250, MAXBARS = 96;

// per-symbol realistic spread (price units) — Deriv retail estimates
const TARGETS = [
  { sym: "stpRNG", label: "Step Index", spread: 0.1 },
  { sym: "frxXAUUSD", label: "Gold (XAU/USD)", spread: 0.30 },
  { sym: "frxXAGUSD", label: "Silver (XAG/USD)", spread: 0.03 },
  { sym: "cryBTCUSD", label: "BTC/USD", spread: 40 },
  { sym: "cryETHUSD", label: "ETH/USD", spread: 4 },
];

function load(sym: string): number[][] | null {
  for (const d of DIRS) { const f = path.join(d, sym + ".json"); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).bars; }
  return null;
}
const stat = (R: number[]) => { const n = R.length; if (!n) return { n: 0, exp: 0, t: 0, pf: 0 }; const m = R.reduce((s, x) => s + x, 0) / n; const sd = Math.sqrt(R.reduce((s, x) => s + (x - m) ** 2, 0) / n); const gw = R.filter((x) => x > 0).reduce((s, x) => s + x, 0), gl = -R.filter((x) => x <= 0).reduce((s, x) => s + x, 0); return { n, exp: m, t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0, pf: gl > 0 ? gw / gl : 9 }; };

function run(sym: string, spread: number, pessimistic: boolean) {
  const bars = load(sym); if (!bars) return null;
  const m = marketByWs(sym); if (!m) return null;
  const R: number[] = []; let pos: any = null, since = 0, bal = 10000, peak = 10000, dd = 0, worst = 0;
  for (let i = WIN; i < bars.length - 1; i++) {
    if (pos) {
      since++;
      const [, , h, l, c] = bars[i]; let exit = null;
      if (pos.side === "buy") { if (l <= pos.sl) exit = pessimistic ? l : pos.sl; else if (h >= pos.tp) exit = pos.tp; }
      else { if (h >= pos.sl) exit = pessimistic ? h : pos.sl; else if (l <= pos.tp) exit = pos.tp; }
      if (exit == null && since >= MAXBARS) exit = c;
      if (exit != null) { const rr = (pos.side === "buy" ? exit - pos.entry : pos.entry - exit) / pos.risk; R.push(rr); bal += rr * pos.riskAmt; if (bal > peak) peak = bal; const d = (peak - bal) / peak; if (d > dd) dd = d; if (rr < worst) worst = rr; pos = null; if (bal <= 0) break; }
    }
    if (!pos) {
      const win: Candle[] = bars.slice(i - WIN, i).map((b) => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4] }));
      const out = evaluate(win, m, PROFILES.aggressive, bars[i][0]);
      if ((out as Signal).side) { const s = out as Signal; const fill = bars[i + 1][1]; const eff = s.side === "buy" ? fill + spread : fill - spread; const risk = Math.abs(eff - s.stopLoss); if (risk > 0) { pos = { side: s.side, entry: eff, sl: s.stopLoss, tp: s.takeProfit, risk, riskAmt: bal * s.riskPct / 100 }; since = 0; } }
    }
  }
  const st = stat(R);
  return { ...st, net: (bal - 10000) / 100, dd: dd * 100, worst };
}

const eflag = (t: number, n: number) => !n ? "no data" : t > 2 ? "✓ EDGE" : t < -2 ? "✗ neg" : "· noise";
console.log(`\n=== DEPLOYED ARDE on STEP / METALS / CRYPTO — edge + safety ===\n`);
for (const { sym, label, spread } of TARGETS) {
  const z = run(sym, 0, false), c = run(sym, spread, false), real = run(sym, spread, true);
  if (!z || !c || !real) { console.log(`${label.padEnd(16)} — no data yet`); continue; }
  const safe = real.worst > -6 && real.net > -95; // not catastrophic like Crash/Boom (-100R+, blown)
  console.log(`${label.padEnd(16)} n=${c.n}`);
  console.log(`   EDGE   zero-cost t=${z.t.toFixed(2).padStart(6)} ${eflag(z.t, z.n).padEnd(7)} | w/cost t=${c.t.toFixed(2).padStart(6)} PF ${c.pf.toFixed(2)} ${eflag(c.t, c.n)}`);
  console.log(`   SAFETY clean net ${c.net.toFixed(0)}% DD ${c.dd.toFixed(0)}% worst ${c.worst.toFixed(1)}R | realistic net ${real.net.toFixed(0)}% DD ${real.dd.toFixed(0)}% worst ${real.worst.toFixed(1)}R  → ${safe ? "SAFE to enable" : "✗ CATASTROPHIC — do not enable"}`);
}
console.log(`\n(SAFE = realistic worst-trade > -6R and account not blown. Profit not expected — efficient/synthetic markets.)`);
process.exit(0);
