"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { preflightGraphics, type GraphicsGateReason } from "@/lib/graphics/generate";

/** null = hidden · "checking" = verifying auth+access+credits · "success" = verified. */
export type GraphicsGateState = null | "checking" | "success";

const OK_GREEN = "#7FB069"; // the auto-reload success green
const INK = "#2c2823";
const ACCENT = "#6d28d9"; // motion-graphics violet (matches the studio accent)

export type GateOutcome = { ok: boolean; reason?: GraphicsGateReason };

/**
 * The bypass-proof PRE-FLIGHT gate for a Motion Graphics generation.
 *
 * `runGate(request, durationSec)` verifies — on the SERVER, with no AI and no charge —
 * that the user is authenticated, has plan/credit ACCESS, AND can afford this length,
 * BEFORE the expensive Opus planner is ever fired. It resolves ONLY when it is safe to
 * proceed:
 *   • authed + access + affordable → shows the green success tick, then { ok: true }
 *   • blocked (401/402 plan|credits) → { ok: false, reason } so the caller shows the
 *                                       exact auth / upgrade / credits message
 *   • transient/unknown error       → { ok: true } (the plan route still atomically
 *                                       charges, so no Opus can run unpaid even if this
 *                                       advisory check is skipped)
 * A `busy` ref blocks re-entry so the button can't be double-fired during verification
 * (closing the double-charge window the plain `planning` flag left open).
 */
export function useGraphicsGate() {
  const [gate, setGate] = useState<GraphicsGateState>(null);
  const busy = useRef(false);

  const runGate = useCallback(async (request: string, durationSec: number): Promise<GateOutcome> => {
    if (busy.current) return { ok: false };
    busy.current = true;
    setGate("checking");
    try {
      const pf = await preflightGraphics(request, durationSec);
      if (!pf.ok) {
        setGate(null); // caller raises the auth / upgrade / credits popup
        return { ok: false, reason: pf.reason };
      }
      setGate("success"); // positively verified → play the green tick before proceeding
      await new Promise((r) => setTimeout(r, 1400));
      setGate(null);
      return { ok: true };
    } finally {
      busy.current = false;
    }
  }, []);

  return { gate, runGate };
}

/**
 * The verify / success popup, styled to the studio's "document" material (warm paper,
 * ink #2c2823) with a violet checking spinner and the auto-reload card's green edges +
 * draw-on tick on success. Pure CSS animations (no animation library). Render it once
 * per host component and drive it with `useGraphicsGate`.
 */
export function GraphicsGate({ state }: { state: GraphicsGateState }) {
  if (!state) return null;
  const success = state === "success";
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4 backdrop-blur-sm gg-fade" aria-live="polite" role="status">
      <style>{CSS}</style>
      <div
        className={[
          "gg-pop w-full max-w-sm rounded-2xl bg-[#f5f1e8] p-7 text-center",
          success
            ? "border border-[#7FB069] ring-2 ring-[#7FB069]/25 shadow-[0_10px_30px_-14px_rgba(16,185,129,0.45)]"
            : "border border-[#2c2823]/15 shadow-[0_14px_40px_-18px_rgba(44,40,35,0.55)]",
        ].join(" ")}
      >
        {success ? (
          <>
            <div className="gg-ring mx-auto grid h-20 w-20 place-items-center rounded-full" style={{ background: "rgba(127,176,105,0.16)", boxShadow: "0 0 0 8px rgba(127,176,105,0.08)" }}>
              <svg viewBox="0 0 52 52" className="h-12 w-12" aria-hidden="true">
                <circle className="gg-circle" cx="26" cy="26" r="23" fill="none" stroke={OK_GREEN} strokeWidth="3" />
                <path className="gg-check" d="M15 27 l7.5 7.5 L38 18" fill="none" stroke={OK_GREEN} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="mt-4 text-xl font-extrabold" style={{ color: INK }}>You&rsquo;re all set</h3>
            <p className="mt-1.5 text-sm font-semibold" style={{ color: "rgba(44,40,35,0.65)" }}>Verified — designing your video…</p>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full" style={{ background: "rgba(109,40,217,0.10)" }}>
              <Loader2 size={30} className="animate-spin" style={{ color: ACCENT }} />
            </div>
            <h3 className="mt-4 text-xl font-extrabold" style={{ color: INK }}>Verifying access…</h3>
            <p className="mt-1.5 text-sm font-semibold" style={{ color: "rgba(44,40,35,0.65)" }}>Checking you&rsquo;re signed in and have enough power for this video.</p>
          </>
        )}
      </div>
    </div>
  );
}

// Scoped keyframes: backdrop fade, card pop-in, success ring pop, and the draw-on tick.
const CSS = `
@keyframes ggFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ggPop { from { opacity: 0; transform: translateY(12px) scale(.94) } to { opacity: 1; transform: none } }
@keyframes ggRing { from { transform: scale(.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
@keyframes ggDraw { to { stroke-dashoffset: 0 } }
.gg-fade { animation: ggFade .18s ease-out both }
.gg-pop { animation: ggPop .26s cubic-bezier(.22,1,.36,1) both }
.gg-ring { animation: ggRing .3s cubic-bezier(.22,1,.36,1) both }
.gg-circle { stroke-dasharray: 150; stroke-dashoffset: 150; animation: ggDraw .5s ease-out forwards }
.gg-check { stroke-dasharray: 48; stroke-dashoffset: 48; animation: ggDraw .35s ease-out .45s forwards }
@media (prefers-reduced-motion: reduce) {
  .gg-fade, .gg-pop, .gg-ring { animation-duration: .01ms }
  .gg-circle, .gg-check { stroke-dashoffset: 0; animation: none }
}
`;
