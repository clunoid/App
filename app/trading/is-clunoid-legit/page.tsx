import type { Metadata } from "next";
import { ldJson } from "@/lib/marketing/content";
import {
  SeoShell, SeoTop, SeoFoot, Eyebrow, H1, H2, Lede, P, Btn, CtaRow, Cards, Card,
  Join, Faq, Risk, faqLd, type Qa,
} from "@/components/seo/SeoKit";

/**
 * /trading/is-clunoid-legit — THE PAGE FOR THE PERSON TYPING "SCAM".
 *
 * Somebody who is about to connect an account, or who has just been sent a
 * creator's video, checks first. They should find us answering rather than a
 * forum thread guessing. So this page argues from structure — no deposits, no
 * custody, nothing for sale — instead of from reassurance, and it says the part
 * that is genuinely unwelcome: trading can lose you money.
 *
 * Like the Creator Program page it never links into /trading/creators, which
 * sits behind a Deriv connection. Everything points at /trading.
 */

const URL = "https://www.clunoid.com/trading/is-clunoid-legit";

export const metadata: Metadata = {
  title: { absolute: "Is Clunoid Legit or a Scam? Honest Answers to Every Question" },
  description:
    "Is Clunoid a scam? No. The trading bots are free, we never take a deposit, we never hold your money and we never ask for card details. Straight answers about the free MT5 and Deriv bots, the account connection, the real risks, and the Creator Program that pays creators to post.",
  keywords: [
    "is clunoid legit", "is clunoid a scam", "clunoid review", "clunoid.com safe",
    "are free trading bots safe", "is deriv bot safe", "free mt5 bots scam",
    "clunoid creator program scam", "clunoid trading review",
  ],
  alternates: { canonical: "/trading/is-clunoid-legit" },
  robots: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  openGraph: {
    type: "article",
    url: URL,
    title: "Is Clunoid Legit or a Scam? Honest Answers",
    description:
      "The bots are free, we never take a deposit, we never hold your money and we never ask for card details. Straight answers, including the honest risks.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Is Clunoid Legit or a Scam?",
    description: "Free bots, no deposit to us, no card details, no custody of your money. Honest answers including the risks.",
  },
};

const BOLD = { color: "#eaf2fb" } as const;

