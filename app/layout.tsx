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
  "Clunoid is your AI host Isaac — ask anything and watch it answered with synced visuals, build animated Stat Battle bar-chart-race videos from any topic or your own files, play the Guess the Country flag game, and export shareable recap videos with AI captions. Free to start.";

// Broad but relevant keyword set spanning every feature + the terms people search.
const SEO_KEYWORDS = [
  "Clunoid", "Isaac AI", "Clunoid AI", "talk to AI", "AI host", "voice AI", "conversational AI",
  "ask AI anything", "AI that shows you anything", "AI explainer", "AI answers with visuals",
  "super-intelligent AI", "AI assistant", "AI search", "learn anything", "AI tutor", "study tool", "AI calculator",
  "stat battle", "bar chart race", "bar chart race maker", "animated bar chart race", "data race video",
  "data visualization", "data visualization video", "chart animation", "statistics video", "data storytelling",
  "PDF to chart", "CSV to chart", "turn data into video", "infographic video maker",
  "guess the country", "flag quiz", "flag game", "country quiz", "world flags game", "geography game", "AI trivia game",
  "recap video maker", "shareable video maker", "social media video maker", "TikTok video maker", "Reels maker",
  "YouTube Shorts maker", "video with AI voiceover", "AI captions", "AI hashtag generator", "auto caption video",
  "AI voice", "AI narration", "text to speech", "AI voice generator", "AI host voices",
  "AI credits", "buy AI credits", "pay as you go AI", "AI auto-reload",
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://clunoid.com/#organization",
      name: "Clunoid",
      url: "https://clunoid.com",
      logo: "https://clunoid.com/icon.svg",
    },
    {
      "@type": "WebSite",
      "@id": "https://clunoid.com/#website",
      url: "https://clunoid.com",
      name: "Clunoid",
      description: SEO_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": "https://clunoid.com/#organization" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://clunoid.com/#app",
      name: "Clunoid",
      url: "https://clunoid.com",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web, iOS, Android",
      description: SEO_DESCRIPTION,
      featureList: [
        "Isaac — a super-intelligent AI host you talk to by voice or text",
        "Ask anything: web-grounded answers with synced animated visuals and info cards",
        "Stat Battles — animated bar-chart-race videos from any topic or your own PDF, CSV or documents",
        "Guess the Country — a voice-hosted flag quiz game (multiple-choice or speak your answer)",
        "Shareable recap videos (vertical & wide) with AI-generated titles, captions and hashtags",
        "Clunoid Voices — choose your AI host voice",
        "File analyzer — turn PDFs, CSVs and documents into data stories",
        "Free HD video export",
        "Credits with pay-as-you-go top-ups and auto-reload",
      ],
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: "Pro", price: "12", priceCurrency: "USD" },
        { "@type": "Offer", name: "Max", price: "30", priceCurrency: "USD" },
      ],
      publisher: { "@id": "https://clunoid.com/#organization" },
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://clunoid.com"),
  title: { default: "Clunoid — Talk to Isaac, an AI that shows you anything", template: "%s · Clunoid" },
  description: SEO_DESCRIPTION,
  applicationName: "Clunoid",
  keywords: SEO_KEYWORDS,
  category: "technology",
  authors: [{ name: "Clunoid" }],
  creator: "Clunoid",
  publisher: "Clunoid",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "https://clunoid.com",
    siteName: "Clunoid",
    locale: "en_US",
    title: "Clunoid — Talk to Isaac, an AI that shows you anything",
    description: SEO_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Clunoid — Talk to Isaac, an AI that shows you anything",
    description: SEO_DESCRIPTION,
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Clunoid" },
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
