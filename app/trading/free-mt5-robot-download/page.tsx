import type { Metadata } from "next";
import { ldJson } from "@/lib/marketing/content";
import {
  C, Shell, TopBar, Hero, Section, Grid, Card, Steps, Table, Faq, Close, Disclaimer,
  DownloadCta, faqLd,
} from "@/components/trading/seo/Kit";

/**
 * /trading/free-mt5-robot-download — the largest query cluster we have.
 *
 * Search Console shows "deriv mt5 robot free download", "mt5 automated trading
 * robot free download" and "free trading bot for mt5" collecting impressions
 * every week and converting none of them, because the only page that answered
 * them was a landing page that mentions MT5 in passing.
 *
 * EVERYTHING IS FREE. Nothing on Clunoid is for sale — the automations still in
 * testing are locked until they are ready, not priced. An earlier version of
 * this page quoted purchase prices for them, which was simply untrue.
 *
 * Nothing here links to a .mq5 either. An Expert Advisor is inert without a
 * broker account behind it, so every download button goes to the landing page
 * to connect first; the file is reached from the bot's own page after that.
 */
export const metadata: Metadata = {
  title: { absolute: "Free MT5 Robot Download — 2 Expert Advisors, No Payment" },
  description:
    "Two free MetaTrader 5 trading robots — forex and Volatility indices, fully automated. Everything on Clunoid is free. Connect, download, install in five minutes.",
  alternates: { canonical: "/trading/free-mt5-robot-download" },
  openGraph: {
    type: "article",
    url: "https://www.clunoid.com/trading/free-mt5-robot-download",
    title: "Free MT5 Robot Download — 2 Expert Advisors, No Payment",
    description:
      "Two free MetaTrader 5 Expert Advisors covering forex and Volatility indices. Everything on Clunoid is free — no payment, ever.",
  },
};

const FAQ = [
  {
    q: "Is the MT5 robot download really free?",
    a: "Yes, and so is everything else on Clunoid. Nothing is for sale — there is no paid tier, no licence key and no subscription anywhere on the site. Two Expert Advisors are ready to download today, the General MT5 AI Automation and Aggressive MT5. You connect a broker account first, because an Expert Advisor has nothing to trade on without one.",
  },
  {
    q: "How do I install an MT5 robot?",
    a: "Connect your broker account on the Clunoid home page first, then open the robot's page and download the .mq5 file. In MetaTrader 5 open File then Open Data Folder and copy it into MQL5/Experts. Restart MT5 or press Compile in MetaEditor, drag the robot onto any one chart, set your risk profile and enable Algo Trading. It takes about five minutes.",
  },
  {
    q: "Which broker do these MT5 robots work with?",
    a: "They are written for Deriv MT5 and that is where they are tested. They are standard MQL5 Expert Advisors, so they will load on any MetaTrader 5 terminal, but symbol names differ between brokers and we only verify behaviour on Deriv MT5.",
  },
  {
    q: "Do I need to leave my computer on for an MT5 robot to trade?",
    a: "Only if you run it locally. MetaTrader 5 includes a Virtual Private Server: right-click the robot in the Navigator and choose Register a Virtual Server, and it keeps trading with your machine switched off.",
  },
  {
    q: "What is an Expert Advisor?",
    a: "An Expert Advisor, or EA, is a program that trades automatically inside MetaTrader 5. It is a file you install on your own terminal. It runs on your computer, under your account, and it keeps working whether or not our website is online.",
  },
  {
    q: "Do the MT5 robots use a stop loss?",
    a: "Yes. Every position opens with its stop and its target already attached, so the trade closes itself at whichever is reached first. Position size is calculated from your balance and your chosen risk profile rather than being a fixed lot you have to guess at.",
  },
  {
    q: "Can an MT5 robot lose money?",
    a: "Yes, and any download page telling you otherwise is lying. Every strategy has losing trades. These robots have been tested taking profitable trades, but your result depends on the balance you fund, the risk profile you choose and whether you let the stop loss do its job.",
  },
];

const LD = faqLd(FAQ);

