import type { Metadata } from "next";
import { ldJson } from "@/lib/marketing/content";
import { BOTS } from "@/lib/deriv/bots/registry";
import {
  C, Shell, TopBar, Hero, Section, Grid, Card, Steps, Faq, Close, Disclaimer,
  StartLink, GhostLink, faqLd,
} from "@/components/trading/seo/Kit";

/**
 * /trading/free-deriv-bots — the public face of a catalogue nobody can crawl.
 *
 * /trading/deriv/bots bounces anyone without a Deriv connection to the command
 * centre, so a search engine receives an empty shell from it and it is marked
 * noindex for exactly that reason. Eleven bots therefore existed without a
 * single indexable word describing them, while "free deriv bot" and "free deriv
 * bots" collected impressions against a landing page that names none of them.
 *
 * This page closes that gap. It reads the SAME registry the catalogue renders
 * from, so it cannot drift: add a bot and it appears here, remove one and it
 * disappears. Running a bot still requires a connection — only the description
 * is public, which is the distinction the sitemap comment asked for.
 */
export const metadata: Metadata = {
  title: { absolute: "Free Deriv Bots — 11 Automated Trading Bots, No Download" },
  description:
    "Eleven free Deriv trading bots that run in your browser on your own account. What each bot trades, how to start one, and the limits to set before you do.",
  alternates: { canonical: "/trading/free-deriv-bots" },
  openGraph: {
    type: "article",
    url: "https://www.clunoid.com/trading/free-deriv-bots",
    title: "Free Deriv Bots — 11 Automated Trading Bots, No Download",
    description:
      "Eleven free Deriv bots that run in your browser on your own account. No installer, no licence key, no payment.",
  },
};

const FAQ = [
  {
    q: "Are the Deriv bots free?",
    a: "Yes. Every browser bot listed here is free to run on your own Deriv account. There is no paid tier, no licence key and no subscription. You never enter card details because there is nothing to pay for.",
  },
  {
    q: "Do I need to download anything to use a Deriv bot?",
    a: "No. These run in your browser. There is no installer and no XML file to import into Deriv Bot — you connect your Deriv account, pick a bot, set your limits and start it.",
  },
  {
    q: "Which free Deriv bot should a beginner start with?",
    a: "Smart Recovery Differ is the recommended starting point. Run it on a Deriv demo account first with the smallest stake, and set a take profit and a stop loss before you press start.",
  },
  {
    q: "Can I run a Deriv bot on a demo account?",
    a: "Yes. When you connect, Deriv shows every account you hold and you choose which one the bot uses. Picking the demo account lets you watch a bot trade live market prices with no money at stake.",
  },
  {
    q: "Do the Deriv bots stop by themselves?",
    a: "Yes. You set a take profit and a stop loss before starting, and the bot stops the moment either is reached. It does not keep trading and it does not need you watching the screen.",
  },
  {
    q: "Can a Deriv bot take money out of my account?",
    a: "No. You sign in on Deriv's own page, so we never see your password. The authorisation covers placing trades on the account you selected, not withdrawing from it, and you can revoke it in Deriv's settings at any time.",
  },
  {
    q: "What markets do the free Deriv bots trade?",
    a: "Deriv's synthetic Volatility indices, mostly the 10 through 100 range. These are generated markets rather than real-world ones, so they trade 24 hours a day including weekends.",
  },
];

const LD = faqLd(FAQ);

export default function FreeDerivBots() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(LD) }} />
      <Shell>
        <TopBar />

        <Hero
          eyebrow="Free · No download · No card"
          title={<>Free Deriv bots that run in <span style={{ color: C.profit }}>your browser</span>.</>}
        >
          <p>
            {BOTS.length} automated Deriv bots, all free. Nothing to install, nothing to import,
            no licence key and no payment of any kind. You connect your own Deriv account through
            Deriv&rsquo;s own sign-in page, choose a bot, set your limits, and start it.
          </p>
          <p>
            Your money stays in <strong style={{ color: C.text }}>your broker account, in your name</strong>.
            It never passes through us, and you can disconnect in Deriv&rsquo;s settings at any moment.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <StartLink label="Start free" />
            <GhostLink href="/trading/is-clunoid-legit">Is Clunoid legit?</GhostLink>
          </div>
        </Hero>

        <Section
          kicker="The catalogue"
          title={`All ${BOTS.length} bots, and what each one actually does`}
          intro="These are digit and price-direction bots on Deriv's synthetic Volatility indices, which trade around the clock — weekends included. Every one of them is free to run."
        >
          <Grid min={300}>
            {BOTS.map((b, i) => (
              <Card key={b.id} tone={i === 0 ? "accent" : "plain"} title={b.name} note={`${b.chip} · ${b.markets}`}>
                <p>{b.blurb}</p>
              </Card>
            ))}
          </Grid>
        </Section>

        <Section kicker="Getting going" title="From nothing to a running bot, in four steps">
          <Steps
            items={[
              { title: "Connect your Deriv account", body: <>Press Start. You sign in on Deriv&rsquo;s own page, not ours, so we never see your password.</> },
              { title: "Pick the account it uses", body: <>Deriv lists every account you hold. Choose the <strong style={{ color: C.text }}>demo</strong> one for your first run.</> },
              { title: "Set stake, take profit, stop loss", body: <>Smallest stake to begin. Both limits are set <em>before</em> you start, never after.</> },
              { title: "Start it, and let it stop itself", body: <>The bot halts the moment your take profit or your stop loss is reached.</> },
            ]}
          />
        </Section>

        <Section kicker="Before your first run" title="Three things that decide how this goes">
          <Grid min={300}>
            <Card tone="good" title="Set both limits, every time">
              <p>
                A take profit and a stop loss are what turn a bot from something that trades until the
                balance runs out into something that trades a plan. When take profit is hit the bot{" "}
                <strong style={{ color: C.text }}>stops automatically</strong>. So does stop loss. Neither
                works if you leave it blank.
              </p>
            </Card>
            <Card tone="accent" title="Recovery needs balance behind it">
              <p>
                Several of these bots use martingale — raising the stake after a loss so one win recovers
                the run. That works right up until the balance cannot fund the next step. A small starting
                stake against a comfortable balance is the whole difference.{" "}
                <a href="/trading/is-clunoid-legit" style={{ color: C.profitSoft }}>What martingale really costs →</a>
              </p>
            </Card>
            <Card tone="bad" title="Free does not mean risk-free">
              <p>
                The bots are free and they do take profitable trades — that has been tested. But every
                strategy has losing trades, and nobody can give you one that does not. Anything sold to
                you as a no-loss bot is counting only its winners.
              </p>
            </Card>
          </Grid>
        </Section>

        <Section kicker="Questions" title="Free Deriv bots, answered">
          <Faq items={FAQ.map((f) => ({ q: f.q, a: <p>{f.a}</p> }))} />
        </Section>

        <Close
          title="Open a bot and try it on demo"
          cta="Start free"
          links={[
            { href: "/trading/free-mt5-robot-download", label: "Free MT5 robot download" },
            { href: "/trading/is-clunoid-legit", label: "Is Clunoid legit?" },
            { href: "/trading/ai-trading-robot", label: "What an AI trading robot does" },
          ]}
        >
          <p>
            Connect through Deriv, pick the demo account, and watch one run before a cent of your own is
            involved.
          </p>
        </Close>

        <Disclaimer />
      </Shell>
    </>
  );
}
