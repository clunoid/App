import type { Metadata } from "next";
import { CommandCenter } from "@/components/trading/CommandCenter";

/**
 * /trading/command-preview — the command page with the Smart Scan bot, for
 * checking a change on the live site (with the visitor's own sign-in, which is
 * kept per site) before /trading/command shows it. Not linked, not indexed.
 */
export const metadata: Metadata = {
  title: "Home — preview",
  robots: { index: false, follow: false },
};

export default function CommandPreviewPage() {
  return <CommandCenter smartBot />;
}
