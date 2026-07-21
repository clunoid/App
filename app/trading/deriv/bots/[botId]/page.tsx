import type { Metadata } from "next";
import { getBot } from "@/lib/deriv/bots/registry";
import { DerivBotRunner } from "@/components/deriv/bots/DerivBotRunner";

type Props = { params: Promise<{ botId: string }> };

/**
 * Per-bot metadata. These pages previously shared one hard-coded title, which
 * reads to a search engine as the same page eleven times over — so most would
 * never be indexed. Each now carries its own title, description and canonical,
 * taken from the registry so it cannot drift from the card.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { botId } = await params;
  const bot = getBot(botId);
  if (!bot) return { title: "Deriv bots", alternates: { canonical: "/trading/deriv/bots" } };

  const title = `${bot.name} — free Deriv bot`;
  const description = `${bot.tagline}. Runs on your own connected Deriv account, Demo or Real, with live trades and statistics. Markets: ${bot.markets}.`;
  const url = `/trading/deriv/bots/${bot.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: `${title} · Clunoid Trading`, description },
  };
}

export default async function DerivBotPage({ params }: Props) {
  const { botId } = await params;
  return <DerivBotRunner botId={botId} />;
}
