/**
 * DERIV BOTS — shared config for the browser-side, API-executed Deriv bots.
 *
 * These bots run ENTIRELY in the user's browser on the NEW Deriv API
 * (api.derivws.com), reusing the exact connection the user already made in the
 * command center — same app (33PP…), same OAuth access token. Nothing else to
 * authorise.
 *
 * How the new API trades (verified against Deriv's OpenAPI 3.1 spec + WS schemas):
 *   1. GET  /trading/v1/options/accounts            (Bearer ory_at_, Deriv-App-ID)
 *        → the user's Demo + Real options accounts (the command center already
 *          reads these into the portfolio).
 *   2. POST /trading/v1/options/accounts/{id}/otp   (Bearer ory_at_, Deriv-App-ID)
 *        → { data: { url } } — a ready-to-connect, OTP-authenticated WebSocket URL
 *          (…/trading/v1/options/ws/demo?otp=… or …/ws/real?otp=…). The account id
 *          you request the OTP for IS the Demo/Real choice.
 *   3. new WebSocket(url) → send proposal / buy / proposal_open_contract / balance /
 *        ticks (same message shapes as the classic API; proposal uses
 *        `underlying_symbol`). No `authorize` step — the OTP URL is pre-authed.
 *
 * MARKUP: every call carries `Deriv-App-ID: 33PP…`, so all trades are attributed to
 * that app and its configured markup accrues (Deriv exposes it via
 * /applications/v1/markup-statistics). No second app_id — 33PP… only.
 */
import { DERIV_CLIENT_ID } from "../config";

/** New Deriv API host (same one the command center reads accounts/balances from). */
export const DERIV_API_BASE = "https://api.derivws.com";

/** The app id sent as `Deriv-App-ID` on every bot call → this app earns the markup.
 *  This is Clunoid's Deriv app 33PP… (NEXT_PUBLIC_DERIV_APP_ID) — the SAME app the
 *  command center connects with. Never a different id. */
export const DERIV_BOT_APP_ID = DERIV_CLIENT_ID;

/** Deriv Volatility indices the digit bots trade. */
export const DERIV_VOLATILITY_MARKETS = ["R_10", "R_25", "R_50", "R_75", "R_100"] as const;

/** Decimal places per Volatility index — the fallback for reading a tick's LAST
 *  digit when the tick payload doesn't carry `pip_size`. A raw JS number drops
 *  trailing zeros, so the digit must be read from the quote formatted to this many
 *  decimals (the same precision Deriv settles digit contracts on). */
export const DERIV_PIP_DECIMALS: Record<string, number> = { R_10: 3, R_25: 3, R_50: 4, R_75: 4, R_100: 2 };

/** Shared config defaults for a bot (mirrors the BotsLab global inputs). */
export type BotConfig = {
  initialStake: number;
  takeProfit: number; // stop the bot when session profit ≥ this (USD)
  stopLoss: number; // stop the bot when session loss ≥ this (USD)
  martingaleMultiplier: number; // next stake after a loss = current × this
};

export const BOT_DEFAULTS = {
  initialStake: 1,
  minStake: 0.35,
  takeProfit: 100,
  stopLoss: 1000,
  martingaleMultiplier: 3.1,
} as const;
