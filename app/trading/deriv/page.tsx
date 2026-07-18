import { redirect } from "next/navigation";

/**
 * /trading/deriv was an early Deriv landing page that duplicated the command
 * center (it loaded the connection + rendered the portfolio). The command center
 * (/trading/command) is the hub now, so this route renders NOTHING of its own —
 * it just redirects there, so it can never leak the connection, routes or paths.
 * The URL is kept (not deleted) in case it's repurposed as an SEO page later.
 */
export default function DerivIndexPage() {
  redirect("/trading/command");
}
