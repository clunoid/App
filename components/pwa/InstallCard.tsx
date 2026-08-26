"use client";

/**
 * THE INSTALL CARD — it drops in from the top and stays there.
 *
 * A banner pinned to the top of the viewport, which is where somebody's eye
 * already is when a page finishes loading. It arrives a beat late on purpose:
 * sliding in during the first paint reads as a page glitch rather than as an
 * offer, and a card that lands while somebody is still deciding where to look
 * gets dismissed reflexively.
 *
 * It only ever appears when installing is genuinely possible — Chromium having
 * fired the event, or iOS where the instructions are the whole answer. On
 * Firefox desktop and inside an installed window it renders nothing.
 *
 * Closing it is remembered for 30 days, and shared with the Install button
 * through lib/pwa/install, so dismissing here does not leave the same offer
 * sitting somewhere else on the page.
 *
 * The animation is a transform and an opacity, nothing else — those are the two
 * properties a browser can animate without touching layout, which is what keeps
 * it smooth on a cheap phone. It is skipped entirely for anybody who has asked
 * their system for reduced motion.
 */

import { useCallback, useEffect, useState } from "react";
import { Download, Share, Plus, X, Zap } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { useInstall } from "@/components/pwa/useInstall";
import { promptInstall, snooze } from "@/lib/pwa/install";

/** Long enough that the page has settled, short enough to still be noticed. */
const ARRIVE_AFTER_MS = 1400;

export function InstallCard() {
  const { mode } = useInstall();
  const [mounted, setMounted] = useState(false);   // in the DOM
  const [shown, setShown] = useState(false);       // slid down
  const [howTo, setHowTo] = useState(false);       // iOS steps open

  useEffect(() => {
    if (mode === "none") { setMounted(false); setShown(false); return; }

    setMounted(true);
    // It goes into the DOM at -130% and sits there for the delay, which means
    // the browser has long since painted that position by the time the class
    // flips - so it transitions rather than jumping. No requestAnimationFrame:
    // that does not run in a background tab, and a page opened in one would
    // have sat un-animated until somebody looked at it.
    const t = setTimeout(() => setShown(true), ARRIVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [mode]);

  const close = useCallback((remember: boolean) => {
    setShown(false);
    if (remember) snooze();
    // Let it slide back out before it leaves the DOM.
    setTimeout(() => setMounted(false), 380);
  }, []);

  const act = useCallback(async () => {
    if (mode === "ios") { setHowTo(true); return; }
    const outcome = await promptInstall();
    if (outcome) close(false);
  }, [mode, close]);

  if (!mounted) return null;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-3 sm:px-4 sm:pt-4"
        aria-live="polite"
      >
        <div
          role="dialog"
          aria-label="Install Clunoid"
          className="cln-install-card pointer-events-auto w-full max-w-[560px] overflow-hidden rounded-2xl border"
          data-shown={shown ? "true" : "false"}
          style={{
            borderColor: TC.line,
            background:
              "radial-gradient(120% 160% at 0% 0%, rgba(56,189,248,0.16), transparent 62%), rgba(12,17,26,0.94)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <div className="flex items-center gap-3 p-3 sm:gap-3.5 sm:p-3.5">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11"
              style={{ background: "rgba(56,189,248,0.14)" }}
            >
              <Zap size={19} style={{ color: TC.profit }} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold sm:text-[15px]" style={{ color: TC.text }}>
                Install Clunoid Trading
              </p>
              <p className="mt-0.5 text-[12px] leading-snug sm:text-[12.5px]" style={{ color: TC.muted }}>
                {mode === "ios"
                  ? "Add it to your home screen — two taps, nothing to download."
                  : "Full screen, one tap from your home screen. Free, no download."}
              </p>
            </div>

            <button
              type="button"
              onClick={act}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold transition hover:brightness-110 active:scale-[0.98] sm:px-4 sm:py-2.5 sm:text-[13.5px]"
              style={{ background: "linear-gradient(135deg,#38bdf8,#0ea5e9)", color: "#04202e" }}
            >
              <Download size={15} />
              <span className="max-[340px]:hidden">Install</span>
            </button>

            <button
              type="button"
              onClick={() => close(true)}
              aria-label="Not now"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-white/10"
              style={{ color: TC.faint }}
            >
              <X size={15} />
            </button>
          </div>

          {/* iOS cannot be prompted, so it gets told — inside the same card, so
              nothing jumps or covers the screen. */}
          {howTo && (
            <div className="border-t px-3.5 pb-3.5 pt-3" style={{ borderColor: TC.line }}>
              <ol className="list-none space-y-2.5 p-0 text-[12.5px]" style={{ color: TC.muted }}>
                <li className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(56,189,248,0.14)" }}>
                    <Share size={13} style={{ color: TC.profit }} />
                  </span>
                  Tap <b style={{ color: TC.text }}>Share</b> at the bottom of Safari.
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(56,189,248,0.14)" }}>
                    <Plus size={13} style={{ color: TC.profit }} />
                  </span>
                  Choose <b style={{ color: TC.text }}>Add to Home Screen</b>, then <b style={{ color: TC.text }}>Add</b>.
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .cln-install-card {
          transform: translateY(-130%);
          opacity: 0;
          /* A touch of overshoot on the way in so it settles rather than stops
             dead; a plain ease on the way out because leaving should not perform. */
          transition:
            transform 460ms cubic-bezier(0.16, 1.02, 0.30, 1.06),
            opacity 260ms ease;
          will-change: transform, opacity;
        }
        .cln-install-card[data-shown="true"] { transform: translateY(0); opacity: 1; }
        @media (prefers-reduced-motion: reduce) {
          .cln-install-card { transition: opacity 160ms linear; transform: none; }
          .cln-install-card[data-shown="false"] { opacity: 0; }
        }
      `}</style>
    </>
  );
}
