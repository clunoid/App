"use client";

/**
 * Deriv new-API trade session opener.
 *
 * Exchanges the command-center OAuth access token (ory_at_…) for an OTP-authenticated
 * WebSocket URL scoped to ONE options account. The account id decides Demo vs Real;
 * `Deriv-App-ID: 33PP…` makes the markup accrue to the app. CORS-open, browser-direct
 * (same host + auth the command center already uses to read the portfolio).
 */
import { DERIV_API_BASE, DERIV_BOT_APP_ID } from "./config";

/** POST /trading/v1/options/accounts/{accountId}/otp → the ready-to-connect WS URL. */
export async function fetchTradeSocketUrl(accessToken: string, accountId: string): Promise<string> {
  const res = await fetch(
    `${DERIV_API_BASE}/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Deriv-App-ID": DERIV_BOT_APP_ID,
      },
    },
  );
  const json = (await res.json().catch(() => null)) as
    | { data?: { url?: string }; errors?: Array<{ message?: string }>; message?: string; error?: string }
    | null;
  if (res.status === 401) throw new Error("Your Deriv session expired — reconnect in the command center.");
  const url = json?.data?.url;
  if (!res.ok || !url) {
    throw new Error(json?.errors?.[0]?.message || json?.message || json?.error || `Couldn't open a trading session (${res.status}).`);
  }
  return String(url);
}
