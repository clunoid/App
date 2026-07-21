import type { Metadata } from "next";
import { DerivBotsList } from "@/components/deriv/bots/DerivBotsList";

export const metadata: Metadata = {
  title: "Free Deriv bots — automated trading in your browser",
  description:
    "Free automated Deriv bots that run in your browser and trade directly on your connected Deriv account — Demo or Real, with live trades and statistics. No download required.",
  alternates: { canonical: "/trading/deriv/bots" },
  openGraph: {
    type: "website",
    url: "/trading/deriv/bots",
    title: "Free Deriv bots — automated trading in your browser · Clunoid Trading",
    description: "Automated Deriv bots that trade on your own connected account, Demo or Real. Free, no download.",
  },
};

export default function DerivBotsPage() {
  return <DerivBotsList />;
}
