import type { Metadata } from "next";
import { DerivBotsSimList } from "@/components/deriv/bots/DerivBotsSimList";

export const metadata: Metadata = {
  title: "Deriv bots simulation",
  robots: { index: false, follow: false },
};

export default function DerivBotsSimPage() {
  return <DerivBotsSimList />;
}
