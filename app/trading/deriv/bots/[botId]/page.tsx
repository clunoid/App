import type { Metadata } from "next";
import { DerivBotRunner } from "@/components/deriv/bots/DerivBotRunner";

export const metadata: Metadata = {
  title: "Deriv Bot · Clunoid Trading",
  description: "Run a Deriv bot on your connected Deriv account — Demo or Real, with live trades and statistics.",
};

type Props = { params: Promise<{ botId: string }> };

export default async function DerivBotPage({ params }: Props) {
  const { botId } = await params;
  return <DerivBotRunner botId={botId} />;
}
