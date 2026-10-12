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
      If your full balance is not visible, transfer funds to your Deriv options account.{" "}
      <a href={DERIV_TRACKED_PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-px align-[1px] font-bold transition hover:opacity-80" style={{ color: "#38bdf8", borderColor: "rgba(56,189,248,0.45)", background: "rgba(56,189,248,0.12)" }}>
        Transfer funds
      </a>
    </p>
  );
}
