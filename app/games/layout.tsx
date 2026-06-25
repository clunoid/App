import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Games",
  description: "Quick, fun games hosted by Isaac — starting with Guess the Country by Flag.",
};

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
