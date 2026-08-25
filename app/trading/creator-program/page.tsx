import type { Metadata } from "next";
import { ldJson } from "@/lib/marketing/content";
import {
  SeoShell, SeoTop, SeoFoot, Eyebrow, H1, H2, Lede, P, Btn, CtaRow, Cards, Card,
  Join, Ticks, Steps, Faq, Risk, Money, faqLd, type Qa,
} from "@/components/seo/SeoKit";

/**
 * /trading/creator-program — THE PUBLIC PAGE ABOUT GETTING PAID TO POST.
 *
 * Distinct from /trading/creators, which is the dashboard a registered creator
 * works out of. This one is written for a stranger who found us by typing
 * something like "get paid to post about a brand" or "is the Clunoid creator
 * program a scam", and it has one job: answer honestly and hand them a way in.
 *
 * It deliberately does NOT link to /trading/creators. That surface is behind a
 * Deriv connection, so somebody sent straight there from a search result would
 * meet a wall instead of an explanation. Every call to action points at
 * /trading, where connecting is the first thing on the page.
 */

const URL = "https://www.clunoid.com/trading/creator-program";

export const metadata: Metadata = {
  title: { absolute: "Get Paid to Post — Clunoid Creator Program (Free to Join, up to $1,250/month)" },
  description:
    "Clunoid pays creators every month to post short videos about free trading bots. Joining is free, you never pay us anything, and there is no follower requirement. $100 in your first month rising to $750, plus a $500 views bonus and $20 for every friend you bring.",
  keywords: [
    "get paid to post", "creator program", "paid to post videos", "clunoid creator program",
    "is the clunoid creator program a scam", "get paid to make tiktok videos", "paid ugc",
    "earn money posting videos", "free to join creator program", "brand creator program",
  ],
  alternates: { canonical: "/trading/creator-program" },
  robots: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  openGraph: {
    type: "article",
    url: URL,
    title: "Get Paid to Post — Clunoid Creator Program",
    description:
      "Free to join. Post short videos about free trading bots and get paid monthly — up to $1,250. No followers needed, nothing to buy, build a team with friends.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Get Paid to Post — Clunoid Creator Program",
    description: "Free to join. Post short videos, get paid monthly — up to $1,250. No followers needed, nothing to buy.",
  },
};

