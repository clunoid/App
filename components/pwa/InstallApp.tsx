"use client";

/**
 * "Install app" — the inline button.
 *
 * The same offer as InstallCard, in a form that sits inside a page rather than
 * dropping over it. Both read one shared store (lib/pwa/install), because
 * `beforeinstallprompt` fires once and its event is single-use: two components
 * each holding their own copy is how you end up calling prompt() on a spent
 * one. Dismissing either hides both, for 30 days.
 *
 * Renders nothing where installing is impossible — Firefox desktop, or inside
 * an already-installed window. On iOS it opens the Share instructions, because
 * no API on earth can install from a page there.
 */

import { useCallback, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { useInstall } from "@/components/pwa/useInstall";
import { promptInstall, snooze } from "@/lib/pwa/install";

export function InstallApp({ className = "" }: { className?: string }) {
  const { mode } = useInstall();
  const [showHow, setShowHow] = useState(false);

  const install = useCallback(async () => {
    if (mode === "ios") { setShowHow(true); return; }
    await promptInstall();
  }, [mode]);

  if (mode === "none") return null;

  return (
    <>
      <button
        type="button"
        onClick={install}
        className={
          "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition hover:bg-white/5 " +
          className
        }
        style={{ borderColor: TC.line, color: TC.text, background: "rgba(255,255,255,0.03)" }}
      >
        <Download size={15} style={{ color: TC.profit }} />
        Install app
      </button>

      {showHow && (
        <div
          role="dialog"
          aria-label="How to install"
          className="fixed inset-0 z-[95] grid place-items-end sm:place-items-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setShowHow(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-t-2xl border p-5 sm:rounded-2xl"
            style={{ borderColor: TC.line, background: TC.panelSolid, color: TC.text }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <h3 className="flex-1 text-[16px] font-bold">Add Clunoid to your home screen</h3>
              <button
                type="button"
                onClick={() => setShowHow(false)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-lg transition hover:bg-white/10"
                style={{ color: TC.muted }}
              >
                <X size={15} />
              </button>
            </div>

            <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
              iPhone and iPad do not let a website install itself, so it takes two taps in Safari.
            </p>

            <ol className="mt-4 list-none space-y-3 p-0 text-[13.5px]" style={{ color: TC.muted }}>
              <li className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(56,189,248,0.14)" }}>
                  <Share size={14} style={{ color: TC.profit }} />
                </span>
                Tap the <b style={{ color: TC.text }}>Share</b> button at the bottom of Safari.
              </li>
              <li className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(56,189,248,0.14)" }}>
                  <Plus size={14} style={{ color: TC.profit }} />
                </span>
                Choose <b style={{ color: TC.text }}>Add to Home Screen</b>, then <b style={{ color: TC.text }}>Add</b>.
              </li>
            </ol>

            <button
              type="button"
              onClick={() => { snooze(); setShowHow(false); }}
              className="mt-5 w-full rounded-xl border py-2.5 text-[13px] font-medium transition hover:bg-white/5"
              style={{ borderColor: TC.line, color: TC.muted }}
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
