import type { Metadata } from "next";
import { Mt5BotsList } from "@/components/deriv/mt5/Mt5BotsList";

export const metadata: Metadata = {
  title: "Free MT5 trading bots — AI Expert Advisors",
  description:
    "Free, fully automated MetaTrader 5 Expert Advisors for gold and silver, crypto, forex, stock indices and synthetic indices. Download, pick a risk profile and run them on your own MT5 account.",
  alternates: { canonical: "/trading/deriv/mt5" },
  openGraph: {
    type: "website",
    url: "/trading/deriv/mt5",
    title: "Free MT5 trading bots — AI Expert Advisors · Clunoid Trading",
    description: "Automated MT5 Expert Advisors for gold, crypto, forex, indices and synthetic indices — free to download and run on any MT5 account.",
  },
};

export default function Mt5BotsPage() {
  return <Mt5BotsList />;
}
