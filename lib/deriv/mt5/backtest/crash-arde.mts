/**
 * Tests the ACTUAL deployed ARDE strategy on CRASH/BOOM — the key difference vs
 * forex/volatility: a Boom up-spike (or Crash down-spike) is a SINGLE TICK that
 * blows a stop far past its price, so a stop-out fills at the spike extreme, not
 * the stop. We model that pessimistic (realistic) fill and report net %, max
 * drawdown and the worst single trade. This shows why Crash/Boom is not a slow
 * bleed like forex — it's a catastrophic-blowup risk that busts the risk caps.
 *   npx tsx lib/deriv/mt5/backtest/crash-arde.mts <synthDir>
 */
import { evaluate } from "../strategy.ts";
import { PROFILES } from "../profiles.ts";
import { marketByWs } from "../markets.ts";
import type { Candle, Signal } from "../types.ts";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const SPREAD = { BOOM500: 0.4, BOOM1000: 1.05, CRASH500: 0.4, CRASH1000: 1.05 };
const WIN = 250, MAXBARS = 96;
const load = (s: string): number[][] | null => { const f = path.join(dir, s + ".json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).bars : null; };

function run(sym: string, pessimistic: boolean) {
  const bars = load(sym); if (!bars) return null;
  const m = marketByWs(sym)!; const spread = (SPREAD as any)[sym] ?? 0.5;
  const R: number[] = []; let pos: any = null, since = 0, bal = 10000, peak = 10000, dd = 0, worst = 0;
  for (let i = WIN; i < bars.length - 1; i++) {
    if (pos) {
      since++;
      const [, , h, l, c] = bars[i]; let exit = null;
      if (pos.side === "buy") {
        if (l <= pos.sl) exit = pessimistic ? l : pos.sl;   // stop fills at the (spiked) low
        else if (h >= pos.tp) exit = pos.tp;
      } else {
        if (h >= pos.sl) exit = pessimistic ? h : pos.sl;   // stop fills at the (spiked) high
        else if (l <= pos.tp) exit = pos.tp;
      }
      if (exit == null && since >= MAXBARS) exit = c;
      if (exit != null) { const rr = (pos.side === "buy" ? exit - pos.entry : pos.entry - exit) / pos.risk; R.push(rr); bal += rr * pos.riskAmt; if (bal > peak) peak = bal; const d = (peak - bal) / peak; if (d > dd) dd = d; if (rr < worst) worst = rr; pos = null; }
    }
    if (!pos) {
      const win: Candle[] = bars.slice(i - WIN, i).map((b) => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4] }));
      const out = evaluate(win, m, PROFILES.aggressive, bars[i][0]);
      if ((out as Signal).side) {
        const s = out as Signal; const fill = bars[i + 1][1];
        const eff = s.side === "buy" ? fill + spread : fill - spread; const risk = Math.abs(eff - s.stopLoss);
        if (risk > 0) { pos = { side: s.side, entry: eff, sl: s.stopLoss, tp: s.takeProfit, risk, riskAmt: bal * s.riskPct / 100 }; since = 0; }
      }
    }
  }
  const n = R.length; return { n, net: (bal - 10000) / 100, dd: dd * 100, worst, blown: bal <= 0 };
}

console.log(`\n=== DEPLOYED ARDE on CRASH/BOOM (aggressive, trend-only) — clean vs realistic spike fills ===\n`);
for (const sym of ["BOOM500", "BOOM1000", "CRASH500", "CRASH1000"]) {
  const clean = run(sym, false), real = run(sym, true);
  if (!clean || !real) { console.log(`${sym}: no data`); continue; }
  console.log(`${sym.padEnd(10)} CLEAN fills:  net ${clean.net.toFixed(0).padStart(6)}%  DD ${clean.dd.toFixed(0)}%  worst ${clean.worst.toFixed(1)}R  n=${clean.n}`);
  console.log(`${"".padEnd(10)} REAL  (spike-slippage) fills: net ${real.net.toFixed(0).padStart(6)}%  DD ${real.dd.toFixed(0)}%  worst ${real.worst.toFixed(1)}R  ${real.net <= -99 ? "← ACCOUNT BLOWN" : ""}`);
}
console.log(`\n(A "1.5%-risk" trade whose stop fills 4-5R past its level actually loses ~6-8% — spike slippage busts the per-trade AND daily caps.)`);
process.exit(0);
