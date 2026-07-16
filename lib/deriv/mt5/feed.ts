/**
 * DERIV MT5 — server-side market-data feed.
 *
 * Pulls OHLC candles from Deriv's public WebSocket (no auth needed for market
 * data). One connection fans out N `ticks_history` requests (by req_id) and
 * collects the candle responses — efficient enough to compute signals for the
 * whole forex basket in one round-trip. Runs in the Node runtime (uses the `ws`
 * package, not the browser WebSocket).
 */
import WebSocket from "ws";
import type { Candle } from "./types";

const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";

type Raw = { epoch: number; open: string | number; high: string | number; low: string | number; close: string | number };
const toCandle = (c: Raw): Candle => ({ t: c.epoch, o: +c.open, h: +c.high, l: +c.low, c: +c.close });

/**
 * Fetch candles for many symbols over a single socket.
 * @param symbols Deriv WS symbols (e.g. ["frxEURUSD", ...])
 * @param granularity seconds per candle (300 = M5)
 * @param count bars per symbol
 */
export function fetchCandlesBatch(
  symbols: string[],
  granularity = 300,
  count = 250,
  timeoutMs = 15000,
): Promise<Map<string, Candle[]>> {
  return new Promise((resolve) => {
    const out = new Map<string, Candle[]>();
    if (!symbols.length) return resolve(out);

    const ws = new WebSocket(WS_URL);
    const idToSymbol = new Map<number, string>();
    let pending = symbols.length;

    const done = () => {
      try { ws.close(); } catch { /* ignore */ }
      resolve(out);
    };
    const timer = setTimeout(() => { try { ws.terminate(); } catch { /* ignore */ } resolve(out); }, timeoutMs);

    ws.on("open", () => {
      symbols.forEach((sym, i) => {
        const req_id = i + 1;
        idToSymbol.set(req_id, sym);
        ws.send(JSON.stringify({ ticks_history: sym, end: "latest", count, style: "candles", granularity, req_id }));
      });
    });

    ws.on("message", (buf: WebSocket.RawData) => {
      let d: { msg_type?: string; req_id?: number; candles?: Raw[]; error?: { message?: string } };
      try { d = JSON.parse(buf.toString()); } catch { return; }
      const sym = d.req_id != null ? idToSymbol.get(d.req_id) : undefined;
      if (d.msg_type === "candles" || d.error) {
        if (sym) out.set(sym, d.error ? [] : (d.candles || []).map(toCandle));
        pending--;
        if (pending <= 0) { clearTimeout(timer); done(); }
      }
    });

    ws.on("error", () => { clearTimeout(timer); resolve(out); });
  });
}
