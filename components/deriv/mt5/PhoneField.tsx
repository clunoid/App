"use client";

/**
 * A PHONE NUMBER WITH ITS COUNTRY.
 *
 * The country is DETECTED, never demanded: the edge tells us where the request
 * came from (/api/geo), the browser's locale is the fallback, and a choice made
 * here is remembered and wins over both next time. The list is every country,
 * searchable by name (in the visitor's language), by ISO code or by calling
 * code. Nothing is forced — the person types the number they want to be
 * reached on, and a number pasted with its own +code decides the country itself.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { DIAL_COUNTRIES, type DialCountry } from "@/lib/countries-dial";
import { t, useLang } from "@/lib/i18n/t";

const CC_KEY = "cln_cc";

export function findCountry(iso: string | null | undefined): DialCountry | null {
  const want = String(iso || "").toUpperCase();
  return DIAL_COUNTRIES.find((c) => c[0] === want) ?? null;
}

/** The number in E.164: the country's code, then the digits typed, minus a
 *  leading trunk zero — "0712…" in Kenya is "+254712…". Empty when it cannot
 *  be a phone number. */
export function toE164(country: DialCountry | null, typed: string): string {
  if (!country) return "";
  let digits = typed.replace(/\D/g, "");
  if (digits.startsWith("0") && country[2] !== "1") digits = digits.replace(/^0+/, "");
  if (digits.length < 6 || digits.length + country[2].length > 15) return "";
  return `+${country[2]}${digits}`;
}

// Windows has no flag glyphs, so the ISO code stands in for the flag there.
const noFlags = () => typeof navigator !== "undefined" && /Win/.test(navigator.platform || "");
function Flag({ iso }: { iso: string }) {
  if (noFlags()) {
    return (
      <span className="rounded-md border px-1 py-px font-mono text-[10.5px] font-bold tracking-wide"
        style={{ borderColor: "rgba(56,189,248,0.35)", color: TC.profit }}>{iso}</span>
    );
  }
  const f = iso.replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
  return <span className="text-[17px] leading-none">{f}</span>;
}

export function PhoneField({ country, onCountry, value, onChange }: {
  country: DialCountry | null;
  onCountry: (c: DialCountry, remember: boolean) => void;
  value: string;
  onChange: (v: string) => void;
}) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const phone = useRef<HTMLInputElement>(null);

  const names = useMemo(() => {
    try { return new Intl.DisplayNames([lang || "en"], { type: "region" }); } catch { return null; }
  }, [lang]);
  const nameOf = (c: DialCountry) => {
    if (names) { try { const n = names.of(c[0]); if (n && n !== c[0]) return n; } catch { /* unknown code */ } }
    return c[1];
  };

  /* Detect once: a remembered choice, else the edge's country, else the locale. */
  useEffect(() => {
    if (country) return;
    let saved: DialCountry | null = null;
    try { saved = findCountry(localStorage.getItem(CC_KEY)); } catch { /* private mode */ }
    if (saved) { onCountry(saved, false); return; }
    const loc = (navigator.language || "").split("-")[1];
    const fromLocale = loc && loc.length === 2 ? findCountry(loc) : null;
    if (fromLocale) onCountry(fromLocale, false);
    fetch("/api/geo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { country?: string } | null) => {
        const g = j && findCountry(j.country);
        if (g) onCountry(g, false);
      })
      .catch(() => { /* the locale guess stands */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    setTimeout(() => search.current?.focus(), 20);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const rows = useMemo(() => {
    const all = DIAL_COUNTRIES.map((c) => ({ c, n: nameOf(c) })).sort((a, b) => a.n.localeCompare(b.n));
    const query = q.trim().toLowerCase().replace(/^\+/, "");
    if (!query) return all;
    // Words that START with the query first (ni → Niger, Nigeria, Nicaragua);
    // anything merely containing it only when nothing starts with it.
    const starts = (s: string) => (" " + s.toLowerCase()).includes(" " + query);
    const hit = all.filter((r) => starts(r.n) || starts(r.c[1]) || r.c[0].toLowerCase() === query || r.c[2].startsWith(query));
    if (hit.length) return hit;
    return all.filter((r) => r.n.toLowerCase().includes(query) || r.c[1].toLowerCase().includes(query));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, lang]);

  const pick = (c: DialCountry) => {
    onCountry(c, true);
    try { localStorage.setItem(CC_KEY, c[0]); } catch { /* private mode */ }
    setOpen(false); setQ("");
    setTimeout(() => phone.current?.focus(), 20);
  };

  const typed = (v: string) => {
    const s = v.replace(/[^\d+ ]/g, "");
    if (s.startsWith("+")) {
      // A number with its own code: the longest matching code wins (+1 last).
      let best: DialCountry | null = null;
      const digits = s.slice(1).replace(/\D/g, "");
      for (const c of DIAL_COUNTRIES) {
        if (digits.startsWith(c[2]) && c[2] !== "1" && (!best || c[2].length > best[2].length)) best = c;
      }
      if (best) { pick(best); onChange(digits.slice(best[2].length)); return; }
    }
    onChange(s);
  };

  return (
    <div ref={wrap} className="relative flex gap-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        aria-label={country ? `${nameOf(country)} +${country[2]}` : "Country code"}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[13px] transition"
        style={{ borderColor: open ? TC.profit : TC.line, background: TC.bg, color: TC.text, minHeight: 42 }}>
        {country ? <Flag iso={country[0]} /> : null}
        <span className="font-mono text-[12.5px] font-semibold">{country ? `+${country[2]}` : "+"}</span>
        <ChevronDown size={12} style={{ color: TC.faint, transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>
      <input ref={phone} value={value} onChange={(e) => typed(e.target.value)}
        type="tel" inputMode="tel" placeholder="712 345 678" autoComplete="tel-national"
        className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-[13px] outline-none"
        style={{ borderColor: TC.line, background: TC.bg, color: TC.text }} />
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-10 flex w-full max-w-[340px] flex-col gap-1.5 rounded-2xl border p-2"
          style={{ borderColor: TC.line, background: TC.bg, boxShadow: "0 18px 44px rgba(0,0,0,0.5)" }}>
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.stopPropagation(); setOpen(false); phone.current?.focus(); }
              if (e.key === "Enter" && rows[0]) pick(rows[0].c);
            }}
            placeholder={t("Search country or code")} autoComplete="off" spellCheck={false}
            className="w-full rounded-lg border px-2.5 py-2 text-[12.5px] outline-none"
            style={{ borderColor: TC.line, background: TC.panel, color: TC.text }} />
          <ul role="listbox" className="m-0 max-h-[220px] list-none overflow-y-auto p-0">
            {rows.length === 0 && <li className="px-2 py-2.5 text-[12px]" style={{ color: TC.faint }}>{t("No country matches that.")}</li>}
            {rows.map(({ c, n }) => (
              <li key={c[0]}>
                <button type="button" role="option" aria-selected={country?.[0] === c[0]} onClick={() => pick(c)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition hover:bg-white/5"
                  style={{ color: TC.text, background: country?.[0] === c[0] ? "rgba(56,189,248,0.10)" : undefined }}>
                  <Flag iso={c[0]} />
                  <span className="min-w-0 flex-1 truncate">{n}</span>
                  <span className="font-mono text-[12px]" style={{ color: TC.muted }}>+{c[2]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
