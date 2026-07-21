import type { Metadata } from "next";
import { CommandCenter } from "@/components/trading/CommandCenter";

/**
 * /trading/command — CENTRAL COMMAND, the account-control hub. Get Started on the
 * landing brings the user here (no sign-in): they connect a platform (Deriv
 * first) and see every connected account, balance and platform in one place,
 * then open a platform's own page to run it. Lives under /trading/* so it's
 * reachable in trading mode (middleware).
 */
export const metadata: Metadata = {
  title: "Central Command — connect your broker account",
  description:
    "Connect your broker and see every account, balance and platform in one place, then open the trading bots. You authorise your own broker directly.",
  alternates: { canonical: "/trading/command" },
};

export default function CommandPage() {
  return <CommandCenter />;
}
