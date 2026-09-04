import type { Metadata } from "next";
import { DerivBotsList } from "@/components/deriv/bots/DerivBotsList";

export const metadata: Metadata = {
  title: "Free Deriv bots — automated trading in your browser",
  description:
    "Free automated Deriv bots that run in your browser and trade directly on your connected Deriv account — Demo or Real, with live trades and statistics. No download required.",
  alternates: { canonical: "/trading/deriv/bots" },
  /* This catalogue bounces anybody without a Deriv connection to the command
     center, and a crawler is never connected — so a search engine only ever
     receives an empty shell of it. Better to say plainly that it is not for
     indexing than to let a blank page be recorded as this site's answer for
     "Deriv bots". `follow` stays on so the links are still crawled.

     To make it findable by name, render the list to everyone and gate only the
     running of a bot, the way /trading/deriv/mt5 already does. */
  robots: { index: false, follow: true },
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
