import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guess the Country by Flag",
  description: "A fast, fun flag-guessing game — name the country before the timer runs out.",
};

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
