/**
 * DERIV MT5 BACKTEST — historical data fetcher.
 *
 * Pages multi-year M5 candles for the whole forex basket from Deriv's own
 * WebSocket (`ticks_history`, style=candles, granularity=300) and caches them to
 * disk as compact JSON. Run from the repo root:
 *
 *   node lib/deriv/mt5/backtest/fetch-data.mjs <outDir> [years]
 *
 * Output: <outDir>/<WS_SYMBOL>.json = { symbol, granularity, bars: [[t,o,h,l,c], ...] }
 */
import WebSocket from "ws";
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const YEARS = Number(process.argv[3] || 3);
const GRAN = Number(process.argv[4] || 300); // seconds per candle (300=M5, 900=M15, 3600=H1)
if (!OUT) { console.error("usage: node fetch-data.mjs <outDir> [years] [granularitySec]"); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const PAGE = 5000;
const MIN_ACCEPT = 3000; // refetch any cached file smaller than this

// The 23 forex pairs the engine trades (ws symbols, mirror of markets.ts FOREX).
const SYMBOLS = [
  "frxEURUSD","frxGBPUSD","frxAUDUSD","frxUSDCAD","frxUSDCHF","frxUSDJPY",
  "frxEURJPY","frxGBPJPY","frxAUDJPY","frxEURGBP","frxEURAUD","frxEURCAD",
  "frxEURCHF","frxGBPAUD","frxAUDCAD","frxAUDCHF","frxAUDNZD","frxEURNZD",
  "frxGBPCAD","frxGBPCHF","frxGBPNZD","frxNZDUSD","frxNZDJPY",
];

const now = Math.floor(Date.now() / 1000);
const START = now - Math.floor(YEARS * 365.25 * 86400);

function openSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

/** One request/response on a shared socket (serialized per socket). */
function request(ws, payload, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);
    const onMsg = (buf) => {
      let d; try { d = JSON.parse(buf.toString()); } catch { return; }
      if (d.req_id !== payload.req_id) return;
      cleanup(); resolve(d);
    };
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
  const bars = new Map(); // epoch -> [t,o,h,l,c]
  let end = now;
  let pages = 0;
  let retries = 0;
  for (;;) {
    const d = await request(ws, {
      ticks_history: sym, style: "candles", granularity: GRAN,
      count: PAGE, end, req_id: reqId++,
    });
    if (!d || d.error) {
      // rate limit / transient — back off and retry the same page
      if (retries++ < 5) { await new Promise((r) => setTimeout(r, 4000 * retries)); continue; }
      console.log(`${sym}: page error ${d?.error?.code || "timeout"} @end=${end} (gave up)`);
      break;
    }
    retries = 0;
    const cs = d.candles || [];
    if (!cs.length) break;
    for (const c of cs) bars.set(c.epoch, [c.epoch, +c.open, +c.high, +c.low, +c.close]);
    pages++;
    if (pages % 10 === 0) console.log(`${sym}: page ${pages}, back to ${new Date(cs[0].epoch * 1000).toISOString().slice(0, 10)}`);
    const earliest = cs[0].epoch;
    if (earliest <= START || cs.length < 10) break; // reached target depth or history exhausted
    if (earliest >= end) break; // no progress safeguard
    end = earliest - 1;
  }
  const sorted = [...bars.values()].sort((a, b) => a[0] - b[0]).filter((b) => b[0] >= START);
  fs.writeFileSync(file, JSON.stringify({ symbol: sym, granularity: GRAN, complete: true, bars: sorted }));
  const from = sorted.length ? new Date(sorted[0][0] * 1000).toISOString().slice(0, 10) : "-";
  console.log(`${sym}: ${sorted.length} bars from ${from} (${pages} pages)`);
}

const CONCURRENCY = 3; // sockets
const queue = [...SYMBOLS];
async function worker(id) {
  const ws = await openSocket();
  for (;;) {
    const sym = queue.shift();
    if (!sym) break;
    try { await fetchSymbol(ws, sym); }
    catch (e) { console.log(`${sym}: FAILED ${e.message}`); }
  }
  try { ws.close(); } catch {}
}

await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
console.log("DONE");
