import type { Metadata } from "next";
import { Mt5Bots } from "@/components/deriv/mt5/Mt5Bots";

export const metadata: Metadata = {
  title: "Deriv MT5 Automations · Clunoid Trading",
  description: "Continuous AI forex + synthetics automation for your Deriv MT5 account.",
};

export default function Mt5BotsPage() {
  return <Mt5Bots />;
}