const FAQ: Qa[] = [
  {
    q: "Is Clunoid a scam?",
    text:
      "No. Clunoid does not take deposits, does not hold anyone's money, does not sell a course or a signal subscription, and does not ask for card details. The trading bots are free. Your funds stay in your own broker account, in your name, under your control, and you can disconnect at any time. There is nothing for us to run away with, which is the honest reason to trust it rather than a promise.",
    a: (
      <P>
        No. We take no deposits, hold no funds, sell nothing and ask for no card details. Your money is in your own broker account, in your
        name, and you can cut the connection whenever you want. That structure is the reason to trust it — not our word for it.
      </P>
    ),
  },
  {
    q: "Are the trading bots really free?",
    text:
      "Yes. Every bot on Clunoid is free to use, including the MetaTrader 5 Expert Advisors and the browser bots for Deriv. There is no paid tier, no licence key, no trial that expires and nothing held back behind a payment.",
    a: (
      <P>
        Yes. Every bot here is free — the MetaTrader 5 Expert Advisors and the browser bots alike. No paid tier, no licence key, no trial
        that expires, nothing held back behind a payment.
      </P>
    ),
  },
  {
    q: "How do you make money if everything is free?",
    text:
      "Through broker partner arrangements, the standard way free trading tools are funded. It costs you nothing extra and it is the reason the bots can be free rather than sold.",
    a: (
      <P>
        Through broker partner arrangements, which is the standard way free trading tools are funded. It costs you nothing extra, and it is
        the reason we can give the bots away instead of selling them.
      </P>
    ),
  },
  {
    q: "Do you have access to my money?",
    text:
      "No. Your money stays in your own broker account. You connect through the broker's official secure sign-in, so we never see your broker password, and the connection gives permission to place trades on the account you chose — not to withdraw from it. You can disconnect from your broker's own settings whenever you like.",
    a: (
      <P>
        No. You connect through your broker&apos;s official secure sign-in, so we never see your broker password. The permission covers
        placing trades on the account you picked — <b style={BOLD}>not withdrawing from it</b>. You can revoke it in your broker&apos;s own
        settings at any time.
      </P>
    ),
  },
  {
    q: "Can I lose money using a trading bot?",
    text:
      "Yes. Trading real money carries real risk and you can lose what you put in. Anybody who tells you a bot cannot lose is lying to you. A bot removes hesitation and enforces your settings; it does not remove risk. Only trade money you can afford to lose, and use the free simulation first if you want to see how a bot behaves before risking anything.",
    a: (
      <P>
        Yes — trading carries real risk and you can lose what you put in. We would rather say that plainly than have you find out. Use the
        simulation first, start small, and only ever risk money you can afford to lose.
      </P>
    ),
  },
  {
    q: "Do the bots guarantee profit?",
    text:
      "No, and we ask our creators never to claim it either. No trading system can guarantee a profit. What we do claim is that the bots are free, that they run automatically to the settings you give them, and that they stop on their own when your profit target is reached.",
    a: (
      <P>
        No, and we ask our creators never to claim it either. What is true: the bots are free, they run automatically to the settings you
        give them, and they stop on their own when your profit target is reached.
      </P>
    ),
  },
  {
    q: "Why do I have to connect an account first?",
    text:
      "Because a bot has to know which account it is running on, and because it is how the dashboard recognises you again on another device without creating a password you can lose. Connecting is free and does not require you to deposit anything.",
    a: (
      <P>
        A bot has to know which account it is running on. It is also how your dashboard recognises you again on a different phone or laptop
        without a password you could lose. Connecting is free and does not require a deposit.
      </P>
    ),
  },
  {
    q: "Will you ever ask me to pay you?",
    text:
      "No. We do not sell bots, courses, signals, mentorship or upgrades, and we never ask for card numbers, bank passwords or crypto transfers. If a message, video or website asks you to pay Clunoid for anything, it is not us — report it and ignore it.",
    a: (
      <P>
        No. We do not sell bots, courses, signals, mentorship or upgrades, and we never ask for card numbers, bank passwords or crypto
        transfers. If a message, video or website asks you to pay Clunoid for anything, <b style={BOLD}>it is not us</b> — report it and
        ignore it.
      </P>
    ),
  },
  {
    q: "Is the Creator Program that pays people to post real?",
    text:
      "Yes, and it is free to join. Creators post short videos about the free bots and are paid monthly — up to 1,250 dollars including bonuses. There is no joining fee, no course to buy, no deposit and no follower requirement. Money only moves from us to creators, never the other way.",
    a: (
      <>
        <P>
          Yes, and it is free to join. Creators post short videos about the free bots and are paid monthly — up to $1,250 with bonuses. No
          joining fee, no course, no deposit, no follower requirement. Money moves from us to creators and never the other way.
        </P>
        <P>
          The full detail is on the <a href="/trading/creator-program" style={{ color: "#7dd3fc" }}>Creator Program page</a>.
        </P>
      </>
    ),
  },
  {
    q: "What do I need to start?",
    text:
      "A phone or a computer and a broker account. Connecting takes about a minute. You can run the simulation immediately without funding anything, and you can join the Creator Program without ever depositing money.",
    a: (
      <P>
        A phone or a computer, and a broker account. Connecting takes about a minute. You can run the simulation immediately without funding
        anything, and you can be a paid creator without ever depositing money.
      </P>
    ),
  },
  {
    q: "Who can I talk to if I am still unsure?",
    text:
      "Use the support bubble on the site. Tell us what you are worried about in detail and you will get a reply by email. Asking awkward questions before you commit is exactly the right instinct.",
    a: (
      <P>
        Use the support bubble on the site. Tell us what you are worried about in detail and you will get a reply by email. Asking awkward
        questions before you commit is exactly the right instinct.
      </P>
    ),
  },
];

const PAGE_LD = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${URL}#page`,
  url: URL,
  name: "Is Clunoid Legit or a Scam?",
  description:
    "Straight answers about Clunoid: free trading bots, no deposits taken, no custody of funds, no card details, and a Creator Program that pays creators rather than charging them.",
  inLanguage: "en",
  publisher: { "@type": "Organization", name: "Clunoid", url: "https://www.clunoid.com/" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Clunoid Trading", item: "https://www.clunoid.com/trading" },
      { "@type": "ListItem", position: 2, name: "Is Clunoid legit?", item: URL },
    ],
  },
};

