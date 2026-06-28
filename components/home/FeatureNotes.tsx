"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { FEATURES, type Accent } from "@/lib/features";

/** Literal class sets per accent (kept literal so Tailwind keeps them on purge). */
const ACCENT: Record<Accent, { tape: string; chip: string; arrow: string; glow: string; hoverBorder: string }> = {
  clay: {
    tape: "bg-clay/35",
    chip: "bg-clay/15 text-clay",
    arrow: "text-clay-soft",
    glow: "hover:shadow-glow",
    hoverBorder: "hover:border-clay/60",
  },
  spark: {
    tape: "bg-spark/35",
    chip: "bg-spark/15 text-spark",
    arrow: "text-spark-soft",
    glow: "hover:shadow-glow-blue",
    hoverBorder: "hover:border-spark/60",
  },
};

/**
 * Two modern "sticky notes" on the home Stage — one per feature. They sit a
 * touch askew with a strip of tape, straighten and lift on hover, and open the
 * feature (same as the header buttons). Driven by the FEATURES registry, so new
 * features appear here automatically.
 *
 * The entrance animation lives on the wrapper and the tilt/hover transform on
 * the inner card — kept on separate elements so the (fill-mode) fade-up doesn't
 * clobber the card's resting tilt or hover lift.
 */
export function FeatureNotes() {
  return (
    <div className="mt-8 grid w-full max-w-md grid-cols-2 gap-3 sm:gap-4">
      {FEATURES.map((f, i) => {
        const a = ACCENT[f.accent];
        const tilt = i % 2 === 0 ? "-rotate-1" : "rotate-1";
        return (
          <div key={f.id} className="animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
            <Link
              href={f.hub}
              aria-label={`Open ${f.label}`}
              className={`group relative flex h-full flex-col rounded-2xl border border-border bg-surface-2/90 p-4 text-left shadow-soft backdrop-blur transition-all duration-200 will-change-transform sm:p-5 ${tilt} ${a.hoverBorder} ${a.glow} hover:-translate-y-1 hover:rotate-0`}
            >
              {/* a slip of tape across the top */}
              <span
                aria-hidden
                className={`absolute -top-2 left-1/2 h-3.5 w-14 -translate-x-1/2 -rotate-1 rounded-[3px] ${a.tape} shadow-sm transition-transform duration-200 group-hover:rotate-0`}
              />
              <span className={`grid h-9 w-9 place-items-center rounded-xl ${a.chip}`}>
                <f.Icon size={18} />
              </span>
              <span className="mt-3 font-serif text-base text-ink sm:text-lg">{f.label}</span>
              <span className="mt-1 text-xs leading-snug text-ink-muted sm:text-[13px]">{f.note}</span>
              <span className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${a.arrow}`}>
                Open
                <ArrowUpRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
