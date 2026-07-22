import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMt5Bot } from "@/lib/deriv/mt5/registry";
import { GeneralMt5 } from "@/components/deriv/mt5/bots/GeneralMt5";
import { GoldMt5 } from "@/components/deriv/mt5/bots/GoldMt5";
import { CryptoMt5 } from "@/components/deriv/mt5/bots/CryptoMt5";
import { ForexMt5 } from "@/components/deriv/mt5/bots/ForexMt5";
import { IndicesMt5 } from "@/components/deriv/mt5/bots/IndicesMt5";
import { VolatilityMt5 } from "@/components/deriv/mt5/bots/VolatilityMt5";

type Props = { params: Promise<{ botId: string }> };

/**
 * Per-bot metadata. Every one of these pages previously shared one hard-coded
 * title, which reads to a search engine as the same page repeated — so most of
 * them would never be indexed. Each now carries its own title, description and
 * canonical, drawn from the registry so it cannot drift from the card.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { botId } = await params;
  const bot = getMt5Bot(botId);
  if (!bot) return { title: "MT5 bots", alternates: { canonical: "/trading/deriv/mt5" } };

  // Only the free general automation may say "free" — the rest are paid.
  const title = bot.free ? `${bot.name} — free MT5 Expert Advisor` : `${bot.name} — MT5 Expert Advisor`;
  const description = `${bot.blurb} ${bot.free ? "Download the Expert Advisor" : "Buy once, then download the Expert Advisor"}, set your risk profile and run it on your own MetaTrader 5 terminal.`;
  const url = `/trading/deriv/mt5/${bot.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: `${title} · Clunoid Trading`, description },
  };
}

/** Each MT5 bot has its own component file; map its id here. */
const BOT_VIEWS: Record<string, React.ComponentType> = {
  volatility: VolatilityMt5,
  indices: IndicesMt5,
  forex: ForexMt5,
  crypto: CryptoMt5,
  gold: GoldMt5,
  generalmt5: GeneralMt5,
};


export default async function Mt5BotPage({ params }: Props) {
  const { botId } = await params;
  const View = getMt5Bot(botId) ? BOT_VIEWS[botId] : undefined;
  if (!View) redirect("/trading/deriv/mt5");
  return <View />;
}
