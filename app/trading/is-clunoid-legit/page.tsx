import type { Metadata } from "next";
import { ldJson } from "@/lib/marketing/content";
import {
  C, Shell, TopBar, Hero, Section, Grid, Card, Table, Faq, Close, Disclaimer,
  StartLink, GhostLink, faqLd,
} from "@/components/trading/seo/Kit";

/**
 * /trading/is-clunoid-legit — the question people type before they trust us.
 *
 * It sits under /trading because middleware redirects every other path to the
 * trading front door; a page anywhere else would answer 307 and never be read.
 *
 * The format is deliberately not the one magicbotslab.com uses for the same
 * question. That page argues from structure — we hold nothing, so there is
 * nothing to steal. This one cannot make that argument as simply, because
 * Clunoid does sell things: two Expert Advisors are free and the advanced ones
 * are one-time purchases. Pretending otherwise would be the exact dishonesty
 * the page exists to disprove. So it is built as a ledger instead — every claim
 * beside the thing a reader can go and check for themselves, and a section that
 * states plainly what costs money.
 */
export const metadata: Metadata = {
  title: { absolute: "Is Clunoid Legit? What We Charge For, and What You Can Verify" },
  description:
    "Clunoid Trading is real and the core bots are free. What is free, what costs money, why we never hold your funds, and the risk management that decides your result.",
  alternates: { canonical: "/trading/is-clunoid-legit" },
  openGraph: {
    type: "article",
    url: "https://www.clunoid.com/trading/is-clunoid-legit",
    title: "Is Clunoid Legit? What We Charge For, and What You Can Verify",
    description:
      "Free MT5 and Deriv bots, no deposits taken, no funds held. Every claim beside the thing you can go and check.",
  },
};

const FAQ = [
  {
    q: "Is Clunoid Trading legit or a scam?",
    a: "It is legit. We never take a deposit, never hold your trading funds and never see your broker password — you sign in on Deriv's own page and the money stays in an account in your own name. Two Expert Advisors are free to download with no account at all, which means you can inspect what we build before you tell us anything about yourself.",
  },
  {
    q: "Are the Clunoid bots free?",
    a: "The core ones are. The General MT5 AI Automation and Aggressive MT5 are free downloads with no payment and no licence key, and the Deriv browser bots are free to run on your own account. The advanced MetaTrader 5 automations are one-time purchases between 99 and 425 US dollars. There is no subscription anywhere.",
  },
  {
    q: "Do the bots actually make profit?",
    a: "They do take profitable trades and they have been tested doing it. That is not the same as a promise you will finish ahead. The automation supplies the discipline; the balance you fund it with, the risk setting you choose and the losses you are willing to sit through supply the rest.",
  },
  {
    q: "Do the bots stop when take profit is hit?",
    a: "Yes, automatically. The Deriv browser bots end the session the moment your take profit or stop loss is reached, without you watching. The MetaTrader 5 automations work per trade: every position carries its stop and its target from the second it opens, so each one closes itself at whichever comes first.",
  },
  {
    q: "Can Clunoid withdraw money from my account?",
    a: "No. The authorisation you grant through Deriv covers placing trades on the account you selected, not moving money out of it, and you can revoke it in Deriv's settings at any time. The MetaTrader 5 Expert Advisors are files that run on your own computer and never touch a Clunoid server at all.",
  },
  {
    q: "How much balance do I need to run a bot?",
    a: "Enough that a normal losing run is survivable rather than fatal. Position sizing is calculated from your balance, so a thin account produces trades too small to matter or a strategy that stops mid-recovery. Balance is not ambition — it is the room the strategy needs to work in.",
  },
  {
    q: "What is martingale in trading?",
    a: "Martingale means raising your stake after a loss so that one win recovers the whole losing run. Starting at 1 dollar with a 3.1x multiplier, a seventh straight loss needs an 887.50 dollar trade and you have already lost 422.14 dollars getting there. It is a real technique with one weakness that decides everything: it only works while the balance can still fund the next step.",
  },
  {
    q: "Why is Clunoid free if it costs money to build?",
    a: "Broker partner arrangements fund the free tier, which is the ordinary way free trading tools are paid for, and the paid Expert Advisors fund the rest. It costs you nothing extra, and it is why the core bots can be given away instead of sold.",
  },
];

const LD = faqLd(FAQ);

