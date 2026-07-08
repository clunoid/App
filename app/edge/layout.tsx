import { Space_Grotesk, JetBrains_Mono } from "next/font/google";

/**
 * A typeface scoped to /edge ONLY — Space Grotesk (modern geometric display, the
 * feature's new voice) + JetBrains Mono for figures/odds. Loaded here so the rest
 * of Clunoid (Inter/Source-Serif) is completely untouched; the CSS variables live
 * on this wrapper and cascade only into the Edge console.
 */
const display = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--edge-font", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--edge-mono", display: "swap" });

export default function EdgeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${mono.variable}`} style={{ fontFamily: "var(--edge-font), system-ui, sans-serif" }}>
      {children}
    </div>
  );
}
