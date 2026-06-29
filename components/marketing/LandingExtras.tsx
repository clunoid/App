import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FEATURE_PAGES, RESOURCE_PAGES } from "@/lib/marketing/content";
import { StartFree } from "./StartFree";

/**
 * The crawlable marketing content shown below the welcome hero for signed-out
 * visitors (and search engines). It links the homepage — the site's most
 * authoritative page — to every feature page with descriptive anchor text,
 * answers top "what is / is it free" queries (with FAQPage structured data),
 * and gives crawlers real, keyword-rich content instead of a thin landing.
 */

const HOME_FAQ = [
  {
    q: "What is Clunoid?",
    a: "Clunoid is an AI host you talk to. Ask Isaac anything and he answers out loud with synced animated visuals; you can also build animated bar-chart-race videos, play the Guess the Country flag game, choose an AI voice, and export shareable clips — all in your browser.",
  },
  {
    q: "Is Clunoid free?",
    a: "Yes — you can start for free, ask Isaac questions, play the flag game and export HD videos. Paid plans and pay-as-you-go credits unlock more usage and Isaac's premium voice.",
  },
  {
    q: "Do I need to download anything?",
    a: "No. Clunoid runs in any modern browser on desktop and mobile — there's nothing to install.",
  },
  {
    q: "How is Clunoid different from ChatGPT?",
    a: "Instead of plain text, Isaac speaks his answer aloud with synced animated visuals and an info card, and you can talk to him by voice. Clunoid also builds bar-chart-race videos, hosts a flag game, and exports shareable clips.",
  },
  {
    q: "What can I make with Clunoid?",
    a: "Visual answers to any question, animated bar-chart-race Stat Battle videos from a topic or your own PDF/CSV/Excel file, a voice-hosted flag quiz, and shareable recap videos with AI titles, captions and hashtags.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: HOME_FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export function LandingExtras() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />

      {/* What you can do */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="font-serif text-3xl text-ink sm:text-4xl">Everything you can do with Clunoid</h2>
          <p className="mt-3 text-ink-muted">
            Clunoid is an AI you talk to. Ask Isaac anything and see it answered with visuals, turn any topic
            or your own files into animated bar-chart-race videos, play a voice-hosted flag game, and export
            shareable recap videos — free to start, nothing to download.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_PAGES.map((p) => (
            <Link
              key={p.slug}
              href={`/${p.slug}`}
              className="group flex flex-col rounded-2xl border border-border bg-surface/50 p-6 transition hover:border-clay"
            >
              <h3 className="font-serif text-xl text-ink group-hover:text-clay-soft">{p.nav}</h3>
              <p className="mt-2 flex-1 text-sm text-ink-muted">{p.heroSub}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-clay-soft">
                Learn more <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/60 bg-surface/30">
        <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="font-serif text-3xl text-ink">How it works</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              { n: "1", t: "Ask or upload", d: "Type or speak any question, name a ranking, or upload a PDF, CSV or Excel file." },
              { n: "2", t: "Clunoid builds it", d: "Isaac researches and answers with visuals, or builds an animated Stat Battle." },
              { n: "3", t: "Watch & share", d: "Keep exploring, play a game, or export a recap video for TikTok, Reels and Shorts." },
            ].map((s) => (
              <li key={s.n} className="rounded-2xl border border-border bg-surface/50 p-6">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-clay/15 font-serif text-clay">{s.n}</div>
                <h3 className="mt-4 font-serif text-lg text-ink">{s.t}</h3>
                <p className="mt-1 text-sm text-ink-muted">{s.d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            <StartFree label="Start exploring — free" />
          </div>
        </div>
      </section>

      {/* FAQ — answers top "what is / is it free" queries (FAQPage structured data) */}
      <section className="border-t border-border/60">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="font-serif text-3xl text-ink">Frequently asked questions</h2>
          <dl className="mt-8 space-y-6">
            {HOME_FAQ.map((f, i) => (
              <div key={i} className="border-b border-border/50 pb-6">
                <dt className="font-semibold text-ink">{f.q}</dt>
                <dd className="mt-2 text-ink-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Footer links — homepage → every page */}
      <footer className="border-t border-border/60">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="font-serif text-xl text-ink">clunoid</div>
            <p className="mt-2 max-w-xs text-sm text-ink-muted">
              Talk to Isaac — an AI that shows you anything.
            </p>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Features</h2>
            <ul className="mt-3 space-y-2">
              {FEATURE_PAGES.map((p) => (
                <li key={p.slug}>
                  <Link href={`/${p.slug}`} className="text-sm text-ink-muted transition hover:text-clay-soft">
                    {p.nav}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Learn</h2>
            <ul className="mt-3 space-y-2">
              {RESOURCE_PAGES.map((p) => (
                <li key={p.slug}>
                  <Link href={`/${p.slug}`} className="text-sm text-ink-muted transition hover:text-clay-soft">
                    {p.nav}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/pricing" className="text-sm text-ink-muted transition hover:text-clay-soft">
                  Pricing &amp; credits
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Try it</h2>
            <p className="mt-3 text-sm text-ink-muted">Ask Isaac your first question free.</p>
            <StartFree className="mt-4" />
          </div>
        </div>
        <div className="border-t border-border/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-ink-faint sm:px-6">
            © {new Date().getFullYear()} Clunoid · clunoid.com
          </div>
        </div>
      </footer>
    </>
  );
}
