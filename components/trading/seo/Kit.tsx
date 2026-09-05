/**
 * THE WRITTEN PAGES — shared furniture.
 *
 * Guides people land on from a search rather than from the app. They wear the
 * trading landing's own skin — the same near-black, the same dotted grid and
 * sky-blue accent, the same rounded panels — so arriving from Google and then
 * pressing Get started never feels like two different companies.
 *
 * SERVER components on purpose: no "use client" anywhere in this file. The
 * landing is a client component that redirects connected visitors, and the
 * Deriv bot pages render nothing at all to a crawler for the same reason. These
 * pages have no such gate, so a search engine receives the entire text on the
 * first byte, which is the whole point of writing them.
 *
 * Everything is fluid — clamp() and auto-fit grids rather than a breakpoint
 * list — so one set of rules holds from a 360px phone to a wide monitor.
 */
import Link from "next/link";
import { ArrowUpRight, Download } from "lucide-react";

/** The landing's palette, verbatim. Keep in step with TradingLanding's `C`. */
export const C = {
  bg: "#070b12",
  panel: "rgba(255,255,255,0.032)",
  panelHi: "rgba(255,255,255,0.06)",
  line: "rgba(125,211,252,0.14)",
  text: "#eaf2fb",
  muted: "#93a7bd",
  faint: "#586a80",
  profit: "#38bdf8",
  profitSoft: "#7dd3fc",
  loss: "#f2607d",
} as const;

export const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } as const;

const DOT_GRID = {
  backgroundImage: "radial-gradient(rgba(125,211,252,0.10) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
} as const;

/**
 * Where every call to action goes: the landing page, and nowhere else.
 *
 * These pages used to point at /trading/command?connect=1, and that was wrong.
 * The command centre is what you reach AFTER connecting — sending a stranger
 * from a search result straight into it drops them onto account machinery they
 * have no account for. The landing page already owns the whole connect flow,
 * including the connect-or-create prompt for people without a Deriv account,
 * and it forwards anybody already connected to the command centre by itself.
 *
 * So there is exactly one door, it is the front one, and these pages do not add
 * a second. Nothing here links into the app any deeper than this.
 */
export const START_HREF = "/";

/* ── page frame ──────────────────────────────────────────────────────────── */

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: C.bg, color: C.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: "radial-gradient(120% 90% at 50% -10%, rgba(56,189,248,0.16), transparent 60%)" }}
      />
      <div className="relative z-10">{children}</div>
    </main>
  );
}

/** The landing's own top bar, minus the admin switch nobody here can use. */
export function TopBar() {
  return (
    <header className="flex w-full items-center gap-3 px-6 py-4 sm:px-10 lg:px-16">
      <Link href="/" className="flex items-center gap-2 text-[15px] font-bold tracking-[0.2em]" style={{ color: C.text }}>
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "rgba(56,189,248,0.14)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.profit} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
          </svg>
        </span>
        CLUNOID <span style={{ color: C.profit }}>TRADING</span>
      </Link>
      <div className="ml-auto">
        <StartLink small />
      </div>
    </header>
  );
}

/* ── controls ────────────────────────────────────────────────────────────── */

export function StartLink({ label = "Get started", small = false }: { label?: string; small?: boolean }) {
  return (
    <Link
      href={START_HREF}
      className={`inline-flex items-center gap-2 rounded-xl font-semibold transition hover:opacity-90 ${
        small ? "px-4 py-2 text-[13px]" : "px-5 py-3 text-[14px]"
      }`}
      style={{ background: C.profit, color: "#04121f" }}
    >
      {label} <ArrowUpRight size={small ? 14 : 16} />
    </Link>
  );
}

export function GhostLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-[14px] font-medium transition hover:bg-white/5"
      style={{ borderColor: C.line, color: C.text }}
    >
      {children}
    </Link>
  );
}

/* ── layout pieces ───────────────────────────────────────────────────────── */

/**
 * A download button that does not download.
 *
 * An Expert Advisor is no use to somebody who has not connected a broker
 * account — there is nothing for it to trade on. So pressing this goes to the
 * landing page to connect first, and the file itself is reached from the bot's
 * own page afterwards. It deliberately does NOT link the .mq5 directly: a
 * visitor who saved the file without an account would be left holding something
 * inert and wondering what they did wrong.
 *
 * It keeps the download affordance because that is what the reader came for and
 * what they will get — the label says the connect step out loud rather than
 * hiding it behind the arrow.
 */
export function DownloadCta({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href={START_HREF}
      className="inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-[14px] font-medium transition hover:bg-white/5"
      style={{ borderColor: "rgba(56,189,248,0.36)", background: "rgba(56,189,248,0.07)", color: C.text }}
    >
      <Download size={16} style={{ color: C.profit }} /> {children}
    </Link>
  );
}

export function Wrap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`w-full px-6 sm:px-10 lg:px-16 ${className}`}>{children}</div>;
}

export function Hero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Wrap className="pb-10 pt-6 lg:pt-12">
      <span
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ borderColor: C.line, color: C.profit }}
      >
        {eyebrow}
      </span>
      <h1 className="mt-5 max-w-[20ch] text-[34px] font-bold leading-[1.08] sm:text-[46px]">{title}</h1>
      <div className="mt-4 max-w-2xl space-y-4 text-[15px] leading-relaxed" style={{ color: C.muted }}>
        {children}
      </div>
    </Wrap>
  );
}

