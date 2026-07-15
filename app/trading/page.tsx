import type { Metadata } from "next";
import { TradingLanding } from "@/components/trading/TradingLanding";

/**
 * /trading — CLUNOID TRADING, the public landing / face of the platform.
 *
 * This is the new front door: when the app is in trading mode (the default),
 * middleware rewrites `/` here and hides the classic Clunoid features from
 * non-admins, so clunoid.com presents as a serious trading platform. Admins get
 * a toggle back to classic Clunoid (which sets a cookie middleware reads).
 * Broker-agnostic by design; live execution is wired in later steps.
 */
export const metadata: Metadata = {
  title: "Clunoid Trading — intelligent automated trading",
  description: "AI-driven automated trading that runs on your own broker account. Starting with Deriv MT5; broker-agnostic by design.",
};

export default function TradingPage() {
  return <TradingLanding />;
}