const FAQ: Qa[] = [
  {
    q: "Is the Clunoid Creator Program a scam?",
    text:
      "No. The simplest test for any paid-to-post offer is which direction the money moves. Here it only ever moves from us to you. There is no joining fee, no training package, no upgrade, no deposit and no subscription. We never ask for card details, bank passwords or crypto payments, and we never will. If anyone asks you to pay to join the Clunoid Creator Program, it is not us.",
    a: (
      <>
        <P>
          No. The quickest test for any paid-to-post offer is <b style={{ color: "#eaf2fb" }}>which direction the money moves</b>. Here it
          only ever moves from us to you.
        </P>
        <P>
          There is no joining fee, no training package, no upgrade, no deposit and no subscription. We never ask for card details, bank
          passwords or crypto payments, and we never will. If anybody ever asks you to pay to join the Clunoid Creator Program,{" "}
          <b style={{ color: "#eaf2fb" }}>that is not us</b>.
        </P>
      </>
    ),
  },
  {
    q: "What do you get out of paying me?",
    text:
      "Reach, and it is cheaper than advertising. We would otherwise hand that budget to an ad platform, and an honest video from a real person is worth more than an advert nobody watches. Paying creators is simply where our marketing money goes.",
    a: (
      <P>
        Reach, and it is cheaper than advertising. We would otherwise hand that same budget to an ad platform, and an honest video from a
        real person is worth more than an advert nobody watches. Paying creators is simply where our marketing money goes.
      </P>
    ),
  },
  {
    q: "How much does it cost to join?",
    text:
      "Nothing. Joining is free, staying in is free, and every trading bot on Clunoid is free to use. There is no paid tier and nothing held back behind a payment.",
    a: (
      <P>
        Nothing. Joining is free, staying in is free, and <b style={{ color: "#eaf2fb" }}>every trading bot on Clunoid is free to use</b>.
        There is no paid tier and nothing held back behind a payment.
      </P>
    ),
  },
  {
    q: "Do I need followers?",
    text:
      "No. There is no follower minimum, no audience requirement and no application to pass. You are paid for posting the required days, not for being popular. Views only matter for the optional 500 dollar bonus.",
    a: (
      <P>
        No. There is no follower minimum, no audience requirement and no application to pass. You are paid for posting the required days.
        If you have never posted a video in your life, you can start today.
      </P>
    ),
  },
  {
    q: "Do I have to deposit money or trade to be a creator?",
    text:
      "No. You connect a Deriv account because that is how your dashboard recognises you across your devices, but you do not have to fund it, deposit anything or place a single real trade to be paid as a creator. The bot you record for your videos runs in simulation.",
    a: (
      <>
        <P>
          No. You connect a Deriv account because that is how your dashboard recognises you — including on a second phone or laptop, so your
          progress follows you. But you do <b style={{ color: "#eaf2fb" }}>not</b> have to fund it, deposit anything, or place a single real
          trade to be paid as a creator.
        </P>
        <P>The bot you record for your videos runs in simulation, so making your footage risks nothing at all.</P>
      </>
    ),
  },
  {
    q: "Do I need to show my face, or expensive equipment?",
    text:
      "Neither. Faceless videos are welcome. A phone is enough: record your screen while a bot runs, talk over it, and edit it in CapCut, which is free. Your own voice or a realistic AI voice are both allowed.",
    a: (
      <P>
        Neither. Faceless videos are welcome. A phone is enough: record your screen while a bot runs, talk over it, and edit it in CapCut,
        which is free. Your own voice or a realistic AI voice are both fine.
      </P>
    ),
  },
  {
    q: "What exactly counts as a posted day?",
    text:
      "One video, posted to your three chosen platforms, is one posted day. A paid month is 28 posted days, which is 30 calendar days with two grace days built in. Days 1 to 14 want one video a day and days 15 to 28 want two. Your month starts at your first confirmed post, not the day you registered.",
    a: (
      <>
        <P>
          One video, posted to your three chosen platforms, is <b style={{ color: "#eaf2fb" }}>one posted day</b>. Posting the same video to
          all three counts once, not three times.
        </P>
        <P>
          A paid month is 28 posted days — thirty calendar days with two grace days. Days 1–14 want one a day, days 15–28 want two. Your
          month starts at your first confirmed post, not the day you registered, so signing up and starting a week later costs you nothing.
        </P>
      </>
    ),
  },
  {
    q: "How and when do I get paid?",
    text:
      "You choose your payout method in your dashboard and it is shown back to you in Earnings, so you always know where the money is going. The payout is released when the month's posted days are complete. Nothing is paid before the days are done, and nothing is deducted from it.",
    a: (
      <>
        <P>
          You choose your payout method in your dashboard and it is shown back to you in <b style={{ color: "#eaf2fb" }}>Earnings</b>, so you
          always know where the money is going. You can change it before the month is out.
        </P>
        <P>
          The payout is released when the month&apos;s posted days are complete. Nothing is paid before the days are done, and nothing is
          deducted from it — the figure you see is the figure you get.
        </P>
      </>
    ),
  },
  {
    q: "What if a video gets no views?",
    text:
      "You are still paid. The monthly payment is for posting the required days, not for going viral. Views decide only the optional 500 dollar bonus, so a quiet month costs you the bonus and nothing else.",
    a: (
      <P>
        You are still paid. The monthly payment is for posting, not for going viral. Views decide only the optional $500 bonus, so a quiet
        month costs you the bonus and nothing else.
      </P>
    ),
  },
  {
    q: "Which countries can join, and which language do I post in?",
    text:
      "The programme is open worldwide. You pick your country when you register, and you post in English or in a language widely spoken in your country. Because some platforms are restricted in some countries, you choose which three platforms you post on rather than being forced onto a fixed set.",
    a: (
      <>
        <P>Open worldwide. You pick your country when you register, and you post in English or in a language widely spoken where you are.</P>
        <P>
          Because some platforms are blocked or restricted in some countries, you choose <b style={{ color: "#eaf2fb" }}>which three</b>{" "}
          platforms you post on rather than being pushed onto a fixed set — TikTok, Instagram Reels, YouTube Shorts, Facebook Reels and
          others are all available.
        </P>
      </>
    ),
  },
  {
    q: "Can I join with friends and build a team?",
    text:
      "Yes, and it pays. Every creator gets their own invite link and code. When someone you brought is paid, you are paid 20 dollars for them, on request, on top of your own earnings. There is no limit on team size and your friends earn exactly what you earn.",
    a: (
      <P>
        Yes, and it is one of the better ways to earn here. Your invite link and code are yours; when somebody you brought is paid,{" "}
        <Money>$20</Money> is paid to you on request. There is no cap on team size, and your friends are never paid less for having joined
        through you.
      </P>
    ),
  },
  {
    q: "What am I not allowed to do?",
    text:
      "Do not re-upload somebody else's video as your own. Do not re-post a video you already posted before as if it were new. Do not promise anybody guaranteed profits. And do not hide or delete your posts before your payout, because they are how the month is verified.",
    a: (
      <>
        <P>
          The rules are short and they exist to keep everyone honest. Do not re-upload somebody else&apos;s video as your own. Do not re-post
          a video you already posted before as if it were new. Do not promise anybody guaranteed profits, because nobody can. And{" "}
          <b style={{ color: "#eaf2fb" }}>do not hide or delete your posts before your payout</b> — they are how the month is verified.
        </P>
        <P>We check accounts ourselves. Posting from real accounts and leaving the posts up is all that is required of you.</P>
      </>
    ),
  },
  {
    q: "Is my personal information safe?",
    text:
      "We ask for a name, an email, a country and where to send your payment, and nothing else. There is no password to lose because there is no account to sign into. We never ask for your social account passwords and we never post as you.",
    a: (
      <P>
        We ask for a name, an email, a country and where to send your payment — nothing else. There is no password to lose because there is
        no account to sign into: your browser holds a private key that identifies you. We never ask for your social account passwords, and we
        never post as you.
      </P>
    ),
  },
  {
    q: "What are the bots I will be posting about?",
    text:
      "Free automated trading bots that run on your own connected account. You keep custody of the account and can stop them whenever you like. There is nothing to buy, and there is a simulation mode, which is what you record for your videos.",
    a: (
      <>
        <P>
          Free automated trading bots that run on your own connected account — you keep custody of the account and can stop them whenever you
          like. There is nothing to buy, and there is a simulation mode, which is what you record for your videos.
        </P>
        <P>
          You never have to explain how a bot works internally to make a good video. Show it running, say it is free, say where to find it.
        </P>
      </>
    ),
  },
];

