import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMt5Bot } from "@/lib/deriv/mt5/registry";
import { GeneralMt5 } from "@/components/deriv/mt5/bots/GeneralMt5";
import { GoldMt5 } from "@/components/deriv/mt5/bots/GoldMt5";
import { CryptoMt5 } from "@/components/deriv/mt5/bots/CryptoMt5";
import { ForexMt5 } from "@/components/deriv/mt5/bots/ForexMt5";
import { IndicesMt5 } from "@/components/deriv/mt5/bots/IndicesMt5";

export const metadata: Metadata = {
  title: "MT5 Bot · Clunoid Trading",
  description: "Run this MT5 Expert Advisor on your own MetaTrader 5 terminal — live signals, risk profiles and setup.",
};

/** Each MT5 bot has its own component file; map its id here. */
const BOT_VIEWS: Record<string, React.ComponentType> = {
  indices: IndicesMt5,
  forex: ForexMt5,
  crypto: CryptoMt5,
  gold: GoldMt5,
  generalmt5: GeneralMt5,
};

type Props = { params: Promise<{ botId: string }> };

export default async function Mt5BotPage({ params }: Props) {
  const { botId } = await params;
  const View = getMt5Bot(botId) ? BOT_VIEWS[botId] : undefined;
  if (!View) redirect("/trading/deriv/mt5");
  return <View />;
}
