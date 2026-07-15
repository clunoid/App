import type { Metadata } from "next";
import { DerivPlatform } from "@/components/deriv/DerivPlatform";

/**
 * /trading/deriv — the Deriv platform page. The destination after connecting
 * Deriv in Central Command: the user's Options + MT5 accounts, balances, and
 * (next step) the automation controls. Under /trading/* so it's reachable in
 * trading mode; also the OAuth flow can safely bounce through here.
 */
export const metadata: Metadata = {
  title: "Deriv · Clunoid Trading",
  description: "Your connected Deriv Options and MT5 accounts, balances and automation.",
};

export default function DerivPage() {
  return <DerivPlatform />;
}