export function Section({
  kicker,
  title,
  intro,
  children,
}: {
  kicker?: string;
  title?: string;
  intro?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-t py-10 sm:py-14" style={{ borderColor: C.line }}>
      <Wrap>
        {kicker ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.faint }}>
            {kicker}
          </p>
        ) : null}
        {title ? <h2 className="text-[24px] font-bold leading-tight sm:text-[30px]">{title}</h2> : null}
        {intro ? (
          <div className="mt-3 max-w-3xl text-[15px] leading-relaxed" style={{ color: C.muted }}>
            {intro}
          </div>
        ) : null}
        {children}
      </Wrap>
    </section>
  );
}

/** Column count follows the width, so there is no breakpoint list to maintain. */
export function Grid({ children, min = 280 }: { children: React.ReactNode; min?: number }) {
  return (
    <div className="mt-7 grid gap-3.5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` }}>
      {children}
    </div>
  );
}

type Tone = "plain" | "good" | "bad" | "accent";

const TONES: Record<Tone, { border: string; bg: string; head: string }> = {
  plain: { border: C.line, bg: C.panel, head: C.text },
  good: { border: "rgba(52,211,153,0.34)", bg: "rgba(52,211,153,0.06)", head: "#34d399" },
  bad: { border: "rgba(242,96,125,0.34)", bg: "rgba(242,96,125,0.06)", head: C.loss },
  accent: { border: "rgba(56,189,248,0.36)", bg: "rgba(56,189,248,0.07)", head: C.profitSoft },
};

export function Card({
  title,
  tone = "plain",
  note,
  children,
}: {
  title?: string;
  tone?: Tone;
  note?: string;
  children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: t.border, background: t.bg }}>
      {title ? (
        <h3 className="flex flex-wrap items-baseline gap-x-2 text-[14.5px] font-bold" style={{ color: t.head }}>
          {title}
          {note ? (
            <span className="text-[11.5px] font-medium" style={{ color: C.faint }}>
              {note}
            </span>
          ) : null}
        </h3>
      ) : null}
      <div className="mt-2 space-y-2.5 text-[13.5px] leading-relaxed" style={{ color: C.muted }}>{children}</div>
    </div>
  );
}

/** Numbered install/setup instructions. */
export function Steps({ items }: { items: { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="mt-7 grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
      {items.map((s, i) => (
        <li key={i} className="rounded-2xl border p-5" style={{ borderColor: C.line, background: C.panel }}>
          <span
            className="grid h-7 w-7 place-items-center rounded-lg text-[12.5px] font-bold"
            style={{ ...mono, background: "rgba(56,189,248,0.14)", color: C.profit }}
          >
            {i + 1}
          </span>
          <h3 className="mt-3 text-[14.5px] font-bold" style={{ color: C.text }}>{s.title}</h3>
          <div className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: C.muted }}>{s.body}</div>
        </li>
      ))}
    </ol>
  );
}

/** Tables scroll inside their own box; the page itself never scrolls sideways. */
export function Table({
  head,
  rows,
  hotRows = [],
}: {
  head: string[];
  rows: React.ReactNode[][];
  /** Row indexes to render in the loss colour — the ones that make the point. */
  hotRows?: number[];
}) {
  return (
    <div className="mt-6 -mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[520px] border-collapse text-[13.5px]" style={mono}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="border-b px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.08em]"
                style={{ borderColor: C.line, color: C.faint }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const hot = hotRows.includes(i);
            return (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  className="border-b px-3 py-2.5 align-top"
                  style={{
                    borderColor: C.line,
                    color: hot ? C.loss : j === 0 ? C.text : C.muted,
                    fontWeight: hot ? 700 : undefined,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="mt-7 grid gap-x-8 gap-y-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
      {items.map((f, i) => (
        <div key={i}>
          <h3 className="text-[14.5px] font-bold" style={{ color: C.text }}>{f.q}</h3>
          <div className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: C.muted }}>{f.a}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * The closing call, and the links out.
 *
 * The links matter as much as the button: these pages need to reach each other,
 * or each one is a dead end that a crawler visits once and an arriving reader
 * leaves from.
 */
export function Close({
  title,
  children,
  links,
  cta = "Get started",
}: {
  title: string;
  children: React.ReactNode;
  links: { href: string; label: string }[];
  cta?: string;
}) {
  return (
    <section className="border-t py-12 sm:py-16" style={{ borderColor: C.line }}>
      <Wrap>
        <h2 className="max-w-[24ch] text-[24px] font-bold leading-tight sm:text-[30px]">{title}</h2>
        <div className="mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: C.muted }}>{children}</div>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <StartLink label={cta} />
        </div>
        <nav className="mt-8 flex flex-wrap gap-2.5" aria-label="More guides">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full border px-4 py-2 text-[13px] font-medium transition hover:bg-white/5"
              style={{ borderColor: C.line, color: C.text }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </Wrap>
    </section>
  );
}

export function Disclaimer() {
  return (
    <footer className="border-t py-8" style={{ borderColor: C.line }}>
      <Wrap>
        <p className="max-w-4xl text-[12.5px] leading-relaxed" style={{ color: C.faint }}>
          Trading carries risk. Clunoid Trading provides automated tools, not financial advice and not a
          profit guarantee. Past performance does not predict future results. Never trade money you
          cannot afford to lose.
        </p>
        <p className="mt-2 text-[12.5px]" style={{ color: C.faint }}>
          © {new Date().getFullYear()} Clunoid Trading. All trademarks are the property of their respective owners.
        </p>
      </Wrap>
    </footer>
  );
}

/** FAQ structured data built from the same items the page renders, so the
 *  markup can never claim an answer the page does not show. */
export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
