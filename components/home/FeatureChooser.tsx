"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import type { Accent, FeatureDef } from "@/lib/features";

const PRIMARY: Record<Accent, string> = {
  clay: "bg-clay text-[#1F1E1C] hover:bg-clay-soft focus-visible:ring-clay/50",
  spark: "bg-spark text-[#1F1E1C] hover:bg-spark-soft focus-visible:ring-spark/50",
};
const CHIP: Record<Accent, string> = {
  clay: "bg-clay/15 text-clay",
  spark: "bg-spark/15 text-spark",
};

/**
 * Shown when a search looks like it's asking for a feature (Games, Stat Battle,
 * …). Lets the user open the feature with their query, or just run it as a
 * normal Isaac search. Driven entirely by the matched FeatureDef.
 *
 * Modal a11y: focus moves to the primary action on open, Tab is trapped inside
 * the dialog, Escape / backdrop close it, and focus is restored to the trigger.
 */
export function FeatureChooser({
  feature,
  query,
  onOpen,
  onSearch,
  onClose,
}: {
  feature: FeatureDef | null;
  query: string;
  onOpen: () => void;
  onSearch: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openBtnRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!feature) return;
    // Remember what to return focus to, then move focus into the dialog.
    restoreRef.current = (document.activeElement as HTMLElement) ?? null;
    const t = setTimeout(() => openBtnRef.current?.focus(), 20);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      // Restore focus to the trigger (no-op if we navigated away on "Open").
      restoreRef.current?.focus?.();
    };
  }, [feature]);

  const shown = query.length > 64 ? query.slice(0, 63).trimEnd() + "…" : query;

  return (
    <AnimatePresence>
      {feature && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feature-chooser-title"
            aria-describedby="feature-chooser-desc"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-soft"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-ink-faint outline-none transition hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-clay/50"
            >
              <X size={16} />
            </button>

            <span className={`grid h-11 w-11 place-items-center rounded-xl ${CHIP[feature.accent]}`}>
              <feature.Icon size={22} />
            </span>
            <h2 id="feature-chooser-title" className="mt-3 font-serif text-xl text-ink">
              Open {feature.label}?
            </h2>
            <p id="feature-chooser-desc" className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              <span className="text-ink">&ldquo;{shown}&rdquo;</span> looks like our {feature.label}. Open it with this,
              or just search?
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <button
                ref={openBtnRef}
                onClick={onOpen}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold outline-none transition focus-visible:ring-2 ${PRIMARY[feature.accent]}`}
              >
                <feature.Icon size={16} /> Open {feature.label}
              </button>
              <button
                onClick={onSearch}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-base px-4 py-3 text-sm font-medium text-ink outline-none transition hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-clay/50"
              >
                <Search size={16} /> Just search
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
