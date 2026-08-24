import type { Metadata } from "next";
import { PracticeBot } from "@/components/creators/PracticeBot";

export const metadata: Metadata = {
  title: "Start here — practise on a bot before you record",
  description:
    "The Smart Recovery Differ simulator for Clunoid creators. Set a starting balance, run the bot with fake money, and practise your screen recording before filming anything for real.",
  robots: { index: false, follow: false },
};

export default function CreatorPracticePage() {
  return <PracticeBot />;
}
