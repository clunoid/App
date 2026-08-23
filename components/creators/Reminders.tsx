"use client";

/**
 * CREATOR PROGRAM — the reminders, in point form.
 *
 * The same list on the sign-up page and on the dashboard, so nobody can say they
 * joined without knowing, and nobody has to remember it from a page they read
 * once. Numbered rather than bulleted because people refer to them by number
 * when they ask us questions.
 */

import { AlertCircle } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { A, REMINDERS } from "./content";

export function Reminders({ title = "Read this before you post", className = "" }: { title?: string; className?: string }) {
  return (
    <section className={"rounded-2xl border p-4 sm:p-5 " + className}
      style={{ borderColor: `${A}55`, background: `linear-gradient(180deg, ${A}10, rgba(255,255,255,0.015))` }}>
      <h2 className="flex items-center gap-2 text-[15px] font-bold sm:text-[16px]">
        <AlertCircle size={16} style={{ color: A }} /> {title}
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
        {REMINDERS.length} things. Get these right and the rest takes care of itself.
      </p>

      <ol className="mt-4 space-y-3">
        {REMINDERS.map((r, i) => (
          <li key={r.t} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11.5px] font-bold"
              style={{ background: `${A}22`, color: A, boxShadow: `inset 0 0 0 1px ${A}44` }}>
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold">{r.t}</div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>{r.d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