const HOWTO_LD = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to join the Clunoid Creator Program",
  description: "Four steps from finding the programme to getting paid.",
  totalTime: "PT10M",
  estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
  step: [
    {
      "@type": "HowToStep",
      name: "Connect a Deriv account",
      text: "The Creator Program lives inside the Clunoid dashboard, so you connect your Deriv account first. Connecting is free and takes about a minute.",
      url: "https://www.clunoid.com/trading",
    },
    {
      "@type": "HowToStep",
      name: "Open the Creator Program and register",
      text: "Give your name, email and country, and choose the three platforms you will post on. Registration is free.",
    },
    {
      "@type": "HowToStep",
      name: "Post short videos",
      text: "Record a free bot running, add a voice over, edit it and post the same video to your three accounts. That counts as one posted day.",
    },
    {
      "@type": "HowToStep",
      name: "Get paid",
      text: "Complete the required posted days in a month and your payout is released to the method you chose.",
    },
  ],
};

const PAGE_LD = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${URL}#page`,
  url: URL,
  name: "Get Paid to Post — Clunoid Creator Program",
  description:
    "Clunoid pays creators monthly to post short videos about free trading bots. Free to join, no follower requirement, up to $1,250 a month.",
  inLanguage: "en",
  publisher: { "@type": "Organization", name: "Clunoid", url: "https://www.clunoid.com/" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Clunoid Trading", item: "https://www.clunoid.com/trading" },
      { "@type": "ListItem", position: 2, name: "Creator Program", item: URL },
    ],
  },
};

const PAY = [
  ["First month, posting from social accounts you already had", "$100"],
  ["First month, from brand new accounts you opened for this", "$50"],
  ["Every month you keep going", "+$50"],
  ["Monthly ceiling", "$750"],
  ["Half your videos in a month reaching 10,000 views", "+$500"],
  ["Each friend you bring, once they are paid", "$20"],
] as const;

