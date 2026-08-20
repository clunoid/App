"use client";

/**
 * AUTONOMOUS TRADING — the app-wide mount.
 *
 * Mounted once in the root layout so the controller keeps running while the user
 * moves around the site, not just while a bot page is open. Renders nothing at
 * all unless the automation has just armed, in which case it confirms once.
 *
 * The controller itself is a singleton and boot() is idempotent, so mounting this
 * more than once (StrictMode, fast refresh) is harmless.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, X } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { getBot } from "@/lib/deriv/bots/registry";
import { autonomous, describeRun, AUTONOMOUS_BOT_ID, SMART_RECOVERY_TUNING, type AutoSnapshot } from "@/lib/deriv/bots/autonomous";

const DISMISS_MS = 12_000;

export function AutonomousTrading() {
  const [snap, setSnap] = useState<AutoSnapshot | null>(null);

  useEffect(() => {
    const ctl = autonomous();
    ctl.boot();
    return ctl.subscribe(setSnap);
  }, []);

  const shown = !!snap?.justActivated;

  // Confirm once, then let the controller forget it so a reload stays quiet.
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => autonomous().acknowledgeActivation(), DISMISS_MS);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown || !snap) return null;

  const cur = snap.currency || "USD";
  // Below the point where the Deriv minimum stake overrides the safe size, the
  // recovery ladder no longer fits the balance. Say so rather than imply a
  // safety margin that is not there.
  const meta = getBot(AUTONOMOUS_BOT_ID);
  const run = snap.balance != null && meta
    ? describeRun(snap.balance, meta.defaultMartingale, SMART_RECOVERY_TUNING)
    : null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] w-[min(360px,calc(100vw-2rem))] rounded-2xl border p-4 shadow-2xl"
      style={{ borderColor: "rgba(52,211,153,0.45)", background: TC.panel, color: TC.text }}
    >
      <button
        onClick={() => autonomous().acknowledgeActivation()}
        aria-label="Dismiss"
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
          <h3 className="text-[14px] font-bold" style={{ color: "#34d399" }}>
            Automated trading is on{snap.demo ? " (Demo)" : ""}
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
            Smart Recovery Differ will place {snap.demo ? "Demo" : "real"} trades on your Deriv account for you — sizing each
            run from your balance, aiming for {Math.round(SMART_RECOVERY_TUNING.profitTargetPct * 100)}%,
            then resting 90 minutes before the next one.
            {snap.balance != null && (
              <> Next run: <b style={{ color: TC.text }}>{snap.stake.toFixed(2)} {cur}</b> a trade,
              target <b style={{ color: TC.text }}>{snap.target.toFixed(2)} {cur}</b>.</>
            )}
          </p>
          {run && !run.bufferFits && (
            <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#f5c451" }}>
              At this balance the {SMART_RECOVERY_TUNING.minStake.toFixed(2)} {cur} minimum stake is larger than
              the size we would choose, so a long losing streak can use more than your balance.
              A run is steadier from about {run.safeFloor.toFixed(0)} {cur}.
            </p>
          )}
          <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: TC.faint }}>
            It runs while Clunoid is open in a tab. Open the bot any time to watch it or stop it.
          </p>
          <Link
            href={`/trading/deriv/bots/${AUTONOMOUS_BOT_ID}`}
            onClick={() => autonomous().acknowledgeActivation()}
            className="mt-3 inline-flex rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:opacity-90"
            style={{ background: "#34d399", color: TC.ink }}
          >
            View the bot
          </Link>
        </div>
      </div>
    </div>
  );
}
