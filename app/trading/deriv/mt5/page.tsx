import type { Metadata } from "next";
import { Mt5BotsList } from "@/components/deriv/mt5/Mt5BotsList";

export const metadata: Metadata = {
  title: "Deriv MT5 Automations · Clunoid Trading",
  description: "AI Expert Advisors for your Deriv MT5 account — forex and Volatility indices.",
};

export default function Mt5BotsPage() {
  return <Mt5BotsList />;
}
