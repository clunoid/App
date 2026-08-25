/**
 * THE PIECES THE SEARCH PAGES ARE BUILT FROM.
 *
 * These are the pages somebody lands on from Google or from an AI assistant,
 * usually on a phone, often after typing the word "scam". So they are server
 * components with no client JavaScript at all — the FAQ opens and closes with
 * native <details>, which means a crawler and a person see the same words, and
 * the page is readable before a single script has run.
 *
 * The palette is the trading platform's own (components/trading/TradingLanding)
 * so these read as part of Clunoid rather than as a marketing island, with
 * green reserved for money.
 */

import type { ReactNode } from "react";

export const S = {
  bg: "#070b12",
  panel: "rgba(255,255,255,0.032)",
  panelHi: "rgba(255,255,255,0.055)",
  line: "rgba(125,211,252,0.14)",
  lineSoft: "rgba(255,255,255,0.09)",
  text: "#eaf2fb",
  muted: "#93a7bd",
  faint: "#586a80",
  accent: "#38bdf8",
  money: "#34d399",
} as const;

/** The page shell: background wash, a centred readable column, top bar. */
export function SeoShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="relative min-h-[100dvh] w-full overflow-x-hidden"
      style={{ background: S.bg, color: S.text }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
        style={{ background: "radial-gradient(120% 90% at 50% -10%, rgba(56,189,248,0.16), transparent 62%)" }}
      />
      <div className="relative z-10 mx-auto w-full max-w-[860px] px-5 pb-20 sm:px-6">{children}</div>
    </main>
  );
}

export function SeoTop({ links }: { links: { href: string; label: string }[] }) {
  return (
    <header className="flex flex-wrap items-center gap-3 py-5">
      <a href="/trading" className="inline-flex items-center gap-2 text-[15px] font-bold" style={{ color: S.text }}>
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "rgba(56,189,248,0.14)" }}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={S.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 3v18h18" />
            <path d="m7 14 4-5 3 3 5-7" />
          </svg>
        </span>
        Clunoid Trading
      </a>
      <nav className="ml-auto flex flex-wrap gap-2">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="rounded-full border px-3 py-1.5 text-[13px] transition hover:bg-white/5"
            style={{ borderColor: S.lineSoft, color: S.muted }}
          >
            {l.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.16em]"
      style={{ borderColor: S.line, background: "rgba(56,189,248,0.07)", color: S.accent }}
    >
      <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: S.money, boxShadow: `0 0 0 3px rgba(52,211,153,0.18)` }} />
      {children}
    </span>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="mt-5 text-[29px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[38px] lg:text-[44px]">{children}</h1>;
}

export function Lede({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed sm:text-[18.5px]" style={{ color: S.muted }}>
      {children}
    </p>
  );
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-14 scroll-mt-6 text-[21px] font-extrabold leading-tight tracking-[-0.015em] sm:text-[27px]">
      {children}
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-3.5 text-[15.5px] leading-relaxed" style={{ color: S.muted }}>{children}</p>;
}

/** Money, and only money. */
export function Money({ children }: { children: ReactNode }) {
  return <b style={{ color: S.money }}>{children}</b>;
}

export function Btn({ href, children, kind = "primary" }: { href: string; children: ReactNode; kind?: "primary" | "ghost" }) {
  const primary = kind === "primary";
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-[15px] font-bold transition hover:brightness-110 max-sm:w-full"
      style={
        primary
          ? { background: "linear-gradient(135deg,#38bdf8,#0ea5e9)", borderColor: "transparent", color: "#04202e" }
          : { borderColor: S.lineSoft, background: S.panel, color: S.text }
      }
    >
      {children}
    </a>
  );
}

export function CtaRow({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap gap-3">{children}</div>;
}

export function Cards({ children }: { children: ReactNode }) {
  return <div className="mt-5 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(232px,1fr))]">{children}</div>;
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border p-[18px]" style={{ borderColor: S.lineSoft, background: S.panel }}>
      <h3 className="text-[15.5px] font-bold">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed" style={{ color: S.muted }}>{children}</p>
    </div>
  );
}