export default function CreatorProgramPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(PAGE_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(HOWTO_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(faqLd(FAQ)) }} />

      <SeoShell>
        <SeoTop
          links={[
            { href: "/trading/is-clunoid-legit", label: "Is it legit?" },
            { href: "/trading", label: "Free bots" },
          ]}
        />

        <section className="pt-5">
          <Eyebrow>Creator Program · free to join</Eyebrow>
          <H1>Get paid every month to post about Clunoid</H1>
          <Lede>
            Post short videos about free trading bots and we pay you monthly — <b>up to <Money>$1,250</Money></b>. You pay nothing to join,
            you never pay us anything at any point, and you do not need followers. <b>Money only ever moves from us to you.</b>
          </Lede>
          <CtaRow>
            <Btn href="/trading">Start here — it is free</Btn>
            <Btn href="#faq" kind="ghost">Read the questions first</Btn>
          </CtaRow>
          <p className="mt-3 text-[13.5px]" style={{ color: "#586a80" }}>
            The Creator Program lives inside your dashboard, so you connect a free Deriv account first. That takes about a minute, and you
            never have to deposit anything.
          </p>
        </section>

        <H2>What you actually do</H2>
        <P>There is no clever catch to explain. You make short videos about free trading bots, you post them, and at the end of the month you are paid.</P>
        <Steps
          items={[
            <><b>Record a bot running.</b> Open a bot, start it, and screen record it. That clip is your footage — it takes a couple of minutes and costs nothing.</>,
            <><b>Talk over it and edit it.</b> Say what people are watching, say the bots are free. Your own voice or an AI voice, and you never have to be on camera.</>,
            <><b>Post it to your three platforms.</b> The same video on all three counts as <b>one posted day</b>.</>,
            <><b>Log the day and get paid.</b> Complete the month&apos;s posted days and your payout is released to the method you chose.</>,
          ]}
        />

        <H2>What it pays</H2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-[14.5px]">
            <thead>
              <tr>
                <th className="border-b p-3 text-left text-[12px] font-bold uppercase tracking-[0.1em]" style={{ borderColor: "rgba(255,255,255,0.09)", color: "#586a80" }}>What</th>
                <th className="border-b p-3 text-right text-[12px] font-bold uppercase tracking-[0.1em]" style={{ borderColor: "rgba(255,255,255,0.09)", color: "#586a80" }}>You get</th>
              </tr>
            </thead>
            <tbody>
              {PAY.map(([what, amount]) => (
                <tr key={what}>
                  <td className="border-b p-3 align-top" style={{ borderColor: "rgba(255,255,255,0.09)", color: "#93a7bd" }}>{what}</td>
                  <td className="whitespace-nowrap border-b p-3 text-right font-extrabold" style={{ borderColor: "rgba(255,255,255,0.09)", color: "#34d399" }}>{amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>
          A paid month is <b>28 posted days</b> — thirty calendar days with two grace days built in, because life happens. Days 1–14 want one
          video a day; days 15–28 want two.
        </P>

        <H2>Why this is safe to join</H2>
        <Cards>
          <Card title="Nothing to pay, ever">No joining fee, no course, no upgrade, no subscription, no deposit. If anyone asks you to pay to join, it is not us.</Card>
          <Card title="No card details">We never ask for card numbers, bank passwords or crypto transfers. We ask where to send your money, never how to take it.</Card>
          <Card title="You keep your accounts">Your social accounts stay yours. We never ask for your passwords and never post as you.</Card>
          <Card title="No approval queue">There is no application to pass and nobody deciding whether you are good enough. You register and start the same day.</Card>
          <Card title="You are paid for posting">Not for going viral. A video that flops still counts. Views only decide the optional bonus.</Card>
          <Card title="Free is the whole message">You are asked to tell people the bots are free — because they are. You are never asked to sell anyone anything.</Card>
        </Cards>

        <Join title="Bring your friends. You all earn.">
          <P>
            Every creator gets their own invite link and code. When someone you brought completes their month and is paid,{" "}
            <b>you are paid <Money>$20</Money> for them</b>, on request, on top of everything you earn yourself.
          </P>
          <Ticks
            items={[
              "No limit on how many people you bring.",
              "Your friends earn exactly what you earn — nobody is paid less for joining through somebody else.",
              "Nobody pays anybody to join. Your $20 comes from us, never out of their money.",
              "Joined without a link? You can still connect to a friend's team afterwards with their code.",
            ]}
          />
          <CtaRow>
            <Btn href="/trading">Join free and start today</Btn>
          </CtaRow>
        </Join>

        <H2 id="faq">Questions people ask before joining</H2>
        <Faq items={FAQ} />

        <Join title="You have read it. There is nothing to pay.">
          <P>Connect, register, post your first video today, and the clock starts on your first month.</P>
          <CtaRow>
            <Btn href="/trading">Start here — free</Btn>
            <Btn href="/trading/is-clunoid-legit" kind="ghost">Is Clunoid legit?</Btn>
          </CtaRow>
        </Join>

        <Risk>
          <b style={{ color: "#eaf2fb" }}>An honest word about trading.</b> Clunoid is about automated trading, and trading real money
          carries real risk — you can lose what you put in. Nothing here is a promise of profit and nothing here is financial advice. That is
          exactly why the Creator Program does not require you to trade or deposit anything:{" "}
          <b style={{ color: "#eaf2fb" }}>your creator earnings do not depend on trading results at all</b>. If you do choose to trade, only
          ever risk money you can afford to lose.
        </Risk>

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
