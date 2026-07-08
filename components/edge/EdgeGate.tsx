"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

/**
 * The Edge access gate banner. Shown when the signed-in user isn't entitled (no
 * Pro/Max subscription and no purchased credits) — the inputs and tool connections
 * are disabled around it, so they can only view fixtures until they subscribe or add
 * credits. The real enforcement is server-side on every /api/edge/* route; this is
 * the visible, bypass-proof-in-practice UI half.
 */
export function EdgeGateBanner({ compact = false }: { compact?: boolean } = {}) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.06)" }}>
      <div className="flex items-start gap-3">
        <Lock size={18} className="mt-0.5 shrink-0" style={{ color: "#34d399" }} />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold" style={{ color: "#f3f6f4" }}>Edge is a Pro feature</p>
          <p className="mt-1 text-[12.5px]" style={{ color: "#9aa5a0" }}>
            {compact
              ? "Subscribe to Pro or Max, or add credits, to generate prediction videos."
              : "Subscribe to Pro or Max — or add credits — to run AI predictions and generate videos. Every use is charged from your credits. You can still browse fixtures below."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/pricing" className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition hover:brightness-110" style={{ background: "#34d399", color: "#0a0c0d" }}>Subscribe</Link>
            <Link href="/pricing" className="rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition hover:border-white/30" style={{ borderColor: "rgba(255,255,255,0.15)", color: "#f3f6f4" }}>Add credits</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
