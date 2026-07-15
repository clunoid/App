"use client";

import {
  DERIV_AUTH_BASE,
  DERIV_CLIENT_ID,
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
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = await challengeFromVerifier(verifier);
  try {
    sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  } catch {
    /* if sessionStorage is blocked the state check below will simply be skipped */
  }
  const q = new URLSearchParams({
    client_id: DERIV_CLIENT_ID,
    response_type: "code",
    redirect_uri: DERIV_REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    brand: "deriv",
  });
  window.location.href = `${DERIV_AUTH_BASE}/oauth2/auth?${q.toString()}`;
}

type LegacyTokenShape = {
  token?: string;
  loginid?: string;
  loginId?: string;
  acct?: string;
  currency?: string;
  cur?: string;
};

/** Normalise whatever the legacy/tokens endpoint returns into DerivToken[]. */
function parseLegacyTokens(data: unknown): DerivToken[] {
  const out: DerivToken[] = [];
  const push = (t: LegacyTokenShape) => {
    const token = t.token;
    const loginid = t.loginid || t.loginId || t.acct || "";
    if (token) out.push({ token, loginid, currency: t.currency || t.cur || "" });
  };
  if (Array.isArray(data)) {
    for (const t of data) push(t as LegacyTokenShape);
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.tokens)) {
      for (const t of obj.tokens) push(t as LegacyTokenShape);
    } else {
      // flat acct1/token1/cur1 shape
      const flat = new URLSearchParams();
      for (const [k, v] of Object.entries(obj)) if (typeof v === "string") flat.set(k, v);
      out.push(...parseDerivRedirect(`?${flat.toString()}`));
    }
  }
  return out;
}

/**
 * Finish the OIDC login from the ?code&state redirect: verify state, exchange the
 * code for an access token (PKCE, no secret), then swap that for the a1-… account
 * tokens the WebSocket uses. Throws with a readable message on any failure.
 */
export async function completeDerivLogin(search: string): Promise<DerivToken[]> {
  const p = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const code = p.get("code");
  const returnedState = p.get("state");
  if (!code) throw new Error("No authorization code returned by Deriv.");

  let verifier = "";
  try {
    const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || "{}") as {
      verifier?: string;
      state?: string;
    };
    verifier = saved.verifier || "";
    if (saved.state && returnedState && saved.state !== returnedState) {
      throw new Error("State mismatch — the login may have been tampered with. Please try again.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("State mismatch")) throw e;
    /* no stored PKCE (e.g. different tab) — proceed; Deriv will reject if invalid */
  }

  // 1) code → access_token
  const tokenRes = await fetch(`${DERIV_AUTH_BASE}/oauth2/token`, {
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
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(
      tokenJson.error_description || tokenJson.error || "Deriv token exchange failed.",
    );
  }

  // 2) access_token → a1-… account tokens (WebSocket-usable)
  const legacyRes = await fetch(`${DERIV_OAUTH_BASE}/oauth2/legacy/tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      "Content-Type": "application/json",
    },
  });
  const legacyJson = await legacyRes.json().catch(() => null);
  if (!legacyRes.ok) {
    const msg =
      (legacyJson && (legacyJson.error_description || legacyJson.error || legacyJson.error_code)) ||
      "Deriv account-token exchange failed.";
    throw new Error(String(msg));
  }
  const tokens = parseLegacyTokens(legacyJson);
  if (!tokens.length) throw new Error("Deriv returned no account tokens.");
  try {
    sessionStorage.removeItem(PKCE_KEY);
  } catch {
    /* ignore */
  }
  return tokens;
}
