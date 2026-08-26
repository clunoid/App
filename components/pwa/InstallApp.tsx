"use client";

/**
 * "Install app".
 *
 * Installing is a browser feature, not a page feature, and every browser
 * exposes it differently. This does the honest version of all three cases:
 *
 *   Chrome, Edge, Samsung, Opera (Android and desktop)
 *     They fire `beforeinstallprompt`. We catch it, keep it, and show a button
 *     that calls it. This is the only case where a click really installs.
 *
 *   iOS and iPadOS — any browser
 *     There is no `beforeinstallprompt` on iOS. Installing is Share → Add to
 *     Home Screen and nothing a page does can trigger it, so the button opens
 *     short instructions instead of pretending to install.
 *
 *   Firefox desktop, and anything else
 *     No install path at all. The button never appears — offering one that
 *     cannot work is worse than offering nothing.
 *
 * Already installed? Nothing renders. `display-mode: standalone` is true inside
 * an installed window, and `navigator.standalone` is the iOS equivalent.
 *
 * Dismissing hides it for 30 days. Somebody who has said no does not need to be
 * asked again on their next visit.
 */

import { useCallback, useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";
import { TC } from "@/lib/trading/theme";

const SNOOZE_KEY = "cln_install_snoozed";
const SNOOZE_DAYS = 30;

/** The event Chromium fires. Not in lib.dom yet, so it is spelled out here. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function snoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400_000));
  } catch { /* private mode: this visit only */ }
}

/** Inside an installed window there is nothing left to offer. */
function alreadyInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !!standalone || iosStandalone;
}

function isApple(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, so the touch check is what catches it.
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadDesktopUA = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadDesktopUA;
}

export function InstallApp({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [gone, setGone] = useState(true);

  useEffect(() => {
    if (alreadyInstalled() || snoozed()) return;

    // iOS can be offered instructions straight away — there is no event coming.
    if (isApple()) {
      setIos(true);
      setGone(false);
      return;
    }

    const onPrompt = (e: Event) => {
      // Without this Chrome shows its own mini-infobar instead of letting us
      // choose the moment.
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
      setGone(false);
    };
    const onInstalled = () => { setGone(true); setPrompt(null); };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (ios) { setShowHow(true); return; }
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // The event is single-use either way.
    setPrompt(null);
    if (outcome === "accepted") setGone(true);
    else { snooze(); setGone(true); }
  }, [ios, prompt]);

  if (gone) return null;

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
              onClick={() => { snooze(); setShowHow(false); setGone(true); }}
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