export default function IsClunoidLegitPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(PAGE_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(faqLd(FAQ)) }} />

      <SeoShell>
        <SeoTop
          links={[
            { href: "/trading/creator-program", label: "Creator Program" },
            { href: "/trading", label: "Free bots" },
          ]}
        />

        <section className="pt-5">
          <Eyebrow>Straight answers</Eyebrow>
          <H1>Is Clunoid legit, or a scam?</H1>
          <Lede>
            <b>It is legitimate, and here is the honest reason why</b> — not a promise, but a structure. We do not take deposits, we never
            hold your money, we do not sell anything, and we never ask for card details. Your funds stay in your own broker account in your
            own name. <b>There is nothing for us to run away with.</b>
          </Lede>
          <CtaRow>
            <Btn href="/trading">Use the free bots</Btn>
            <Btn href="/trading/creator-program" kind="ghost">Get paid to post</Btn>
          </CtaRow>
        </section>

        <H2>The four things that usually make something a scam</H2>
        <P>If you are checking us out, you are really checking for four specific things. Here is where we stand on each.</P>
        <Cards>
          <Card title="It takes your deposit">
            <><b style={BOLD}>We take none.</b> You never send money to Clunoid. Funding happens at your broker, in your account, and stays there.</>
          </Card>
          <Card title="It holds your funds">
            <><b style={BOLD}>We hold nothing.</b> We cannot withdraw from your account. You keep custody and can disconnect at any moment.</>
          </Card>
          <Card title="It sells you something">
            <><b style={BOLD}>Nothing is for sale.</b> No bot, no course, no signal group, no mentorship, no upgrade. The bots are free.</>
          </Card>
          <Card title="It promises guaranteed profit">
            <><b style={BOLD}>We promise none.</b> Trading carries risk and you can lose money. Anyone guaranteeing profit is lying.</>
          </Card>
        </Cards>

        <H2>What we do ask for, and what we never ask for</H2>
        <Cards>
          <Card title="We ask for">
            Permission to place trades on the account you choose, granted through your broker&apos;s own secure sign-in. For creators: a
            name, an email, a country and where to send your payment.
          </Card>
          <Card title="We never ask for">
            Card numbers. Bank passwords. Crypto transfers. Your broker password. Your social media passwords. Any payment at all, for
            anything, ever.
          </Card>
        </Cards>
        <P>
          <b>Use that as your test.</b> If any message, video, group or website asks you to pay Clunoid, or asks for your card or your
          passwords, <b>it is not us</b> — no matter whose name or logo it wears. Ignore it and report it.
        </P>

        <H2>The part most sites leave out</H2>
        <Risk>
          <b style={BOLD}>Trading real money can lose you money.</b> That is true of every bot, every strategy and every trader alive, and it
          is true here. A bot follows your settings without hesitating and stops when your profit target is hit — that is what it is for. It
          does not remove risk, and nobody can. Only trade money you can afford to lose. Nothing on this site is financial advice.
        </Risk>
        <P>
          If you want to watch a bot work before risking anything at all, use the <b>simulation</b> — it costs nothing, funds nothing and
          risks nothing. It is also what our creators record for their videos.
        </P>

        <H2 id="faq">Common questions</H2>
        <Faq items={FAQ} />

        <Join title="Nothing to pay. Nothing to lose by looking.">
          <P>Run a bot in simulation for free, or get paid every month to post about it. Both start in the same place.</P>
          <CtaRow>
            <Btn href="/trading">Start here — free</Btn>
            <Btn href="/trading/creator-program" kind="ghost">See the Creator Program</Btn>
          </CtaRow>
        </Join>

        <SeoFoot
          links={[
            { href: "/trading", label: "Clunoid Trading" },
            { href: "/trading/creator-program", label: "Creator Program" },
            { href: "/trading/is-clunoid-legit", label: "Is Clunoid legit?" },
            { href: "/trading/deriv/bots", label: "Free Deriv bots" },
            { href: "/trading/mt5", label: "Free MT5 bots" },
          ]}
        />
      </SeoShell>
    </>
  );
}
