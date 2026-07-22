import type { Metadata } from "next";
import { Mt5PlatformList } from "@/components/mt5/Mt5PlatformList";

/**
 * /trading/mt5 — the STANDALONE MetaTrader 5 platform (not the Deriv MT5 bots).
 * Broker-agnostic automations, free, no connection required.
 */
export const metadata: Metadata = {
  title: "MetaTrader 5 automations — free Expert Advisors",
  description:
    "Free MetaTrader 5 Expert Advisors built on documented market edges — trend, momentum, mean reversion and breakout. Volatility-based sizing fits any balance; runs on any MT5 broker.",
  alternates: { canonical: "/trading/mt5" },
  openGraph: {
    type: "website",
    url: "/trading/mt5",
    title: "MetaTrader 5 automations — free Expert Advisors · Clunoid Trading",
    description: "Documented-edge trading automations for any MT5 broker. Free to download, no connection required.",
  },
};

export default function Mt5PlatformPage() {
  return <Mt5PlatformList />;
}
