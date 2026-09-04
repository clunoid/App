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
    /* Each of these bounces anybody without a Deriv connection to the command
       center, so a crawler — never connected — receives an empty shell with no
       heading and none of this text on it. The titles above are still worth
       having for a shared link, but an empty page should not be submitted as
       this site's answer for a bot's name. `follow` stays on. */
    robots: { index: false, follow: true },
    openGraph: { type: "article", url, title: `${title} · Clunoid Trading`, description },
  };
}

export default async function DerivBotPage({ params }: Props) {
  const { botId } = await params;
  return <DerivBotRunner botId={botId} />;
}