export default function IsClunoidLegit() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(LD) }} />
      <Shell>
        <TopBar />

        <Hero eyebrow="A straight answer" title={<>Is Clunoid legit? <span style={{ color: C.profit }}>Yes</span> — and here is how to check.</>}>
          <p>
            You found us searching whether we are a scam, which is the right instinct and we would rather
            you kept it. So this page does not ask you to believe anything. Every claim below sits beside
            the thing you can go and verify yourself, <strong style={{ color: C.text }}>including the
            parts that cost money</strong> — because a page that says &ldquo;everything is free&rdquo;
            when it is not would be exactly the sort of thing you came here to catch.
          </p>
          <p>
            Short version: <strong style={{ color: C.text }}>Clunoid Trading is real, the core bots are
            free, we never take a deposit and we never hold your money.</strong> Two Expert Advisors
            download with no account and no payment, so you can read what we build before you tell us
            anything at all about yourself.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <StartLink />
            <GhostLink href="/trading/free-mt5-robot-download">Download a free EA first</GhostLink>
          </div>
        </Hero>

        <Section
          kicker="The ledger"
          title="Every claim, and how you check it"
          intro="Nothing here needs you to take our word. The right-hand column is the part that matters."
        >
          <Table
            head={["What we say", "How you verify it yourself"]}
            rows={[
              [
                "We never take a deposit",
                "There is no payment step to use the free bots. Your trading balance is funded at Deriv, in your name, and never passes through us.",
              ],
              [
                "We never see your password",
                "Connecting opens deriv.com's own sign-in page. Check the address bar. We receive an authorisation token afterwards, never a password.",
              ],
              [
                "We cannot withdraw from your account",
                "Open Deriv → Settings → Connected apps. The permission listed covers trading on the account you picked. Revoke it there whenever you like.",
              ],
              [
                "The free EAs are genuinely free",
                <>Download <span style={{ color: C.profitSoft }}>ClunoidMT5.mq5</span> or{" "}
                <span style={{ color: C.profitSoft }}>ClunoidAggressiveMT5.mq5</span> right now. No sign-up, no card, no licence key.</>,
              ],
              [
                "The EAs run on your machine",
                "They are MQL5 files that execute inside your own MetaTrader 5 terminal. Unplug from us entirely and they still work.",
              ],
              [
                "You can stop at any second",
                "Every bot has a stop control, and disconnecting at Deriv ends its access instantly whether we agree or not.",
              ],
            ]}
          />
        </Section>

        <Section
          kicker="The uncomfortable part"
          title="What costs money, stated plainly"
          intro="Most 'is it legit' pages skip this. Ours cannot, because the honest answer is that some of it is paid — and you should know which parts before you invest any time."
        >
          <Grid min={300}>
            <Card tone="good" title="Free, no account, no card">
              <p>
                <strong style={{ color: C.text }}>General MT5 AI Automation</strong> and{" "}
                <strong style={{ color: C.text }}>Aggressive MT5</strong> — two Expert Advisors covering
                forex and Volatility indices, downloadable this second.
              </p>
              <p>
                <strong style={{ color: C.text }}>The Deriv browser bots</strong> — free to run on your
                own Deriv account, nothing to install.
              </p>
            </Card>
            <Card tone="accent" title="One-time purchases">
              <p>
                The advanced MetaTrader 5 automations — trend, index, crypto and breakout strategies —
                are <strong style={{ color: C.text }}>$99 to $425, paid once</strong>.
              </p>
              <p>
                No subscription, no recurring charge, no auto-renewal. You are never billed twice for the
                same automation.
              </p>
            </Card>
            <Card tone="bad" title="What we will never do">
              <p>Ask for your broker password. Ask for a deposit. Hold your trading funds.</p>
              <p>
                Promise a return, guarantee a win rate, or tell you a bot cannot lose. If you ever see a
                message doing any of that in our name, it is not us — whatever logo it wears.
              </p>
            </Card>
          </Grid>
        </Section>

        <Section
          kicker="The honest bit about profit"
          title="Yes, the bots take profitable trades. No, that is not a promise."
        >
          <Grid min={320}>
            <Card tone="good" title="What is true">
              <p>
                These automations do win trades, and they have been{" "}
                <strong style={{ color: C.text }}>tested doing it</strong> before being published. They
                execute a strategy without hesitating, without revenge-trading after a loss and without
                getting bored at 3am — which is most of what separates a plan from a mood.
              </p>
              <p>
                Every MT5 position opens with a stop and a target already attached. Every Deriv session
                ends by itself at your take profit or your stop loss.
              </p>
            </Card>
            <Card tone="bad" title="What is not">
              <p>
                Nobody can tell you that you will finish ahead, and anybody who does is selling something.
                Every strategy that has ever existed has losing trades in it.
              </p>
              <p>
                What decides your result is not the bot. It is{" "}
                <strong style={{ color: C.text }}>the balance you fund it with, the risk setting you
                choose, and whether you leave the stop loss where you put it</strong> when a bad run
                starts. That part is yours, and no software can take it from you.
              </p>
            </Card>
          </Grid>
        </Section>

        <Section
          kicker="The part that is your job"
          title="Risk management, in six sentences"
          intro="This is the whole discipline. It is not complicated, it is just harder to do than to read."
        >
          <Grid min={260}>
            <Card title="Size it small">
              <p>The single number that decides how long you survive a bad run. When in doubt, halve it.</p>
            </Card>
            <Card title="Set the stop before you start">
              <p>Decide what a bad session may cost while you are calm. You will not be calm later.</p>
            </Card>
            <Card title="Never move a stop down">
              <p>That is the exact moment a manageable loss becomes an account-ending one.</p>
            </Card>
            <Card title="Stop at take profit">
              <p>The bot already does. Do not restart it to squeeze more from the same session.</p>
            </Card>
            <Card title="Do not over-trade">
              <p>Running bigger or longer than the plan, to win something back, loses more accounts than any strategy.</p>
            </Card>
            <Card title="Never trade money you need">
              <p>Rent money changes every decision you make, and all of them for the worse.</p>
            </Card>
          </Grid>
        </Section>

        <Section
          kicker="Words you will meet"
          title="Martingale, and what it actually costs"
          intro={
            <>
              Several strategies — ours included, in places — raise the stake after a loss so one win
              recovers the run. It is a legitimate technique, not a trick. It has exactly one weakness,
              and this table is it: a $1 start at a 3.1&times; multiplier, losing every time.
            </>
          }
        >
          <Table
            head={["Loss in a row", "Stake needed now", "Already lost getting here"]}
            rows={[
              ["1st", "$1.00", "$0.00"],
              ["3rd", "$9.61", "$4.10"],
              ["5th", "$92.35", "$43.50"],
              ["6th", "$286.29", "$135.85"],
              ["7th", "$887.50", "$422.14"],
              ["8th", "$2,751.26", "$1,309.64"],
            ]}
            hotRows={[4, 5]}
          />
          <p className="mt-5 max-w-3xl text-[14px] leading-relaxed" style={{ color: C.muted }}>
            Seven losses in a row is not exotic. It happens, and when it does a ladder that began at a
            dollar is asking for nearly nine hundred. The lesson is not{" "}
            <em>avoid martingale</em> — it is{" "}
            <strong style={{ color: C.text }}>start small enough that the ladder has somewhere to go</strong>,
            and keep a stop loss that ends the run before your balance does.
          </p>
          <div className="mt-6 grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
            <Card title="Drawdown">
              <p>How far your balance fell from its peak before recovering. Peak $500, dip to $380 — a $120 drawdown, 24%. It tells you what a strategy put you through, which the final number hides.</p>
            </Card>
            <Card title="Win rate">
              <p>The share of trades that won, and it says nothing about size. A bot winning 90% still loses money if the other 10% are far bigger. Judge the balance, not the win column.</p>
            </Card>
            <Card title="Lot size">
              <p>Position size on MetaTrader 5. Our automations calculate it from your balance and your risk setting rather than asking you to guess — which is the most common way a first account is lost.</p>
            </Card>
            <Card title="Expert Advisor (EA)">
              <p>A program that trades inside MetaTrader 5. It is a file you install on your own terminal; it needs no connection to us and keeps running if we vanish.</p>
            </Card>
          </div>
        </Section>

        <Section kicker="Questions" title="Answered directly">
          <Faq items={FAQ.map((f) => ({ q: f.q, a: <p>{f.a}</p> }))} />
        </Section>

        <Close
          title="Check it yourself — download a free EA before you connect anything"
          links={[
            { href: "/trading/free-mt5-robot-download", label: "Free MT5 robot download" },
            { href: "/trading/free-deriv-bots", label: "Free Deriv bots" },
            { href: "/trading/ai-trading-robot", label: "What an AI trading robot does" },
          ]}
        >
          <p>
            No account, no card, no email. Read the strategy, run it on a demo account, and decide about
            us afterwards — that is the order we would use.
          </p>
        </Close>

        <Disclaimer />
      </Shell>
    </>
  );
}
