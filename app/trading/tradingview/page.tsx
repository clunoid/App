import type { Metadata } from "next";
import { TradingViewHub } from "@/components/tradingview/TradingViewHub";

export const metadata: Metadata = {
  title: "TradingView — charts, screener & Pine Script",
  description:
    "Open TradingView for charts, screeners, price alerts and the largest public library of trade ideas. Analyse the market there, then execute on your own broker account.",
  alternates: { canonical: "/trading/tradingview" },
  openGraph: {
    type: "website",
    url: "/trading/tradingview",
    title: "TradingView · Clunoid Trading",
    description: "Charts, screener, alerts and Pine Script — then execute on your own broker account.",
  },
};

export default function TradingViewPage() {
  return <TradingViewHub />;
}
