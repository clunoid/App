"use client";

/**
 * DERIV OAuth — the browser side. Deriv redirects back to /trading/command with
 * one set of `acctN/tokenN/curN` params per account the user authorised. We
 * parse them, keep them in localStorage (this is the user's own browser holding
 * their own Deriv tokens — the standard model for a client-side Deriv app, same
 * as Deriv's own SmartTrader/DBot), and clean the URL.
 */

export type DerivToken = { loginid: string; token: string; currency: string };

const KEY = "clunoid_deriv_tokens";

/** Pull acct/token/cur triples out of an OAuth redirect query string. */
export function parseDerivRedirect(search: string): DerivToken[] {
  const p = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const out: DerivToken[] = [];
  for (let i = 1; i < 30; i++) {
    const loginid = p.get(`acct${i}`);
    const token = p.get(`token${i}`);
    if (!loginid || !token) break;
    out.push({ loginid, token, currency: p.get(`cur${i}`) || "" });
  }
  return out;
}

export function saveDerivTokens(tokens: DerivToken[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tokens));
  } catch {
    /* storage disabled — the session stays connected in-memory only */
  }
}

export function loadDerivTokens(): DerivToken[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DerivToken[]) : [];
  } catch {
    return [];
  }
}

export function clearDerivTokens(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** True if a Deriv OAuth redirect just landed (query has acct1/token1). */
export function isDerivRedirect(search: string): boolean {
  const p = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return !!(p.get("acct1") && p.get("token1"));
}