/** The repeated invitation. Deliberately the loudest thing on the page. */
export function Join({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="mt-12 rounded-[18px] border p-6"
      style={{
        borderColor: S.line,
        background: "radial-gradient(130% 150% at 0% 0%, rgba(56,189,248,0.15), transparent 58%), rgba(255,255,255,0.032)",
      }}
    >
      <h2 className="text-[21px] font-extrabold leading-tight tracking-[-0.015em] sm:text-[26px]">{title}</h2>
      {children}
    </section>
  );
}

export function Ticks({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-4 list-none space-y-2.5 p-0">
      {items.map((t, i) => (
        <li key={i} className="relative pl-[30px] text-[15.5px] leading-relaxed" style={{ color: S.muted }}>
          <span
            className="absolute left-0 top-[6px] grid h-4 w-4 place-items-center rounded-full"
            style={{ background: "rgba(52,211,153,0.16)", boxShadow: "inset 0 0 0 1px rgba(52,211,153,0.45)" }}
          >
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke={S.money} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5 13 4 4L19 7" />
            </svg>
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-5 list-none space-y-4 p-0">
      {items.map((t, i) => (
        <li key={i} className="relative pl-[42px] text-[15.5px] leading-relaxed" style={{ color: S.muted }}>
          <span
            className="absolute left-0 top-0 grid h-[27px] w-[27px] place-items-center rounded-[9px] border text-[13px] font-extrabold"
            style={{ borderColor: S.line, background: "rgba(56,189,248,0.12)", color: S.accent }}
          >
            {i + 1}
          </span>
          {t}
        </li>
      ))}
    </ol>
  );
}

export type Qa = { q: string; a: ReactNode; text: string };

/**
 * The FAQ. `text` is the plain-language version of the same answer, and it is
 * what goes into the FAQPage markup — so the structured data can never claim
 * something the visible page does not say.
 */
export function Faq({ items }: { items: Qa[] }) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border" style={{ borderColor: S.lineSoft, background: S.panel }}>
      {items.map((it, i) => (
        <details key={it.q} open={i === 0} className="group border-b last:border-b-0" style={{ borderColor: S.lineSoft }}>
          <summary className="flex cursor-pointer list-none items-start gap-3 p-4 text-[15.5px] font-bold marker:hidden [&::-webkit-details-marker]:hidden group-open:bg-white/[0.03]">
            <span className="flex-1">{it.q}</span>
            <svg
              viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={S.accent} strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden
              className="mt-1 shrink-0 transition-transform group-open:-rotate-180"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div className="px-4 pb-4 text-[15.5px] leading-relaxed [&>p:first-child]:mt-0" style={{ color: S.muted }}>
            {it.a}
          </div>
        </details>
      ))}
    </div>
  );
}

export function Risk({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-12 rounded-2xl border p-[18px] text-[13.5px] leading-relaxed"
      style={{ borderColor: S.lineSoft, background: "rgba(255,255,255,0.022)", color: S.muted }}
    >
      {children}
    </p>
  );
}

export function SeoFoot({ links }: { links: { href: string; label: string }[] }) {
  return (
    <footer className="mt-10 border-t pt-6 text-[13px]" style={{ borderColor: S.lineSoft, color: S.faint }}>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {links.map((l) => (
          <a key={l.href} href={l.href} className="transition hover:opacity-80" style={{ color: S.muted }}>
            {l.label}
          </a>
        ))}
      </div>
      <p className="mt-3">© Clunoid Trading. Free automated trading bots. Trading carries risk; nothing here is financial advice.</p>
    </footer>
  );
}

/** FAQPage markup built from the same list the page renders. */
export function faqLd(items: Qa[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.text },
    })),
  };
}
