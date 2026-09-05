import type { Metadata } from "next";
import { ldJson } from "@/lib/marketing/content";
import {
  C, Shell, TopBar, Hero, Section, Grid, Card, Table, Faq, Close, Disclaimer,
  StartLink, GhostLink, faqLd,
} from "@/components/trading/seo/Kit";

/**
 * /trading/ai-trading-robot — what the phrase actually means.
 *
 * "AI trading bot", "AI trading robot" and the German "KI-Handelsroboter" all
 * collect impressions and no clicks, because the landing page uses the words as
 * a description of itself rather than answering the question behind them. The
 * question is nearly always the same one: is this real, or is "AI" a sticker?
 *
 * So the page explains what the automation genuinely does — read indicators,
 * classify the regime, size to balance — and is equally plain about what it does
 * not do, which is predict. Overclaiming here would poison every other page we
 * have written about being trustworthy.
 */
export const metadata: Metadata = {
  title: { absolute: "AI Trading Robot — What It Really Does, and What It Cannot" },
  description:
    "What an AI trading robot actually does: reads the market, sizes each position to your balance, executes without emotion. What it cannot do, and how to judge one honestly.",
  alternates: { canonical: "/trading/ai-trading-robot" },
  openGraph: {
    type: "article",
    url: "https://www.clunoid.com/trading/ai-trading-robot",
    title: "AI Trading Robot — What It Really Does, and What It Cannot",
    description:
      "An honest account of what automated AI trading does, what it cannot do, and how to tell a real one from a sticker.",
  },
};

const FAQ = [
  {
    q: "What is an AI trading robot?",
    a: "A program that reads market data continuously, decides when its conditions are met, sizes the position against your account balance and places the trade — without a person watching. On MetaTrader 5 it is called an Expert Advisor; in a browser it runs against your broker's API. The intelligence is in how it classifies market conditions and manages risk, not in fortune telling.",
  },
  {
    q: "Do AI trading robots actually work?",
    a: "They do the job they are built for: executing a defined strategy without hesitating, without revenge-trading after a loss and without getting bored overnight. Ours have been tested taking profitable trades. What none of them do is predict the future, and any robot advertised as knowing where price is going is being sold dishonestly.",
  },
  {
    q: "Is the AI in AI trading bots real, or just marketing?",
    a: "Both exist in the market. A real one can tell you what it measures and what it does with those measurements — indicators, a trend or range classification, position size derived from balance and volatility, a stop attached at entry. If a product cannot describe its own logic in a sentence, the AI is a sticker.",
  },
  {
    q: "Can an AI trading robot lose money?",
    a: "Yes. Every strategy has losing trades and automation does not change that; it changes only how consistently the rules are followed. What protects you is position size, a stop loss set before you start, and a balance deep enough to absorb a normal losing run.",
  },
  {
    q: "Do I need to know how to trade to use one?",
    a: "You do not need to read charts, but you do need to make three decisions: how much to fund, what risk setting to run, and what loss ends the session. Those are the decisions no automation can take from you, and they matter more than which robot you pick.",
  },
  {
    q: "Is there a free AI trading robot?",
    a: "Yes. Every bot on Clunoid is free — the MetaTrader 5 Expert Advisors and the Deriv browser bots alike. There is no paid tier, no licence key and nothing for sale on the site. You connect a broker account first, because an automation has nothing to trade on without one.",
  },
];

const LD = faqLd(FAQ);

