import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { AuthPrompt } from "@/components/auth/AuthPrompt";
import { BillingGate } from "@/components/billing/BillingGate";
import { ldJson } from "@/lib/marketing/content";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "500", "600"],
});

const SEO_DESCRIPTION =
  "Free, fully automated trading bots for MetaTrader 5 and Deriv. AI-driven Expert Advisors that analyse the market, size every position to your balance and place the trades on your own broker account — forex, gold, crypto, stock indices and synthetic indices, around the clock. You keep custody.";

/**
 * Keywords spanning what people actually search around automated trading. The
 * full topic index lives on the /trading hub (lib/trading/knowledge.ts); this is
 * the short head-term set.
 */
const SEO_KEYWORDS = [
  "Clunoid", "Clunoid Trading", "automated trading", "trading bots", "free trading bots",
  "AI trading bot", "algorithmic trading", "algo trading", "automated forex trading",
  "MT5 bots", "free mt5 bots", "ai mt5 bots", "mt5 expert advisor", "MetaTrader 5 EA",
  "forex robot", "free forex robot", "best forex ea", "expert advisor download",
  "deriv bots", "free deriv bots", "deriv bot download", "deriv mt5", "deriv automation",
  "binary bots", "free binary bots", "pocket option bots", "synthetic indices bot",
  "volatility 75 bot", "boom and crash bot", "gold trading bot", "xauusd ea",
  "crypto trading bot", "bitcoin trading bot", "stock index trading bot",
  "copy trading", "trading automation software", "prop firm ea", "ftmo ea",
  "risk management trading", "position size calculator", "risk reward ratio",
  "what is trading", "forex for beginners", "how to start trading",
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.clunoid.com/#organization",
      name: "Clunoid Trading",
      url: "https://www.clunoid.com/trading",
      logo: "https://www.clunoid.com/icon.svg",
    },
    {
      "@type": "WebSite",
      "@id": "https://www.clunoid.com/#website",
      url: "https://www.clunoid.com",
      name: "Clunoid Trading",
      description: SEO_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": "https://www.clunoid.com/#organization" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.clunoid.com/#app",
      name: "Clunoid Trading",
      url: "https://www.clunoid.com/trading",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web, Windows, MetaTrader 5",
      description: SEO_DESCRIPTION,
      featureList: [
        "Free automated trading bots (Expert Advisors) for MetaTrader 5",
        "Automated Deriv bots that run in the browser on your connected account",
        "Bots for forex, gold and silver, crypto, stock indices and synthetic indices",
        "Every position sized to your balance, with a stop loss and target set on entry",
        "Conservative, moderate and aggressive risk profiles",
        "Runs on any MT5 broker account — you keep custody, we never see a password",
        "Runs 24/7, including weekends on synthetic indices",
      ],
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": "https://www.clunoid.com/#organization" },
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.clunoid.com"),
  title: {
    default: "Clunoid Trading — free automated trading bots for MT5 and Deriv",
    template: "%s · Clunoid Trading",
  },
  description: SEO_DESCRIPTION,
  applicationName: "Clunoid Trading",
  keywords: SEO_KEYWORDS,
  category: "finance",
  authors: [{ name: "Clunoid" }],
  creator: "Clunoid",
  publisher: "Clunoid",
  // NOTE: no `alternates.canonical` here on purpose. A canonical set in the root
  // layout is INHERITED by every route that does not set its own, which would
  // point all 21 trading pages at one URL and drop them from the index. Each
  // page declares its own canonical instead.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    url: "https://www.clunoid.com/trading",
    siteName: "Clunoid Trading",
    locale: "en_US",
    title: "Clunoid Trading — free automated trading bots for MT5 and Deriv",
    description: SEO_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Clunoid Trading — free automated trading bots for MT5 and Deriv",
    description: SEO_DESCRIPTION,
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Clunoid Trading" },
  // Google Search Console verification (also verified via the static HTML file in
  // public/ and the DNS TXT record at the registrar).
  verification: { google: "nZ4tS4HU5SuDFm29AgPfaOm42hMl6jq27wxcLq5hvBk" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1F1E1C",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <head>
        {/* Structured data (Organization + WebSite + SoftwareApplication) for rich results. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(JSON_LD) }} />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>
        {/* Auth + billing overlays, mounted once so they work on every page. */}
        <AuthPrompt />
        <BillingGate />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
