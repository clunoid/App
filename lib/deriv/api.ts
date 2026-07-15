"use client";

/**
 * DERIV NEW REST API client (browser).
 *
 * The new Deriv API (api.derivws.com/trading/v1/…) reads account data with an
 * `ory_at_…` OAuth access token as Bearer + the app id in a `Deriv-App-ID` header.
 * It's CORS-open to us, so the browser calls it directly — no WebSocket, no
 * legacy a1- tokens, no numeric app_id. Scopes: trade → options accounts,
 * payment → wallets, account_manage → profile name.
 *
 * Verified live against Deriv 2026-07-15 + the official OpenAPI 3.1 spec
 * (deriv-com/deriv-api-schemas, rest-api-openapi.json).
 */
import { DERIV_CLIENT_ID } from "./config";
import type { ConnectedAccount } from "@/lib/trading/accounts";
import type { DerivPortfolio } from "./client";

const REST_BASE = "https://api.derivws.com";

async function get(path: string, accessToken: string): Promise<unknown> {
  const res = await fetch(`${REST_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Deriv-App-ID": DERIV_CLIENT_ID,
    },
  });
  if (res.status === 401) {
    throw new Error("Your Deriv session expired — please reconnect.");
  }
  const json = (await res.json().catch(() => null)) as
    | { data?: unknown; errors?: Array<{ message?: string; code?: string }>; message?: string; error?: string }
    | null;
  if (!res.ok) {
    const msg =
      json?.errors?.[0]?.message ||
      json?.message ||
      json?.error ||
      `Deriv API error (${res.status})`;
    const e = new Error(String(msg));
    (e as Error & { status?: number }).status = res.status;
    throw e;
  }
  return json?.data;
}

type OptionsAcct = { account_id?: string; balance?: number; currency?: string; group?: string; status?: string; account_type?: string };
type WalletAcct = {
  wallet_id?: string;
  type?: string;
  balances?: Record<string, unknown>;
  total_balance?: { converted_to?: string; approximate_total_balance?: string };
};

// Deriv demo/virtual accounts: options report account_type "demo"; ids are VR*
// (VRTC options, VRW wallet). Real ids are CR/MF/… and account_type "real".
const isDemo = (...s: (string | undefined)[]) =>
  s.some((v) => v && (/demo|virtual/i.test(v) || /^vr/i.test(v)));

const numOr = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null;

/**
 * Pull the full portfolio via the new REST API. `trade` scope is required (options
 * accounts); wallets/name are best-effort so a missing scope never breaks the load.
 */
export async function fetchDerivPortfolioREST(accessToken: string): Promise<DerivPortfolio> {
  const [optsR, walletsR, nickR] = await Promise.allSettled([
    get("/trading/v1/options/accounts", accessToken),
    get("/wallet/v1/wallets", accessToken),
    get("/account/v1/nickname", accessToken),
  ]);

  // Options accounts are the backbone — if that call failed hard, surface it.
  if (optsR.status === "rejected") throw optsR.reason;

  const accounts: ConnectedAccount[] = [];

  const opts = (Array.isArray(optsR.value) ? optsR.value : []) as OptionsAcct[];
  for (const a of opts) {
    const loginid = String(a.account_id || "");
    if (!loginid) continue;
    accounts.push({
      platformId: "deriv-options",
      broker: "Deriv",
      platform: "Options",
      loginid,
      currency: String(a.currency || ""),
      balance: numOr(a.balance),
      kind: "options",
      isVirtual: isDemo(a.account_type, a.group, a.status, loginid),
    });
  }

  if (walletsR.status === "fulfilled") {
    const wallets = (Array.isArray(walletsR.value) ? walletsR.value : []) as WalletAcct[];
    for (const w of wallets) {
      const loginid = String(w.wallet_id || "");
      if (!loginid) continue;
      const tb = w.total_balance || {};
      accounts.push({
        platformId: "deriv-wallet",
        broker: "Deriv",
        platform: "Wallet",
        loginid,
        currency: String(tb.converted_to || ""),
        balance: numOr(tb.approximate_total_balance),
        kind: "wallet",
        isVirtual: isDemo(w.type, loginid),
      });
    }
  }

  // Aggregate a real-money total. Deriv's new API returns per-account balances in
  // possibly different currencies, so we sum by currency and surface the largest
  // bucket as the headline figure (per-account balances are always shown too).
  const realByCur = new Map<string, number>();
  const demoByCur = new Map<string, number>();
  for (const a of accounts) {
    if (a.balance == null) continue;
    const bucket = a.isVirtual ? demoByCur : realByCur;
    bucket.set(a.currency, (bucket.get(a.currency) ?? 0) + a.balance);
  }
  const top = (m: Map<string, number>): [number | null, string] => {
    let bestCur = "", best = -Infinity;
    for (const [cur, amt] of m) if (amt > best) { best = amt; bestCur = cur; }
    return m.size ? [m.get(bestCur) ?? 0, bestCur] : [null, ""];
  };
  const [totalReal, totalCurrency] = top(realByCur);
  const [totalDemo] = top(demoByCur);

  let name = "";
  if (nickR.status === "fulfilled" && nickR.value && typeof nickR.value === "object") {
    name = String((nickR.value as { nickname?: string }).nickname || "");
  }
  if (!name) name = accounts[0]?.loginid || "";

  return { name, email: "", accounts, totalReal, totalDemo, totalCurrency };
}
