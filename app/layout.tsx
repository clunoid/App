import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SessionProvider } from "@/components/auth/SessionProvider";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://clunoid.com"),
  title: { default: "Clunoid", template: "%s · Clunoid" },
  description:
    "Clunoid — talk to Isaac, a super-intelligent AI that shows you anything, solves any problem, and brings ideas to life with synced visuals.",
  applicationName: "Clunoid",
  keywords: ["Clunoid", "Isaac", "AI", "voice AI", "ask anything", "explainer", "calculator", "study"],
  authors: [{ name: "Clunoid" }],
  openGraph: {
    type: "website",
    url: "https://clunoid.com",
    siteName: "Clunoid",
    title: "Clunoid",
    description: "Talk to Isaac — a super-intelligent AI that shows you anything.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clunoid",
    description: "Talk to Isaac — a super-intelligent AI that shows you anything.",
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Clunoid" },
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
      <body>
        <SessionProvider>{children}</SessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
