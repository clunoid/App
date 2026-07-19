/**
 * Tests the ACTUAL deployed ARDE strategy (strategy.ts, aggressive/continuous)
 * on Volatility-index candles — zero-cost (martingale proof) and with realistic
 * spread. If zero-cost t is not >2, no process can be profitable (it's the
 * random-walk underlying, not the strategy).
 *   npx tsx lib/deriv/mt5/backtest/vol-arde.mts <synthDir>
 */
import { evaluate } from "../strategy.ts";
import { PROFILES } from "../profiles.ts";
import { marketByWs } from "../markets.ts";
import type { Candle, Signal } from "../types.ts";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const SPREAD = { R_10: 0.003, R_25: 0.006, R_50: 0.012, R_75: 0.02, R_100: 0.05, "1HZ25V": 0.06, "1HZ75V": 0.15, "1HZ100V": 0.2 };
const WIN = 250, MAXBARS = 96;
const load = (sym: string): number[][] | null => { const f = path.join(dir, sym + ".json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).bars : null; };
const stat = (R: number[]) => { const n = R.length; if (!n) return { n: 0, exp: 0, t: 0, pf: 0 }; const m = R.reduce((s, x) => s + x, 0) / n; const sd = Math.sqrt(R.reduce((s, x) => s + (x - m) ** 2, 0) / n); const gw = R.filter((x) => x > 0).reduce((s, x) => s + x, 0), gl = -R.filter((x) => x <= 0).reduce((s, x) => s + x, 0); return { n, exp: m, t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0, pf: gl > 0 ? gw / gl : 9 }; };

function run(sym: string, spread: number) {
  const bars = load(sym); if (!bars) return { n: 0, exp: 0, t: 0, pf: 0 };
  const m = marketByWs(sym)!;
  const R: number[] = []; let pos: any = null, since = 0;
  for (let i = WIN; i < bars.length - 1; i++) {
    if (pos) {
      since++;
      const [, , h, l, c] = bars[i]; let exit = null;
      const hitSL = pos.side === "buy" ? l <= pos.sl : h >= pos.sl;
      const hitTP = pos.side === "buy" ? h >= pos.tp : l <= pos.tp;
      if (hitSL) exit = pos.sl; else if (hitTP) exit = pos.tp; else if (since >= MAXBARS) exit = c;
      if (exit != null) { R.push((pos.side === "buy" ? exit - pos.entry : pos.entry - exit) / pos.risk); pos = null; }
    }
    if (!pos) {
      const win: Candle[] = bars.slice(i - WIN, i).map((b) => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4] }));
      const out = evaluate(win, m, PROFILES.aggressive, bars[i][0]);
      if ((out as Signal).side) {
        const s = out as Signal; const fill = bars[i + 1][1];
        const eff = s.side === "buy" ? fill + spread : fill - spread; const risk = Math.abs(eff - s.stopLoss);
        if (risk > 0) { pos = { side: s.side, entry: eff, sl: s.stopLoss, tp: s.takeProfit, risk }; since = 0; }
      }
    }
  }
  return stat(R);
}

const flag = (t: number, n: number) => !n ? "no data" : t > 2 ? "✓ EDGE" : t < -2 ? "✗ neg" : "· noise";
console.log(`\n=== DEPLOYED ARDE strategy on VOLATILITY indices (aggressive/continuous) ===\n`);
for (const sym of ["R_25", "R_50", "R_75", "R_100", "1HZ75V", "1HZ100V"]) {
  const z = run(sym, 0), c = run(sym, (SPREAD as any)[sym] ?? 0.02);
  console.log(`  ${sym.padEnd(9)} ZERO-cost: exp ${z.exp.toFixed(4)} t=${z.t.toFixed(2).padStart(6)} ${flag(z.t, z.n).padEnd(7)} | w/spread: exp ${c.exp.toFixed(4)} t=${c.t.toFixed(2).padStart(6)} PF ${c.pf.toFixed(2)} ${flag(c.t, c.n)}  (n=${c.n})`);
}
console.log(`\n(ZERO-cost t≈0 ⇒ the random-walk underlying has no structure any strategy can exploit — martingale.)`);
process.exit(0);
