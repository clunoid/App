/**
 * Partner sign-up links. Kept in one place so a changed referral code is a
 * one-line edit rather than a hunt through components.
 *
 * NOTE: components/trading/CommandCenter.tsx still carries its own copy of the
 * Binance URL from before this file existed — worth pointing at this constant
 * next time that file is touched.
 */

/** Deriv revenue-share link — new sign-ups are attributed to us. */
export { DERIV_AFFILIATE_URL } from "@/lib/deriv/config";

/** Binance referral — the sign-up gift/welcome rewards flow. */
export const BINANCE_REFERRAL_URL =
  "https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_IIEHW&utm_source=referral_entrance";

export type Affiliate = {
  name: string;
  logo: string;
  href: string;
  headline: string;
  sub: string;
  accent: string;
};

/** The partners a visitor can open an account with today. More to follow. */
export const AFFILIATES: Affiliate[] = [
  {
    name: "Deriv",
    logo: "/logos/deriv-wordmark.svg",
    href: "", // filled at render from DERIV_AFFILIATE_URL (env-overridable)
    headline: "Open a Deriv account",
    sub: "Forex, metals, indices and synthetics that price 24/7 — demo included.",
    accent: "#ff444f",
  },
  {
    name: "Binance",
    logo: "/logos/binance.svg",
    href: BINANCE_REFERRAL_URL,
    headline: "Open a Binance account",
    sub: "Claim the welcome rewards when you sign up and start trading crypto.",
    accent: "#f3ba2f",
  },
];
