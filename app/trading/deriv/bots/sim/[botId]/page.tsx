import type { Metadata } from "next";
import { getBot } from "@/lib/deriv/bots/registry";
import { DerivBotSimRunner } from "@/components/deriv/bots/DerivBotSimRunner";

type Props = { params: Promise<{ botId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { botId } = await params;
  const bot = getBot(botId);
  if (!bot) return { title: "Deriv bots simulation", robots: { index: false, follow: false } };
  return {
    title: `${bot.name} — simulation`,
    robots: { index: false, follow: false },
  };
}

export default async function DerivBotSimPage({ params }: Props) {
  const { botId } = await params;
  return <DerivBotSimRunner botId={botId} />;
}
