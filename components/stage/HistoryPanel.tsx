"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, History, Trash2, ChevronRight } from "lucide-react";
import { useClunoid } from "@/lib/store/useClunoid";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const KIND: Record<string, string> = {
  explainer: "Search",
  rich_card: "Answer",
};

/**
 * Full-screen history — every past request, most recent first, each a link that
 * reopens the result exactly as it appeared (cards, media).
 */
export function HistoryPanel() {
  const open = useClunoid((s) => s.historyOpen);
  const log = useClunoid((s) => s.historyLog);
  const close = useClunoid((s) => s.closeHistory);
  const restore = useClunoid((s) => s.restoreHistory);
  const remove = useClunoid((s) => s.deleteHistory);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-base/95 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2 font-serif text-xl text-ink">
              <History size={20} className="text-clay" /> History
            </div>
            <button
              onClick={close}
              className="grid h-9 w-9 place-items-center rounded-full text-ink-faint transition hover:bg-surface hover:text-ink"
              aria-label="Close history"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-2 overflow-y-auto p-4 sm:p-6">
            {log.length === 0 ? (
              <p className="mt-24 text-center text-ink-muted">
                Nothing here yet — ask Isaac anything and it&apos;ll appear here.
              </p>
            ) : (
              log.map((h) => (
                <motion.div
                  key={h.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="group flex items-center gap-2 rounded-2xl border border-border bg-surface/80 p-4 transition hover:border-clay/50 hover:bg-surface-2"
                >
                  <button onClick={() => restore(h.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ink">{h.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-ink-faint">
                        {KIND[h.experience.type] && (
                          <span className="rounded-full bg-clay/15 px-2 py-0.5 font-medium text-clay">
                            {KIND[h.experience.type]}
                          </span>
                        )}
                        <span>{relTime(h.createdAt)}</span>
                      </div>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-ink-faint transition group-hover:text-clay" />
                  </button>
                  <button
                    onClick={() => remove(h.id)}
                    className="shrink-0 rounded-lg p-2 text-ink-faint opacity-0 transition hover:bg-bad/15 hover:text-bad group-hover:opacity-100"
                    aria-label="Delete from history"
                  >
                    <Trash2 size={16} />
                  </button>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
