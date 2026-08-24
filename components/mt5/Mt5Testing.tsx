"use client";

/**
 * MT5 — the state a paid automation is in before it is finished.
 *
 * These bots are still being tested, so there is nothing honest to sell yet and
 * nothing to download. A price tag on something that does not exist is the one
 * thing that would cost us the reader's trust, so the button says what is true:
 * in testing.
 *
 * That leaves the reader with a question — "then when?" — and the whole job of
 * this block is answering it. Two channels they can join in one tap, said
 * plainly: this is where the release is announced. And underneath, the way out
 * for anyone who wanted a bot running today rather than a notification, which
 * is the same free-bots offer the purchase popup made, in the same shape.
 */

import { useRouter } from "next/navigation";
import { FlaskConical, BellRing } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { loadDerivAccess } from "@/lib/deriv/oauth";

/** The two channels the release gets announced on. Live, and checked. */
export const TELEGRAM_CHANNEL = "https://t.me/magicabofficialchannel";
export const WHATSAPP_CHANNEL = "https://whatsapp.com/channel/0029Vb6sxFG9xVJWbyIwL110";

export function Mt5Testing({ botName }: { botName: string }) {
  const router = useRouter();

  // The same way out the purchase popup offered, and for the same reason: a
  // reader already linked to Deriv goes straight to the free bots with a
  // confirmation; anyone else lands on Home with the connect prompt open.
  const goFree = () => {
    let connected = false;
    try { connected = !!loadDerivAccess(); } catch { /* treat as not connected */ }
    router.push(connected ? "/trading/deriv/bots?welcome=1" : "/trading/command?connect=1");
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold"
          style={{ background: "rgba(251,191,36,0.14)", border: "1px solid rgba(251,191,36,0.45)", color: "#fbbf24" }}>
          <FlaskConical size={15} /> In testing
        </span>

        <Channel href={TELEGRAM_CHANNEL} logo="/logos/telegram.svg" label="Telegram" tint="rgba(34,158,217,0.45)" />
        <Channel href={WHATSAPP_CHANNEL} logo="/logos/whatsapp.svg" label="WhatsApp" tint="rgba(37,211,102,0.45)" />
      </div>

      <p className="mt-2.5 flex items-start gap-1.5 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
        <BellRing size={13} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
        <span>
          <b style={{ color: TC.text }}>{botName} is not ready to download yet.</b> Join either channel — Telegram or
          WhatsApp, whichever you use — and we will tell you there the moment testing finishes and it is ready to
          download. You only need one of them.
        </span>
      </p>

      {/* The free way out, in the same shape the purchase popup used. */}
      <div className="mt-4 rounded-xl border p-3.5" style={{ borderColor: TC.line, background: "rgba(52,211,153,0.06)" }}>
        <p className="text-[12px] leading-relaxed" style={{ color: TC.muted }}>
          Not ready to wait for testing? Use our <b style={{ color: TC.text }}>free, fully automated trading bots</b> at
          no cost — connect your account or create one to get started.
        </p>
        <button onClick={goFree}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition hover:bg-white/5"
          style={{ borderColor: "rgba(52,211,153,0.4)", color: "#34d399" }}>
          Use our free trading bots instead.
        </button>
      </div>
    </div>
  );
}

function Channel({ href, logo, label, tint }: { href: string; logo: string; label: string; tint: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold transition hover:bg-white/5"
      style={{ borderColor: tint, color: TC.text }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt="" aria-hidden className="h-[18px] w-[18px]" />
      Join {label}
    </a>
  );
}
