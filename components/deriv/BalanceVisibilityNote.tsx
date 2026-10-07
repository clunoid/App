"use client";

/**
 * A brief, direct note explaining that only the Deriv OPTIONS trading balance is
 * readable here — with a blue text link (affiliate-tracked) to the Deriv portfolio
 * where the user can move their other funds in. Reused in the bot recommendation /
 * add-funds popups so a low or missing balance is never confusing.
 *
 * Bright green and bold, so it reads as the answer it is rather than fine print;
 * the link keeps the links' blue.
 */
import { DERIV_TRACKED_PORTFOLIO_URL } from "@/lib/deriv/config";

export function BalanceVisibilityNote({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <p className={`font-semibold ${className}`} style={{ color: "#34d399", ...style }}>
      Only your options trading account shows here — move your other funds into it from your{" "}
      <a href={DERIV_TRACKED_PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2 transition hover:opacity-80" style={{ color: "#38bdf8" }}>
        Deriv portfolio
      </a>.
    </p>
  );
}
