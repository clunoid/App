import type { Metadata } from "next";
import { PricingTiers } from "@/components/billing/PricingTiers";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Clunoid pricing — one pool of credits powers Stat Battles, search, games and Isaac's voice. Free to start; Pro $12/mo and Max $30/mo. Buy extra credits any time or set up auto-reload. Exporting videos is always free.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="stage-bg min-h-[100dvh]">
      <PricingTiers />
    </main>
  );
}
