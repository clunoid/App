"use client";

/**
 * COUNTRY PICKER — type to filter, click or key to choose.
 *
 * A native datalist was doing this before, but the browser draws that list
 * itself: a white popup with system fonts, ignoring the dark theme, and behaving
 * differently in every browser. This is the same interaction — type or pick —
 * drawn in our own styling, keyboard-navigable, with every country still there.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { COUNTRIES } from "./countries";

export function CountryPicker({
  value,
  onChange,
  accent,
}: {
  value: string;
  onChange: (v: string) => void;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES as readonly string[];
    // Names that start with what was typed come first — typing "in" should offer
    // India before Argentina.
    const starts: string[] = [];
    const contains: string[] = [];
    for (const c of COUNTRIES) {
      const l = c.toLowerCase();
      if (l.startsWith(q)) starts.push(c);
      else if (l.includes(q)) contains.push(c);
    }
    return [...starts, ...contains];
  }, [query]);

  useEffect(() => setActive(0), [query]);

  // Close when the click lands outside.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Keep the highlighted row in view while arrowing through 199 of them.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(c: string) {
    onChange(c);
    setQuery("");
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (matches[active]) choose(matches[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div ref={boxRef} className="relative">
      {/* Holds the chosen value for native form validation without being typed into. */}
      <input type="text" required value={value} onChange={() => {}} tabIndex={-1} aria-hidden
        className="pointer-events-none absolute h-0 w-0 opacity-0" />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13.5px] outline-none transition focus:border-violet-400"
        style={{ borderColor: open ? accent : TC.line, background: "rgba(0,0,0,0.25)", color: value ? TC.text : TC.faint }}
      >
        <span className="min-w-0 flex-1 truncate">{value || "Type or pick your country"}</span>
        <ChevronDown size={15} className="shrink-0 transition" style={{ color: TC.faint, transform: open ? "rotate(180deg)" : undefined }} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl border shadow-2xl"
          style={{ borderColor: TC.line, background: "#171a1f", boxShadow: "0 20px 50px rgba(0,0,0,.6)" }}>
          <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: TC.line }}>
            <Search size={14} style={{ color: TC.faint }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search countries"
              aria-label="Search countries"
              className="w-full bg-transparent text-[13.5px] outline-none"
              style={{ color: TC.text }}
            />
          </div>

          <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-3 py-2.5 text-[12.5px]" style={{ color: TC.faint }}>No country matches that.</li>
            )}
            {matches.map((c, i) => {
              const sel = c === value;
              return (
                <li key={c} role="option" aria-selected={sel}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(c)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition"
                    style={{ background: i === active ? "rgba(255,255,255,0.06)" : "transparent", color: sel ? accent : TC.text }}
                  >
                    <span className="min-w-0 flex-1 truncate">{c}</span>
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