const cx = { background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: 5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.92em" } as const;

export default function FreeMt5RobotDownload() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(LD) }} />
      <Shell>
        <TopBar />

        <Hero
          eyebrow="Free download · No licence key"
          title={<>Free MT5 robot download — <span style={{ color: C.profit }}>two Expert Advisors</span>, no payment.</>}
        >
          <p>
            Two fully automated MetaTrader 5 robots, <strong style={{ color: C.text }}>completely
            free</strong> — no card, no licence key, no subscription. They cover forex majors and
            Deriv&rsquo;s Volatility indices from a single chart, size every position to your balance,
            and attach a stop and a target the moment a trade opens.
          </p>
          <p>
            <strong style={{ color: C.text }}>Everything on Clunoid is free.</strong> There is no paid
            tier and nothing on the site is for sale. The automations you cannot open yet are in
            testing, not behind a price.
          </p>
          <p>
            You connect a broker account first — an Expert Advisor has nothing to trade on without one
            — and then the robot runs inside{" "}
            <strong style={{ color: C.text }}>your own terminal, on your own account</strong>.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <DownloadCta>Connect and download</DownloadCta>
          </div>
        </Hero>

        <Section
          kicker="The two free robots"
          title="What each one trades"
          intro="Both are free all-in-one automations: one Expert Advisor, one chart, no per-market setup. The difference is how hard they push."
        >
          <Grid min={320}>
            <Card tone="accent" title="General MT5 AI Automation" note="the balanced one">
              <p>
                The all-in-one automation. Install it once on a single chart and it covers{" "}
                <strong style={{ color: C.text }}>forex and Volatility indices together</strong>, sizing
                every position to your balance and protecting it the moment it opens.
              </p>
              <p>
                You pick a risk profile — conservative through aggressive — and it runs hands-free from
                there.
              </p>
              <p style={{ color: C.faint }}>File: <code style={cx}>ClunoidMT5.mq5</code></p>
            </Card>
            <Card tone="accent" title="Aggressive MT5" note="full throttle">
              <p>
                The same coverage — forex majors and Volatility indices — running its{" "}
                <strong style={{ color: C.text }}>full analysis on your own terminal</strong>, with no
                signal feed and no connection required at all.
              </p>
              <p>
                One risk mode only: full position size and the widest open-risk cap. Every trade is still
                sized to your balance and still opens under a hard stop.
              </p>
              <p style={{ color: C.faint }}>File: <code style={cx}>ClunoidAggressiveMT5.mq5</code></p>
            </Card>
            <Card title="And the ones you cannot open yet">
              <p>
                Clunoid is also building advanced MT5 automations — trend, index-dip, breakout, crypto
                momentum and long-short strategies. Those are{" "}
                <strong style={{ color: C.text }}>locked while they are in testing</strong>, and they
                will be free too when they open.
              </p>
              <p>
                Nothing on this site is for sale. If a bot will not open, it is not finished — it is not
                waiting for your money.
              </p>
            </Card>
          </Grid>
        </Section>

        <Section
          kicker="Setup"
          title="Installing an MT5 robot, in five steps"
          intro="About five minutes, and you only do it once. These are the same steps the bot's own page gives."
        >
          <Steps
            items={[
              {
                title: "Connect, then copy it into MQL5/Experts",
                body: <>Connect on the home page, download the file from the robot&rsquo;s page, then in MetaTrader 5 use <code style={cx}>File → Open Data Folder</code> and drop it into <code style={cx}>MQL5/Experts</code>.</>,
              },
              {
                title: "Allow the WebRequest",
                body: <>Go to <code style={cx}>Tools → Options → Expert Advisors</code>, tick <strong style={{ color: C.text }}>Allow WebRequest</strong> and add <code style={cx}>https://www.clunoid.com</code>.</>,
              },
              {
                title: "Restart or compile",
                body: <>Restart MT5, or press <strong style={{ color: C.text }}>Compile</strong> in MetaEditor. The robot then appears in the Navigator under Expert Advisors.</>,
              },
              {
                title: "Drop it on one chart",
                body: <>Drag it onto <strong style={{ color: C.text }}>any single chart</strong>, set <code style={cx}>InpProfile</code> to your risk level, and switch on <strong style={{ color: C.text }}>Algo Trading</strong>.</>,
              },
              {
                title: "Register a virtual server",
                body: <>Optional but recommended. Right-click the robot → <strong style={{ color: C.text }}>Register a Virtual Server</strong> and it keeps trading with your computer off.</>,
              },
            ]}
          />
        </Section>

        <Section
          kicker="Before you switch it on"
          title="The settings that decide your result"
          intro="The robot handles entries, exits and position sizing. These four are yours, and they matter more than which robot you picked."
        >
          <Table
            head={["Setting", "What it does", "Sensible first choice"]}
            rows={[
              ["Risk profile", "Scales position size and how much of the account may be exposed at once.", "The most conservative one available"],
              ["Account balance", "Position size is calculated from it, so it sets the scale of everything.", "Enough that a losing run is survivable"],
              ["Demo first", "Same live prices, no money at stake.", "Run it for a week before going live"],
              ["Algo Trading", "The master switch. Off means the robot watches and does nothing.", "On, once the other three are settled"],
            ]}
          />
          <Grid min={300}>
            <Card tone="good" title="What it does for you">
              <p>
                Executes without hesitating, without revenge-trading after a loss, without getting bored
                at 3am. Every position opens with its stop and target already set, so the risk on a trade
                is decided before the trade exists.
              </p>
            </Card>
            <Card tone="bad" title="What it will not do">
              <p>
                Win every trade. No robot does, on MT5 or anywhere else — and a free download claiming
                otherwise is the oldest trick there is.
              </p>
              <p>
                It also will not stop you over-trading, raising the risk profile after a bad day, or
                funding it with money you need.{" "}
                <a href="/trading/is-clunoid-legit" style={{ color: C.profitSoft }}>That part stays yours.</a>
              </p>
            </Card>
          </Grid>
        </Section>

        <Section kicker="Questions" title="MT5 robots, answered">
          <Faq items={FAQ.map((f) => ({ q: f.q, a: <p>{f.a}</p> }))} />
        </Section>

        <Close
          title="Download it, run it on demo, decide afterwards"
          cta="Connect and download"
          links={[
            { href: "/trading/is-clunoid-legit", label: "Is Clunoid legit?" },
            { href: "/trading/free-deriv-bots", label: "Free Deriv bots" },
            { href: "/trading/ai-trading-robot", label: "What an AI trading robot does" },
          ]}
        >
          <p>
            Connect a broker account on the home page and the robots are yours — free, like everything
            else here. Once installed they run on your own terminal and need nothing further from us.
          </p>
        </Close>

        <Disclaimer />
      </Shell>
    </>
  );
}
