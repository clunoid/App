import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMt5Auto } from "@/lib/mt5/registry";
import { MomentumMt5 } from "@/components/mt5/MomentumMt5";
import { DipMt5 } from "@/components/mt5/DipMt5";
import { VolBreakoutMt5 } from "@/components/mt5/VolBreakoutMt5";
import { OrbMt5 } from "@/components/mt5/OrbMt5";

type Props = { params: Promise<{ botId: string }> };

/** Per-automation metadata, from the registry so it can't drift from the card. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { botId } = await params;
  const b = getMt5Auto(botId);
  if (!b) return { title: "MetaTrader 5 automations", alternates: { canonical: "/trading/mt5" } };
  const title = `${b.name} — free MT5 automation`;
  const description = `${b.blurb} Download the Expert Advisor and run it on your own MetaTrader 5 terminal, on any broker.`;
  const url = `/trading/mt5/${b.id}`;
  return { title, description, alternates: { canonical: url }, openGraph: { type: "article", url, title: `${title} · Clunoid Trading`, description } };
}

/** Each available automation maps to its own page component. */
const VIEWS: Record<string, React.ComponentType> = {
  momentum: MomentumMt5,
  "index-dip": DipMt5,
  "volatility-breakout": VolBreakoutMt5,
  orb: OrbMt5,
};

export default async function Mt5AutoPage({ params }: Props) {
  const { botId } = await params;
  const bot = getMt5Auto(botId);
  const View = bot && bot.status === "available" ? VIEWS[botId] : undefined;
  if (!View) redirect("/trading/mt5"); // in-testing automations have no page yet
  return <View />;
}
