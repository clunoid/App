"use client";

/**
 * The user's Binance API key pair lives ONLY in their browser (localStorage) —
 * the same custody-free stance as the Deriv connection. We never store it on a
 * server; it is sent to our own signing route per request and discarded there.
 */

export type BinanceKeys = { apiKey: string; apiSecret: string };

const KEY = "clunoid_binance_keys";

export function saveBinanceKeys(k: BinanceKeys): void {
  try { localStorage.setItem(KEY, JSON.stringify(k)); } catch { /* storage disabled */ }
}

export function loadBinanceKeys(): BinanceKeys | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const k = JSON.parse(raw) as BinanceKeys;
    return k?.apiKey && k?.apiSecret ? k : null;
  } catch {
    return null;
  }
}

export function clearBinanceKeys(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
