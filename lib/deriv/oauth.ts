"use client";

import {
  DERIV_AUTH_BASE,
  DERIV_CLIENT_ID,
  DERIV_IS_NUMERIC_APP,
  DERIV_OAUTH_BASE,
  DERIV_REDIRECT_URI,
} from "./config";

/**
 * DERIV OAuth — the browser side.
 *
 * NEW OIDC flow (Deriv's Ory stack): we send the user to auth.deriv.com with a
 * PKCE challenge, they log in + consent, Deriv returns an authorization `code`,
 * and the browser exchanges it (no secret) for the a1-… account tokens the
 * WebSocket understands. Everything stays in the user's browser (localStorage) —
 * the standard model for a client-side Deriv app, same as Deriv's own DBot.
 *
 * The older flat `acctN/tokenN/curN` redirect is still parsed for the paste path
 * and for any app configured with the legacy redirect.
 */

export type DerivToken = { loginid: string; token: string; currency: string };

const KEY = "clunoid_deriv_tokens";
const PKCE_KEY = "clunoid_deriv_pkce";

// The PKCE verifier is stashed in a cookie scoped to the registrable domain
// (.clunoid.com) so it survives a www ↔ non-www hop between the start of login and
// the callback (per-origin sessionStorage would not). sessionStorage is kept as a
// same-origin fallback.
function parentDomain(): string {
  const h = window.location.hostname;
  const parts = h.split(".");
  return parts.length >= 2 ? "." + parts.slice(-2).join(".") : h;
}

function stashPkce(v: { verifier: string; state: string }): void {
  const json = JSON.stringify(v);
  try { sessionStorage.setItem(PKCE_KEY, json); } catch { /* ignore */ }
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${PKCE_KEY}=${encodeURIComponent(json)}; domain=${parentDomain()}; path=/; max-age=600; SameSite=Lax${secure}`;
  } catch { /* ignore */ }
}

function readPkce(): { verifier?: string; state?: string } {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${PKCE_KEY}=([^;]*)`));
    if (m) return JSON.parse(decodeURIComponent(m[1]));
  } catch { /* fall through */ }
  try {
    return JSON.parse(sessionStorage.getItem(PKCE_KEY) || "{}");
  } catch {
    return {};
  }
}

function clearPkce(): void {
  try { sessionStorage.removeItem(PKCE_KEY); } catch { /* ignore */ }
  try {
    document.cookie = `${PKCE_KEY}=; domain=${parentDomain()}; path=/; max-age=0; SameSite=Lax`;
  } catch { /* ignore */ }
}

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

// ── NEW OIDC / PKCE flow ────────────────────────────────────────────────────

/** True if an OIDC authorization-code redirect just landed (?code&state). */
export function isDerivCodeReturn(search: string): boolean {
  const p = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return !!(p.get("code") && p.get("state"));
}

const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const randomString = (len = 32): string => {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
};

async function challengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(digest);
}

/**
 * Kick off the Deriv OIDC login: mint a PKCE verifier + state, stash them so the
 * callback can finish the exchange, and redirect the browser to Deriv. Note we
 * send NO scope param — this client isn't allowed to request one.
 */
export async function startDerivLogin(): Promise<void> {
  // Classic numeric app_id → the simple single-host flow. Deriv redirects straight
  // back to the app's registered URL with ?acct1&token1&cur1 (parsed on return by
  // isDerivRedirect/parseDerivRedirect). No PKCE, no server exchange, no cross-host.
  if (DERIV_IS_NUMERIC_APP) {
    const q = new URLSearchParams({ app_id: DERIV_CLIENT_ID, l: "EN", brand: "deriv" });
    window.location.href = `${DERIV_OAUTH_BASE}/oauth2/authorize?${q.toString()}`;
    return;
  }

  // OIDC client_id → the Ory PKCE flow on auth.deriv.com.
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = await challengeFromVerifier(verifier);
  stashPkce({ verifier, state });
  const q = new URLSearchParams({
    client_id: DERIV_CLIENT_ID,
    response_type: "code",
    redirect_uri: DERIV_REDIRECT_URI,
    // The NEW Deriv API scopes this client allows — these are what the REST API
    // (api.derivws.com) checks: trade→options accounts, payment→wallets,
    // account_manage→profile. (This client rejects the old read/openid scopes.)
    scope: "trade payment account_manage",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    brand: "deriv",
  });
  // No forced `prompt=consent`: once a user has authorised Clunoid, Deriv
  // remembers the grant and redirects straight back on a reconnect — so a user
  // who disconnects (or returns later) is re-linked automatically without having
  // to click through the consent screen again.
  window.location.href = `${DERIV_AUTH_BASE}/oauth2/auth?${q.toString()}`;
}

/**
 * Finish the OIDC login from the ?code&state redirect: verify state, then exchange
 * the code for the NEW-API access token (PKCE, public client, no secret) directly
 * against Deriv — auth.deriv.com/oauth2/token is CORS-open to us, and the resulting
 * `ory_at_…` token is what the new REST API (api.derivws.com) accepts. Returns the
 * access token; nothing is stored server-side. Throws with a readable message.
 */
export async function completeDerivLogin(search: string): Promise<string> {
  const p = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const code = p.get("code");
  const returnedState = p.get("state");
  if (!code) throw new Error("No authorization code returned by Deriv.");

  const saved = readPkce();
  const verifier = saved.verifier || "";
  if (saved.state && returnedState && saved.state !== returnedState) {
    throw new Error("State mismatch — the login may have been tampered with. Please try again.");
  }

  // application/x-www-form-urlencoded keeps this a simple CORS request (no preflight).
  const res = await fetch(`${DERIV_AUTH_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: DERIV_REDIRECT_URI,
      client_id: DERIV_CLIENT_ID,
      code_verifier: verifier,
    }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Deriv token exchange failed.");
  }
  clearPkce();
  return data.access_token;
}

// ── access-token storage (OAuth / new-API path) ─────────────────────────────
// The classic paste path stores a1- tokens (KEY); the OAuth path stores one
// ory_at_ access token here. Only one is active at a time.
const ACCESS_KEY = "clunoid_deriv_access";

export function saveDerivAccess(token: string): void {
  try { localStorage.setItem(ACCESS_KEY, token); } catch { /* ignore */ }
}
export function loadDerivAccess(): string {
  try { return localStorage.getItem(ACCESS_KEY) || ""; } catch { return ""; }
}
export function clearDerivAccess(): void {
  try { localStorage.removeItem(ACCESS_KEY); } catch { /* ignore */ }
}
