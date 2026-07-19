"use client";

/**
 * Browser-side Binance client. Signed Binance calls can't be made from the browser
 * (CORS), so this posts the user's key pair to our own signing route, which signs,
 * calls Binance, and returns normalised balances. Nothing is persisted server-side.
 */
import type { BinanceKeys } from "./keys";

export type BinanceAsset = {
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdt: number | null; // approximate USDT value (null when no price route found)
};

export type BinancePortfolio = {
  totalUsdt: number | null;
  assets: BinanceAsset[];
  canTrade: boolean;
  accountType: string;
};

export async function fetchBinancePortfolio(keys: BinanceKeys): Promise<BinancePortfolio> {
  const res = await fetch("/api/binance/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(keys),
  });
  const json = (await res.json().catch(() => null)) as (BinancePortfolio & { error?: string }) | null;
  if (!res.ok || !json || json.error) {
    throw new Error(json?.error || "Couldn't load your Binance balances.");
  }
  return json;
}
