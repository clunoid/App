import type { Metadata } from "next";
import { DerivBotsList } from "@/components/deriv/bots/DerivBotsList";

export const metadata: Metadata = {
  title: "Deriv Bots · Clunoid Trading",
  description: "Automated Deriv bots that run in your browser and trade directly on your connected Deriv account.",
};

export default function DerivBotsPage() {
  return <DerivBotsList />;
}
