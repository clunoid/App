"use client";

/**
 * AUTONOMOUS TRADING — the app-wide mount and the consent card.
 *
 * Mounted once in the root layout so the controller keeps running while the user
 * moves around the site. It renders nothing until the automation is funded and
 * ready, at which point it asks — in plain terms, with the figures it has worked
 * out — whether it may trade. Nothing is placed on anyone's account until they
 * choose Allow.
 *
 * The controller is a singleton and boot() is idempotent, so mounting this more
 * than once (StrictMode, fast refresh) is harmless.
 */
import { useEffect, useState } from "react";
import { Bot, X, Check } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { getBot } from "@/lib/deriv/bots/registry";
import { autonomous, describeRun, AUTONOMOUS_BOT_ID, SMART_RECOVERY_TUNING, type AutoSnapshot } from "@/lib/deriv/bots/autonomous";

export function AutonomousTrading() {
  const [snap, setSnap] = useState<AutoSnapshot | null>(null);

  useEffect(() => {
    const ctl = autonomous();
    ctl.boot();
    return ctl.subscribe(setSnap);
  }, []);

  if (!snap?.needsConsent) return null;

  const cur = snap.currency || "USD";
  const meta = getBot(AUTONOMOUS_BOT_ID);
  // Below the point where the Deriv minimum stake overrides the safe size, the
  // recovery ladder no longer fits the balance. Say so before they decide.
  const run = snap.balance != null && meta
    ? describeRun(snap.balance, meta.defaultMartingale, SMART_RECOVERY_TUNING)
    : null;
  const pct = Math.round(SMART_RECOVERY_TUNING.profitTargetPct * 100);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cln-auto-title"
      className="fixed bottom-4 right-4 z-[60] w-[min(380px,calc(100vw-2rem))] rounded-2xl border p-4 shadow-2xl"
      style={{ borderColor: "rgba(52,211,153,0.45)", background: TC.panel, color: TC.text }}
    >
      <button
        onClick={() => autonomous().declineForNow()}
        aria-label="Not now"
        className="absolute right-3 top-3 rounded-lg p-1 transition hover:bg-white/10"
        style={{ color: TC.faint }}
      >
        <X size={15} />
      </button>

      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(52,211,153,0.14)" }}>
          <Bot size={18} style={{ color: "#34d399" }} />
        </span>
        <div className="min-w-0">
          <h3 id="cln-auto-title" className="text-[14px] font-bold" style={{ color: "#34d399" }}>
            Shall the bot trade this for you?
          </h3>

          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            Your balance is <b style={{ color: TC.text }}>{(snap.balance ?? 0).toFixed(2)} {cur}</b>, so
            Smart Recovery Differ would stake <b style={{ color: TC.text }}>{snap.stake.toFixed(2)} {cur}</b> a
            trade and aim for <b style={{ color: TC.text }}>{snap.target.toFixed(2)} {cur}</b> — {pct}% of
            your balance.
          </p>

          <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            <b style={{ color: TC.text }}>It stops on its own the moment that {snap.target.toFixed(2)} {cur} profit
            target is reached.</b> It then rests before sizing the next run from your new balance. These are
            real trades on your own Deriv account, and you can stop it at any time from the bot page.
          </p>

          {run && !run.bufferFits && (
            <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#f5c451" }}>
              At this balance the {SMART_RECOVERY_TUNING.minStake.toFixed(2)} {cur} minimum stake is larger than
              the size we would choose, so a long losing streak can use more than your balance. A run is
              steadier from about {run.safeFloor.toFixed(0)} {cur}.
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => autonomous().allow()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition hover:opacity-90"
              style={{ background: "#34d399", color: TC.ink }}
            >
              <Check size={14} strokeWidth={3} /> Allow
            </button>
            <button
              onClick={() => autonomous().declineForNow()}
              className="rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold transition hover:bg-white/5"
              style={{ borderColor: TC.line, color: TC.text }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
