import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { BINANCE_API_BASE } from "@/lib/binance/config";

/**
 * Binance account balances — server-side signing proxy.
 *
 * Binance requires HMAC-SHA256-signed requests and blocks them from browsers (CORS),
 * so the browser posts the user's key pair here; we sign, call Binance, normalise the
 * balances (valued in USDT via public prices) and return them. We do NOT store the
 * key or secret — it exists only for the duration of this request.
 *
 * A READ-ONLY key is all this needs (and all we ask users for): it cannot trade or
 * withdraw, and its permission does not expire the way trading permission does.
 */
export const runtime = "nodejs";
/**
 * IMPORTANT: Binance.com geo-blocks some regions (notably the US) — a call from a
 * US-hosted function returns "Service unavailable from a restricted location".
 * Vercel defaults to a US region, so this route is pinned to Frankfurt.
 */
export const preferredRegion = "fra1";

type BinanceBalance = { asset: string; free: string; locked: string };
type BinanceAccount = { balances?: BinanceBalance[]; canTrade?: boolean; accountType?: string; msg?: string; code?: number };
type TickerPrice = { symbol: string; price: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { apiKey?: string; apiSecret?: string };
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const apiSecret = typeof body.apiSecret === "string" ? body.apiSecret.trim() : "";
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Enter both your Binance API key and secret." }, { status: 400 });
    }

    // Signed account snapshot.
    const query = `timestamp=${Date.now()}&recvWindow=10000`;
    const signature = crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
    const res = await fetch(`${BINANCE_API_BASE}/api/v3/account?${query}&signature=${signature}`, {
      headers: { "X-MBX-APIKEY": apiKey },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as BinanceAccount | null;

    if (!res.ok || !data || !Array.isArray(data.balances)) {
      // Binance geo-blocks some hosting regions. That's OUR server's location, not
      // the user's account — say so plainly instead of leaking a confusing terms link.
      const restricted = /restricted location|Eligibility/i.test(data?.msg || "");
      const msg = restricted
        ? "Binance is blocking our server's region — this is on our side, not your account or your key. We're sorting it out."
        : data?.msg
          ? `Binance: ${data.msg}`
          : res.status === 401
            ? "Binance rejected those credentials — check the key and secret."
            : `Binance rejected the request (${res.status}).`;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Public prices for an approximate USDT valuation.
    const prices = new Map<string, number>();
    try {
      const p = await fetch(`${BINANCE_API_BASE}/api/v3/ticker/price`, { cache: "no-store" });
      if (p.ok) {
        for (const t of ((await p.json()) as TickerPrice[]) ?? []) {
          const v = Number(t.price);
          if (Number.isFinite(v)) prices.set(t.symbol, v);
        }
      }
    } catch { /* valuation is best-effort */ }

    const btcUsdt = prices.get("BTCUSDT");
    const valueOf = (asset: string, total: number): number | null => {
      if (asset === "USDT") return total;
      const direct = prices.get(`${asset}USDT`);
      if (direct) return total * direct;
      const viaBtc = prices.get(`${asset}BTC`);
      if (viaBtc && btcUsdt) return total * viaBtc * btcUsdt;
      return null;
    };

    const assets = data.balances
      .map((b) => {
        const free = Number(b.free) || 0;
        const locked = Number(b.locked) || 0;
        const total = free + locked;
        return { asset: b.asset, free, locked, total, usdt: total > 0 ? valueOf(b.asset, total) : 0 };
      })
      .filter((a) => a.total > 0)
      .sort((a, b) => (b.usdt ?? 0) - (a.usdt ?? 0));

    const totalUsdt = assets.reduce((sum, a) => sum + (a.usdt ?? 0), 0);

    return NextResponse.json({
      totalUsdt,
      assets: assets.slice(0, 25),
      canTrade: !!data.canTrade,
      accountType: data.accountType || "SPOT",
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Binance. Please try again." }, { status: 500 });
  }
}
