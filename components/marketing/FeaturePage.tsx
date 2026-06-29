import Link from "next/link";
import { Check } from "lucide-react";
import { MarketingChrome } from "./MarketingChrome";
import { StartFree } from "./StartFree";
import { FEATURE_PAGES, ldJson, type MarketingPage } from "@/lib/marketing/content";

const BASE = "https://www.clunoid.com";

/** Structured data so each page is eligible for rich results (FAQ, breadcrumb,
 *  and HowTo for step-by-step guides). */
function jsonLd(page: MarketingPage) {
  const url = `${BASE}/${page.slug}`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: page.metaTitle,
      description: page.metaDescription,
      isPartOf: { "@id": `${BASE}/#website` },
      about: { "@id": `${BASE}/#app` },
      inLanguage: "en",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE },
        { "@type": "ListItem", position: 2, name: page.nav, item: url },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: page.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
  if (page.steps?.length) {
    graph.push({
      "@type": "HowTo",
      name: page.stepsHeading || page.h1,
      description: page.metaDescription,
      step: page.steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    });
  }
  if (page.examples?.length) {
    graph.push({
      "@type": "ItemList",
      name: page.examplesHeading || "Examples",
      itemListElement: page.examples.map((e, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: e.title,
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

export function FeaturePage({ page }: { page: MarketingPage }) {
  const accentText = page.accent === "spark" ? "text-spark" : "text-clay";
  const accentSoft = page.accent === "spark" ? "text-spark-soft" : "text-clay-soft";
  const more = FEATURE_PAGES.filter((p) => p.slug !== page.slug).slice(0, 6);

  return (
    <MarketingChrome>
      {/* JSON-LD for this page */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd(page)) }} />

      {/* Hero */}
      <section className="stage-bg relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-clay/10 blur-3xl" />
        <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6 sm:py-28">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-faint">
            <Link href="/" className="transition hover:text-ink-muted">
              Home
            </Link>{" "}
            <span aria-hidden>/</span> <span className="text-ink-muted">{page.nav}</span>
          </nav>
          <p className={`text-sm font-semibold uppercase tracking-wide ${accentSoft}`}>{page.eyebrow}</p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight text-ink sm:text-5xl">{page.h1}</h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-muted">{page.heroSub}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <StartFree />
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-border bg-surface/60 px-6 py-3 text-sm font-semibold text-ink transition hover:border-clay"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 sm:gap-14">
          {page.sections.map((s, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-10">
              <h2 className={`font-serif text-2xl ${accentText} sm:text-3xl`}>{s.heading}</h2>
              <div>
                <p className="text-ink-muted">{s.body}</p>
                {s.bullets && (
                  <ul className="mt-4 space-y-2">
                    {s.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-2 text-ink">
                        <Check size={18} className={`mt-0.5 shrink-0 ${accentText}`} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How-to steps (optional) */}
      {page.steps?.length ? (
        <section className="border-t border-border/60 bg-surface/30">
          <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
            <h2 className="font-serif text-3xl text-ink">{page.stepsHeading || "Step by step"}</h2>
            <ol className="mt-8 space-y-5">
              {page.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 font-serif ${accentText}`}>
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-ink">{s.name}</h3>
                    <p className="mt-1 text-ink-muted">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {/* Comparison table (optional) */}
      {page.comparison ? (
        <section className="border-t border-border/60">
          <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
            <h2 className="font-serif text-3xl text-ink">
              Clunoid vs <span className={accentText}>{page.comparison.otherName}</span>
            </h2>
            <div className="mt-6 overflow-hidden rounded-2xl border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left">
                    <th className="px-4 py-3 font-semibold text-ink-muted"> </th>
                    <th className="px-4 py-3 font-semibold text-ink">Clunoid</th>
                    <th className="px-4 py-3 font-semibold text-ink-muted">{page.comparison.otherName}</th>
                  </tr>
                </thead>
                <tbody>
                  {page.comparison.rows.map((r, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-4 py-3 text-ink-muted">{r.label}</td>
                      <td className={`px-4 py-3 font-medium ${accentText}`}>{r.clunoid}</td>
                      <td className="px-4 py-3 text-ink-faint">{r.other}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {/* Examples gallery (optional) */}
      {page.examples?.length ? (
        <section className="border-t border-border/60 bg-surface/30">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="font-serif text-3xl text-ink">{page.examplesHeading || "Examples"}</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {page.examples.map((e, i) => (
                <div key={i} className="rounded-2xl border border-border bg-surface/50 p-5">
                  <h3 className={`font-serif text-lg ${accentText}`}>{e.title}</h3>
                  <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-muted">“{e.prompt}”</p>
                </div>
              ))}
            </div>
            <div className="mt-8">
              <StartFree label="Build one now" />
            </div>
          </div>
        </section>
      ) : null}

      {/* FAQ */}
      <section className="border-t border-border/60 bg-surface/30">
        <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
          <h2 className="font-serif text-3xl text-ink">Frequently asked questions</h2>
          <dl className="mt-8 space-y-6">
            {page.faq.map((f, i) => (
              <div key={i} className="border-b border-border/50 pb-6">
                <dt className="font-semibold text-ink">{f.q}</dt>
                <dd className="mt-2 text-ink-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Explore more — internal links */}
      <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
        <h2 className="font-serif text-2xl text-ink">More from Clunoid</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {more.map((p) => (
            <Link
              key={p.slug}
              href={`/${p.slug}`}
              className="group rounded-2xl border border-border bg-surface/50 p-5 transition hover:border-clay"
            >
              <div className="font-serif text-lg text-ink group-hover:text-clay-soft">{p.nav}</div>
              <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{p.heroSub}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-border/60">
        <div className="stage-bg">
          <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
            <h2 className="font-serif text-3xl text-ink sm:text-4xl">{page.ctaTitle}</h2>
            <p className="mt-3 text-ink-muted">{page.ctaSub}</p>
            <div className="mt-8 flex justify-center">
              <StartFree />
            </div>
          </div>
        </div>
      </section>
    </MarketingChrome>
  );
}
