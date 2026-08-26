import type { Metadata } from "next";
import { TradingViewHub } from "@/components/tradingview/TradingViewHub";

export const metadata: Metadata = {
  title: "Free forex signals on Telegram — entry, stop and target",
  description:
    "Free day-trading signals for the forex majors on the 15-minute chart, sent to Telegram the moment a setup appears. Every signal carries an exact entry, stop and target. Nothing to install, nothing to pay.",
  alternates: { canonical: "/trading/tradingview" },
  openGraph: {
    type: "website",
    url: "/trading/tradingview",
    title: "Free forex signals on Telegram · Clunoid Trading",
    description: "Day-trading setups on the forex majors, 15m, with exact entry, stop and target — delivered automatically and free.",
  },
};

export default function TradingViewPage() {
  return <TradingViewHub />;
}