export default function AiTradingRobot() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(LD) }} />
      <Shell>
        <TopBar />

        <Hero
          eyebrow="What the words actually mean"
          title={<>AI trading robots: what they <span style={{ color: C.profit }}>really</span> do.</>}
        >
          <p>
            An AI trading robot reads market data continuously, decides when its conditions are met,
            sizes the position against your balance and places the trade — with nobody watching. On
            MetaTrader 5 it is called an <strong style={{ color: C.text }}>Expert Advisor</strong>; in a
            browser it runs against your broker&rsquo;s API. That is the whole idea.
          </p>
          <p>
            What it is <em>not</em> is a machine that knows where price is going. Nothing does. Most
            people arrive at this phrase asking whether the &ldquo;AI&rdquo; is real or a sticker, so
            this page answers that, in both directions.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <StartLink />
            <GhostLink href="/trading/free-mt5-robot-download">Try a free one</GhostLink>
          </div>
        </Hero>

        <Section
          kicker="Under the hood"
          title="The four jobs a real trading robot does"
          intro="None of these require clairvoyance, which is exactly why they work. Every one of them is something a disciplined human trader does, done identically every time."
        >
          <Grid min={280}>
            <Card tone="accent" title="1 · Reads the market">
              <p>
                Runs its indicators on every new bar — trend strength, momentum, volatility, whether the
                market is trending or ranging. It is measurement, not prophecy.
              </p>
            </Card>
            <Card tone="accent" title="2 · Classifies the conditions">
              <p>
                A strategy that works in a trend loses in a range. The classification decides which
                behaviour applies right now, and whether to trade at all.
              </p>
            </Card>
            <Card tone="accent" title="3 · Sizes to your balance">
              <p>
                Position size is calculated from your account and your risk setting — not a fixed lot you
                had to guess at. This is the single largest cause of blown first accounts, removed.
              </p>
            </Card>
            <Card tone="accent" title="4 · Protects before it profits">
              <p>
                The stop and target are attached at entry. The risk on a trade is settled before the
                trade exists, which is the part humans skip when they are hopeful.
              </p>
            </Card>
          </Grid>
        </Section>

        <Section
          kicker="Judging one honestly"
          title="Real robot, or a sticker?"
          intro="Neither of these columns is about the sales page. They are about whether the product can describe itself."
        >
          <Table
            head={["Ask this", "A real one answers", "A sticker answers"]}
            rows={[
              ["What does it measure?", "Names its indicators and timeframes.", "\"Advanced AI algorithms.\""],
              ["How is position size decided?", "From balance, risk setting and volatility.", "A fixed lot, or it will not say."],
              ["What is the win rate?", "Depends on conditions — judge the balance, not the win column.", "\"95%+\", or \"no loss\"."],
              ["Can I see it lose?", "Run it on demo and watch.", "Screenshots of profits only."],
              ["Where does my money sit?", "In your own broker account.", "\"Deposit to our platform.\""],
              ["What does it cost?", "A clear figure, or genuinely free. Ours is free.", "Free, then a licence key appears."],
            ]}
          />
        </Section>

        <Section kicker="The honest limits" title="What no amount of AI fixes">
          <Grid min={320}>
            <Card tone="good" title="What automation genuinely gives you">
              <p>
                Consistency. It follows the same rules at 3am as at noon, does not double the stake out
                of frustration, does not skip a valid setup because the last one lost, and does not need
                you at a screen to close a winner.
              </p>
              <p>
                That discipline is not a small thing — it is most of what separates a strategy on paper
                from the same strategy in practice.
              </p>
            </Card>
            <Card tone="bad" title="What it cannot do">
              <p>
                Predict. Remove losing trades. Survive a balance too thin for its own position sizing.
                Or stop you raising the risk setting after a bad week — which is how most automated
                accounts are actually lost.
              </p>
              <p>
                <strong style={{ color: C.text }}>Funding, risk setting and the stop loss stay yours.</strong>{" "}
                <a href="/trading/is-clunoid-legit" style={{ color: C.profitSoft }}>The full risk-management page →</a>
              </p>
            </Card>
          </Grid>
        </Section>

        <Section kicker="Questions" title="AI trading robots, answered">
          <Faq items={FAQ.map((f) => ({ q: f.q, a: <p>{f.a}</p> }))} />
        </Section>

        <Close
          title="Read the strategy, then watch it trade on demo"
          links={[
            { href: "/trading/free-mt5-robot-download", label: "Free MT5 robot download" },
            { href: "/trading/free-deriv-bots", label: "Free Deriv bots" },
            { href: "/trading/is-clunoid-legit", label: "Is Clunoid legit?" },
          ]}
        >
          <p>
            Every bot here is free, and you can run one on a demo account before a cent of your own is
            involved — which is the only way to judge an automation honestly.
          </p>
        </Close>

        <Disclaimer />
      </Shell>
    </>
  );
}
