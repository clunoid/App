"use client";

/**
 * TRADINGVIEW — the page shell. Nothing but the Clunoid Trading background for
 * now; content gets added deliberately rather than assumed.
 */
import { TC, DOT_GRID } from "@/lib/trading/theme";

export function TradingViewHub() {
  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
    </main>
  );
}
