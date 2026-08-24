"use client";

/**
 * CREATOR PROGRAM — choosing where you post, and your handle on each.
 *
 * Three platforms, picked by the creator. Instagram, TikTok and YouTube are the
 * default because they have the reach, but a creator in a country where one of
 * them is banned has to be able to swap it out rather than be locked out.
 *
 * The layout follows from that: the three you picked are rows you can type into,
 * and everything you did not pick sits in one dropdown that is always there.
 * Remove a row and that platform goes back into the dropdown; pick from the
 * dropdown and it becomes a row. There is never a wall of ten options to scan,
 * and changing your mind never means hunting for a way to do it.
 *
 * Picking a fourth while three are chosen swaps rather than refuses. It drops a
 * platform with no handle typed in first, so a swap never quietly throws away
 * something the creator filled in.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, X, Plus } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { PLATFORM_CATALOGUE, PLATFORMS_REQUIRED, platformInfo } from "./content";
import { FieldOk } from "./Feedback";

export function PlatformPicker({
  platforms,
  handles,
  onPlatforms,
  onHandle,
  accent,
  showHandles = true,
  savedHandles,
  columns = false,
}: {
  platforms: string[];
  handles: Record<string, string>;
  onPlatforms: (next: string[]) => void;
  onHandle: (platform: string, value: string) => void;
  accent: string;
  /** The start card asks for handles; a read-only summary would not. */
  showHandles?: boolean;
  /** What is actually stored, so the row can say "not saved yet". */
  savedHandles?: Record<string, string | null>;
  /** Lay the rows out side by side where there is room, instead of stacked. */
  columns?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const available = PLATFORM_CATALOGUE.filter((p) => !platforms.includes(p.key));
  const full = platforms.length >= PLATFORMS_REQUIRED;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function add(key: string) {
    setOpen(false);
    if (!full) {
      onPlatforms([...platforms, key]);
      return;
    }
    // Already at three: swap. Drop one they have not typed a handle for, and
    // only fall back to the last row when every one of them is filled in.
    const empty = platforms.find((p) => !(handles[p] ?? "").trim());
    const victim = empty ?? platforms[platforms.length - 1];
    onPlatforms(platforms.map((p) => (p === victim ? key : p)));
  }

  function remove(key: string) {
    onPlatforms(platforms.filter((p) => p !== key));
  }

  return (
    <div className="space-y-2.5">
      {/* ── the three you post on ─────────────────────────────────────────── */}
      <div className={columns ? "grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2.5"}>
      {platforms.map((key) => {
        const p = platformInfo(key);
        if (!p) return null;
        const value = handles[key] ?? "";
        const saved = savedHandles ? value.trim().length > 0 && value.trim() === (savedHandles[key] ?? "") : false;

        return (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5 rounded-xl border px-3 py-2 transition"
              style={{ borderColor: value ? `${accent}66` : TC.line, background: "rgba(0,0,0,0.25)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.logo} alt="" aria-hidden className="h-5 w-5 shrink-0 rounded" />

              {showHandles ? (
                <input
                  value={value}
                  onChange={(e) => onHandle(key, e.target.value)}
                  placeholder={p.ph}
                  aria-label={p.label}
                  className="w-full min-w-0 bg-transparent text-[13.5px] outline-none"
                  style={{ color: TC.text }}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{p.label}</span>
              )}

              {value && <Check size={14} className="shrink-0" style={{ color: accent }} />}

              <button type="button" onClick={() => remove(key)} aria-label={`Remove ${p.label}`}
                title={`Remove ${p.label}`}
                className="shrink-0 rounded-lg p-1 transition hover:opacity-100"
                style={{ color: TC.faint, opacity: 0.7 }}>
                <X size={14} />
              </button>
            </div>

            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-[11px]" style={{ color: TC.faint }}>
              <span className="font-semibold" style={{ color: TC.muted }}>{p.label}</span>
              {"note" in p && p.note ? <span>· {p.note}</span> : null}
              {savedHandles && value && !saved ? <FieldOk tone="bad">Not saved yet</FieldOk> : null}
            </span>
          </div>
        );
      })}
      </div>

      {/* ── everything else, always one tap away ──────────────────────────── */}
      {available.length > 0 && (
        <div ref={boxRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-left text-[13px] transition"
            style={{ borderColor: accent, background: `${accent}0f`, color: accent }}
          >
            <Plus size={15} className="shrink-0" />
            <span className="min-w-0 flex-1">
              {full
                ? "Change a platform"
                : `Add a platform — ${PLATFORMS_REQUIRED - platforms.length} more to pick`}
            </span>
            <ChevronDown size={15} className="shrink-0 transition" style={{ transform: open ? "rotate(180deg)" : undefined }} />
          </button>

          {open && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl border"
              style={{ borderColor: TC.line, background: "#171a1f", boxShadow: "0 20px 50px rgba(0,0,0,.6)" }}>
              <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
                {available.map((p) => (
                  <li key={p.key} role="option" aria-selected={false}>
                    <button type="button" onClick={() => add(p.key)}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-white/[0.06]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.logo} alt="" aria-hidden className="h-5 w-5 shrink-0 rounded" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]" style={{ color: TC.text }}>{p.label}</span>
                        {"note" in p && p.note ? (
                          <span className="block truncate text-[11px]" style={{ color: TC.faint }}>{p.note}</span>
                        ) : null}
                      </span>
                      {p.main && (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{ background: `${accent}22`, color: accent }}>
                          Recommended
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="pl-1 text-[11px]" style={{ color: TC.faint }}>
        {full
          ? `That is your ${PLATFORMS_REQUIRED}. Pick another to swap one out, or use the × on a row.`
          : `Pick ${PLATFORMS_REQUIRED} in total. You can change them whenever you like.`}
      </p>
    </div>
  );
}
