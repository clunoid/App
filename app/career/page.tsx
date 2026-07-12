import type { Metadata } from "next";
import { CareerConsole } from "@/components/career/CareerConsole";

/**
 * /career — CAREER DESK, the AI job-application platform (admin-only at launch).
 * Same access model as /trading and /edge: the page renders for anyone who
 * reaches it, but EVERY byte flows through /api/career/* routes that verify the
 * server-side session against the immutable admin allow-list (401/403 otherwise)
 * — the console renders sign-in/restricted screens on those. Absent from all
 * navigation, feature registries and the sitemap; noindexed until public launch.
 */
export const metadata: Metadata = {
  title: "Career Desk · Clunoid",
  robots: { index: false, follow: false },
};

export default function CareerPage() {
  return (
    <main>
      <CareerConsole />
    </main>
  );
}
