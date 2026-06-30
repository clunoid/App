"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { preflightStats } from "@/lib/stats/generate";

/** null = hidden · "checking" = verifying auth+credits · "success" = verified, green tick. */
export type GateState = null | "checking" | "success";

const OK_GREEN = "#7FB069"; // tailwind `ok` token — the auto-reload success green
const INK = "#2c2823";
const SEAL = "#8a2433";

/**
 * The bypass-proof PRE-FLIGHT gate for any stat-battle model request.
 *
 * `runGate(request, kind)` verifies — on the SERVER, with no AI and no charge — that the
 * user is authenticated AND can afford the build BEFORE the real (expensive Opus) request
 * is ever fired. It resolves to `true` ONLY when it is safe to proceed:
 *   • authed + enough credits  → shows the green success tick, then returns true
 *   • not authed / not enough  → raises the existing auth / credits popup, returns false
 *   • transient/unknown error  → returns true (the server route still atomically gates, so
 *                                no Opus can run without credits even if this check is skipped)
 * A `busy` ref blocks re-entry so the button can't be double-fired during verification.
 */
export function useStatGate() {
  const [gate, setGate] = useState<GateState>(null);
  const busy = useRef(false);

  const runGate = useCallback(async (request: string, kind: "generate" | "file" | "edit"): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setGate("checking");
    try {
      const pf = await preflightStats(request, kind);
      if (!pf.proceed) {
        setGate(null); // 401/402 — the auth / "not enough credits" popup is already up
        return false;
      }
      if (pf.verified) {
        setGate("success"); // positively verified → play the green tick before proceeding
        await new Promise((r) => setTimeout(r, 1500));
      }
      setGate(null);
      return true;
    } finally {
      busy.current = false;
    }
  }, []);

  return { gate, runGate };
}

/**
 * The verify / success popup, styled to the stat-battle "document" material (warm cream
 * paper, ink #2c2823, seal red accent) with the auto-reload card's green edges on success
 * and a draw-on animated green tick. Pure CSS animations (no framer-motion → keeps the
 * /stats bundle lean). Render it once per host component; drive it with `useStatGate`.
 */
export function StatGate({ state }: { state: GateState }) {
  if (!state) return null;
  const success = state === "success";
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4 backdrop-blur-sm sg-fade" aria-live="polite" role="status">
      <style>{CSS}</style>
      <div
        className={[
          "sg-pop w-full max-w-sm rounded-2xl bg-[#f5f1e8] p-7 text-center",
          success
            ? "border border-ok ring-2 ring-ok/25 shadow-[0_10px_30px_-14px_rgba(16,185,129,0.45)]"
            : "border border-[#2c2823]/15 shadow-[0_14px_40px_-18px_rgba(44,40,35,0.55)]",
        ].join(" ")}
      >
        {success ? (
          <>
            <div
              className="sg-ring mx-auto grid h-20 w-20 place-items-center rounded-full"
              style={{ background: "rgba(127,176,105,0.16)", boxShadow: "0 0 0 8px rgba(127,176,105,0.08)" }}
            >
              <svg viewBox="0 0 52 52" className="h-12 w-12" aria-hidden="true">
                <circle className="sg-circle" cx="26" cy="26" r="23" fill="none" stroke={OK_GREEN} strokeWidth="3" />
                <path
                  className="sg-check"
                  d="M15 27 l7.5 7.5 L38 18"
                  fill="none"
                  stroke={OK_GREEN}
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-xl font-extrabold" style={{ color: INK }}>
              You&rsquo;re all set
            </h3>
            <p className="mt-1.5 text-sm font-semibold" style={{ color: "rgba(44,40,35,0.65)" }}>
              Verified — starting your stat battle…
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full" style={{ background: "rgba(44,40,35,0.07)" }}>
              <Loader2 size={30} className="animate-spin" style={{ color: SEAL }} />
            </div>
            <h3 className="mt-4 text-xl font-extrabold" style={{ color: INK }}>
              Verifying access…
            </h3>
            <p className="mt-1.5 text-sm font-semibold" style={{ color: "rgba(44,40,35,0.65)" }}>
              Checking you&rsquo;re signed in and have enough power for this stat battle.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Scoped keyframes: backdrop fade, card pop-in, success ring pop, and the draw-on tick
// (stroke-dashoffset → 0 for the circle then the check). Self-contained so no global CSS
// or animation library is needed.
const CSS = `
@keyframes sgFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes sgPop { from { opacity: 0; transform: translateY(12px) scale(.94) } to { opacity: 1; transform: none } }
@keyframes sgRing { from { transform: scale(.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
@keyframes sgDraw { to { stroke-dashoffset: 0 } }
.sg-fade { animation: sgFade .18s ease-out both }
.sg-pop { animation: sgPop .26s cubic-bezier(.22,1,.36,1) both }
.sg-ring { animation: sgRing .3s cubic-bezier(.22,1,.36,1) both }
.sg-circle { stroke-dasharray: 150; stroke-dashoffset: 150; animation: sgDraw .5s ease-out forwards }
.sg-check { stroke-dasharray: 48; stroke-dashoffset: 48; animation: sgDraw .35s ease-out .45s forwards }
@media (prefers-reduced-motion: reduce) {
  .sg-fade, .sg-pop, .sg-ring { animation-duration: .01ms }
  .sg-circle, .sg-check { stroke-dashoffset: 0; animation: none }
}
`;
