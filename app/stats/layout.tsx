import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stat Battle — animated bar-chart races",
  description: "Describe any ranking over time and watch history race — GDP battles, ELO rankings, populations and more. Export as a shareable video.",
};

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
