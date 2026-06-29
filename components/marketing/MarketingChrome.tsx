import Link from "next/link";
import { FEATURE_PAGES, RESOURCE_PAGES } from "@/lib/marketing/content";
import { StartFree } from "./StartFree";

/**
 * Shared chrome for the public marketing pages: a sticky top bar and a rich
 * footer. The footer links to every marketing page + pricing, giving search
 * engines a tight internal-link graph to crawl. All links stay on public pages
 * or hit the sign-in gate — none lead into authenticated content directly.
 */
export function MarketingChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-base/80 backdrop-blur">
        <nav className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="font-serif text-xl text-ink">
            clunoid
          </Link>
          <div className="ml-auto hidden items-center gap-5 lg:flex">
            {FEATURE_PAGES.map((p) => (
              <Link
                key={p.slug}
                href={`/${p.slug}`}
                className="text-sm text-ink-muted transition hover:text-ink"
              >
                {p.nav}
              </Link>
            ))}
            <Link href="/pricing" className="text-sm text-ink-muted transition hover:text-ink">
              Pricing
            </Link>
          </div>
          <StartFree className="ml-auto px-4 py-2 lg:ml-0" />
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer — full internal link graph */}
      <footer className="border-t border-border/60 bg-surface/40">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="font-serif text-xl text-ink">clunoid</div>
            <p className="mt-2 max-w-xs text-sm text-ink-muted">
              Talk to Isaac — an AI that shows you anything. Ask, play, and make shareable videos.
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
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Get started</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/pricing" className="text-sm text-ink-muted transition hover:text-clay-soft">
                  Pricing &amp; credits
                </Link>
              </li>
              <li>
                <Link href="/" className="text-sm text-ink-muted transition hover:text-clay-soft">
                  Start free
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Try it</h2>
            <p className="mt-3 text-sm text-ink-muted">
              Ask Isaac anything, build a Stat Battle, or play Guess the Country.
            </p>
            <StartFree className="mt-4" />
          </div>
        </div>
        <div className="border-t border-border/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-ink-faint sm:px-6">
            © {new Date().getFullYear()} Clunoid · clunoid.com
          </div>
        </div>
      </footer>
    </div>
  );
}
