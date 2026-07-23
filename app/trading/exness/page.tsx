import type { Metadata } from "next";
import { ExnessHub } from "@/components/exness/ExnessHub";

export const metadata: Metadata = {
  title: "Exness — account, signals & free MT5 bots",
  description:
    "Open an Exness account and join our Telegram channel for profitable trading signals and powerful free MetaTrader 5 bots — for beginners and professional traders.",
  alternates: { canonical: "/trading/exness" },
  openGraph: {
    type: "website",
    url: "/trading/exness",
    title: "Exness · Clunoid Trading",
    description: "Create your Exness account and join Telegram for signals and free MT5 bots.",
  },
};

export default function ExnessPage() {
  return <ExnessHub />;
}
