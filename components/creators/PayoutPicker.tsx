"use client";

/**
 * CREATOR PROGRAM — choosing a payout rail.
 *
 * Seven radio cards took a whole grid at every width and pushed the rest of the
 * form off a phone screen. One dropdown behaves the same everywhere and keeps
 * the brand mark, which is the part people actually scan for.
 *
 * Choosing here is optional at registration — the reminder to set it lives on
 * the dashboard, because a payout rail matters at payout time, not at sign-up.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Wallet } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { PAYOUTS } from "./content";

export function PayoutPicker({
  value,
  onChange,
  accent,
  placeholder = "Choose how you want to be paid",
}: {
  value: string;
  onChange: (v: string) => void;
  accent: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const chosen = PAYOUTS.find((p) => p.key === value) ?? null;

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, PAYOUTS.findIndex((p) => p.key === value)));
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, value]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    (listRef.current.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(k: string) {
    onChange(k);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, PAYOUTS.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(PAYOUTS[active].key); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Payout method"
        className="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13.5px] outline-none transition focus:border-violet-400"
        style={{ borderColor: open || chosen ? accent : TC.line, background: "rgba(0,0,0,0.25)", color: chosen ? TC.text : TC.faint }}
      >
        {chosen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chosen.logo} alt="" aria-hidden className="h-5 w-5 shrink-0" />
        ) : (
          <Wallet size={16} className="shrink-0" style={{ color: TC.faint }} />
        )}
        <span className="min-w-0 flex-1 truncate">{chosen ? chosen.label : placeholder}</span>
        <ChevronDown size={15} className="shrink-0 transition" style={{ color: TC.faint, transform: open ? "rotate(180deg)" : undefined }} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl border"
          style={{ borderColor: TC.line, background: "#171a1f", boxShadow: "0 20px 50px rgba(0,0,0,.6)" }}
        >
          <ul ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {PAYOUTS.map((p, i) => {
              const sel = p.key === value;
              return (
                <li key={p.key} role="option" aria-selected={sel}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(p.key)}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition"
                    style={{ background: i === active ? "rgba(255,255,255,0.06)" : "transparent", color: sel ? accent : TC.text }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.logo} alt="" aria-hidden className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{p.label}</span>
                    {sel && <Check size={14} className="shrink-0" style={{ color: accent }} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
