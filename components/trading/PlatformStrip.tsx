/**
 * THE OTHER PLATFORMS, IN ONE LINE.
 *
 * These lived as a column of cards under Deriv on the Command Center. They
 * are not brokers to connect — each is a page of its own — so they now sit
 * where somebody who is already connected will see them: a single row of
 * small chips under the header of the Bots and MT5 pages, TradingView first
 * and the Creator Program last. Every chip keeps the link, the mark and the
 * accent its card had; it has simply given up the padding.
 *
 * On a phone the row scrolls sideways, edge to edge, with no scrollbar drawn
 * — the same treatment a tab strip gets. Nothing here needs a connection.
 */

import Link from "next/link";
import { Clapperboard, Gift } from "lucide-react";
import { TC } from "@/lib/trading/theme";

export const BINANCE_REFERRAL_URL = "https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_IIEHW&utm_source=referral_entrance";

const chip = "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition hover:-translate-y-px";
const tag = "rounded px-1 py-[1px] text-[8.5px] font-bold uppercase tracking-wide";

export function PlatformStrip() {
  return (
    <nav
      aria-label="Other platforms"
      className="strip-scroll mt-3 -mx-6 flex gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      {/* TradingView — charts, screener, Pine Script. */}
      <Link href="/trading/tradingview" className={chip} style={{ borderColor: TC.line, background: TC.panel, color: TC.text }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/tradingview.svg" alt="TradingView" className="h-[13px] w-auto" style={{ maxWidth: 88 }} />
        <span className={tag} style={{ background: "rgba(56,189,248,0.16)", color: "#38bdf8" }}>AI bots</span>
      </Link>

      {/* MetaTrader 5 — broker-agnostic automations. */}
      <Link href="/trading/mt5" className={chip} style={{ borderColor: "rgba(52,211,153,0.4)", background: "rgba(52,211,153,0.08)", color: TC.text }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/metatrader5.svg" alt="MetaTrader 5" className="h-[13px] w-auto" style={{ maxWidth: 100 }} />
        <span className={tag} style={{ background: "rgba(56,189,248,0.16)", color: "#38bdf8" }}>AI bots</span>
      </Link>

      {/* Exness — onboarding and the Telegram community. */}
      <Link href="/trading/exness" className={chip} style={{ borderColor: TC.line, background: TC.panel, color: TC.text }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/exness.svg" alt="Exness" className="h-[13px] w-auto" style={{ maxWidth: 66 }} />
        <span className="text-[10.5px] font-medium" style={{ color: TC.faint }}>signals &amp; bots</span>
      </Link>

      {/* Binance — the welcome gifts, through our referral. */}
      <a href={BINANCE_REFERRAL_URL} target="_blank" rel="noopener noreferrer" className={chip} style={{ borderColor: "rgba(243,186,47,0.42)", background: "rgba(243,186,47,0.10)", color: TC.text }}>
        <Gift size={13} style={{ color: "#f3ba2f" }} />
        Binance gifts
      </a>

      {/* Not yet. */}
      {[{ name: "cTrader", logo: "/logos/ctrader.svg" }].map((p) => (
        <span key={p.name} className={chip + " cursor-default opacity-60 hover:translate-y-0"} style={{ borderColor: TC.line, color: TC.muted }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.logo} alt="" className="h-[13px] w-[13px] rounded object-contain" />
          {p.name}
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: TC.faint }}>Soon</span>
        </span>
      ))}

      {/* Creator Program — last, and the one that pays. */}
      <Link href="/trading/creators" className={chip} style={{ borderColor: "rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.10)", color: TC.text }}>
        <Clapperboard size={13} style={{ color: "#a78bfa" }} />
        Creator Program
        <span className={tag} style={{ background: "rgba(167,139,250,0.16)", color: "#a78bfa" }}>Get paid</span>
      </Link>
    </nav>
  );
}
