import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { ShowtimeConsole } from "@/components/showtime/ShowtimeConsole";

export const metadata = { title: "Showtime" };

/**
 * SHOWTIME — the live gift-reaction animation stage. Admin-only for now: gated
 * server-side against the immutable admin allow-list (redirects everyone else).
 * Full-bleed, no site chrome — it's a stage.
 */
export default async function ShowtimePage() {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/home");
  return <ShowtimeConsole />;
}
