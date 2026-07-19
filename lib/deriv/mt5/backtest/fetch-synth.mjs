/**
 * DERIV MT5 BACKTEST — SYNTHETIC index data fetcher.
 *
 * Pages candles for Deriv's generated synthetic indices (Volatility / Crash-Boom
 * / Step) from the same `ticks_history` WS. Synthetics are 24/7 with no swap and
 * no weekend gaps, so they need their own harness treatment.
 *
 *   node lib/deriv/mt5/backtest/fetch-synth.mjs <outDir> [granularitySec]
 *
 * Output: <outDir>/<WS_SYMBOL>.json = { symbol, granularity, bars: [[t,o,h,l,c]] }
 */
import WebSocket from "ws";
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const GRAN = Number(process.argv[3] || 300); // 60=M1, 300=M5
if (!OUT) { console.error("usage: node fetch-synth.mjs <outDir> [granularitySec]"); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const PAGE = 5000;
const MIN_ACCEPT = 3000;

// Volatility (GBM, constant vol), Crash/Boom (asymmetric spikes), Step (symmetric RW).
const SYMBOLS = [
  "R_10", "R_25", "R_50", "R_75", "R_100",
  "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V",
  "BOOM500", "BOOM1000", "CRASH500", "CRASH1000",
  "stpRNG",
];

const now = Math.floor(Date.now() / 1000);

function openSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}
function request(ws, payload, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);
    const onMsg = (buf) => { let d; try { d = JSON.parse(buf.toString()); } catch { return; } if (d.req_id !== payload.req_id) return; cleanup(); resolve(d); };
    const cleanup = () => { clearTimeout(timer); ws.off("message", onMsg); };
    ws.on("message", onMsg);
    ws.send(JSON.stringify(payload));
  });
}

let reqId = 1;
async function fetchSymbol(ws, sym) {
  const file = path.join(OUT, `${sym}.json`);
  if (fs.existsSync(file)) {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    if (j.bars?.length >= MIN_ACCEPT && j.complete) { console.log(`${sym}: cached (${j.bars.length} bars)`); return; }
  }
  const bars = new Map();
  let end = now, pages = 0, retries = 0;
  for (;;) {
    const d = await request(ws, { ticks_history: sym, style: "candles", granularity: GRAN, count: PAGE, end, req_id: reqId++ });
    if (!d || d.error) { if (retries++ < 5) { await new Promise((r) => setTimeout(r, 4000 * retries)); continue; } console.log(`${sym}: page error ${d?.error?.code || "timeout"} (gave up)`); break; }
    retries = 0;
    const cs = d.candles || [];
    if (!cs.length) break;
    for (const c of cs) bars.set(c.epoch, [c.epoch, +c.open, +c.high, +c.low, +c.close]);
    pages++;
    if (pages % 10 === 0) console.log(`${sym}: page ${pages}, back to ${new Date(cs[0].epoch * 1000).toISOString().slice(0, 10)}`);
    const earliest = cs[0].epoch;
    if (cs.length < 10) break;
    if (earliest >= end) break;
    end = earliest - 1;
  }
  const sorted = [...bars.values()].sort((a, b) => a[0] - b[0]);
  fs.writeFileSync(file, JSON.stringify({ symbol: sym, granularity: GRAN, complete: true, bars: sorted }));
  const from = sorted.length ? new Date(sorted[0][0] * 1000).toISOString().slice(0, 10) : "-";
  console.log(`${sym}: ${sorted.length} bars from ${from} (${pages} pages)`);
}

const CONCURRENCY = 3;
const queue = [...SYMBOLS];
async function worker() {
  const ws = await openSocket();
  for (;;) { const sym = queue.shift(); if (!sym) break; try { await fetchSymbol(ws, sym); } catch (e) { console.log(`${sym}: FAILED ${e.message}`); } }
  try { ws.close(); } catch {}
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
console.log("DONE");
