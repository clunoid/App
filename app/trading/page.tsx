"use client";

/**
 * /trading — the Clunoid Trading Desk (admin-only).
 *
 * Access model: this page renders the terminal for anyone who reaches it, but
 * EVERY byte of data flows through /api/trading/* routes that verify the
 * server-side session against the immutable admin allow-list (403 otherwise) —
 * the terminal renders a "restricted" screen on 403. The route is deliberately
 * absent from all navigation, feature registries and sitemaps. Opening it to
 * more users later = widening the allow-list + the RLS predicate, nothing else.
 */
import { Terminal } from "@/components/trading/Terminal";

export default function TradingPage() {
  return (
    <main>
      <Terminal />
    </main>
  );
}
