"use client";

/**
 * CREATOR PROGRAM — telling people it worked.
 *
 * Two kinds of confirmation, because they answer different questions:
 *
 *   · FieldOk sits under a control and answers "did that register?" the instant
 *     something is chosen. No waiting, no network.
 *   · useToast answers "did that save?" after a round trip, and slides in at the
 *     bottom where it cannot push the layout around mid-form.
 *
 * Both are deliberately quiet. A confirmation that shouts every time someone
 * ticks a box stops being read.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import { GOOD, BAD } from "./content";

/** Inline "that worked" line under a field. */
export function FieldOk({ children, tone = "ok" }: { children: React.ReactNode; tone?: "ok" | "bad" }) {
  const c = tone === "ok" ? GOOD : BAD;
  return (
    <span className="cln-fieldok flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: c }}>
      {tone === "ok" ? <Check size={12} className="shrink-0" /> : <CircleAlert size={12} className="shrink-0" />}
      {children}
    </span>
  );
}

export type ToastTone = "ok" | "bad";

/**
 * A single transient message. Returns the node to drop at the end of the page
 * and a `show` to call when something completes.
 */
export function useToast() {
  const [msg, setMsg] = useState<{ id: number; text: string; tone: ToastTone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const show = useCallback((text: string, tone: ToastTone = "ok") => {
    // A fresh id restarts the animation even when the text is identical, so two
    // saves in a row both visibly confirm.
    setMsg({ id: Date.now(), text, tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2800);
  }, []);

  const node = (
    <>
      <style>{`
        @keyframes clnToastIn {
          0%   { opacity: 0; transform: translate3d(-50%, 14px, 0) scale(.96); }
          60%  { opacity: 1; transform: translate3d(-50%, -3px, 0) scale(1.01); }
          100% { opacity: 1; transform: translate3d(-50%, 0, 0) scale(1); }
        }
        @keyframes clnFieldOkIn {
          0%   { opacity: 0; transform: translate3d(-6px, 0, 0); }
          100% { opacity: 1; transform: none; }
        }
        .cln-toast   { animation: clnToastIn .34s cubic-bezier(.22,1.2,.36,1) both; }
        .cln-fieldok { animation: clnFieldOkIn .22s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .cln-toast, .cln-fieldok { animation: none; }
        }
      `}</style>

      {msg && (
        <div
          key={msg.id}
          role="status"
          aria-live="polite"
          className="cln-toast pointer-events-none fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold"
          style={{
            background: msg.tone === "ok" ? "#0f2a20" : "#2b1119",
            color: msg.tone === "ok" ? GOOD : BAD,
            boxShadow: `0 10px 34px rgba(0,0,0,.55), inset 0 0 0 1px ${msg.tone === "ok" ? GOOD : BAD}66`,
          }}
        >
          {msg.tone === "ok" ? <Check size={15} className="shrink-0" /> : <CircleAlert size={15} className="shrink-0" />}
          <span className="min-w-0">{msg.text}</span>
        </div>
      )}
    </>
  );

  return { show, node };
}
