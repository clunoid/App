import { ShowtimeStageView } from "@/components/showtime/ShowtimeStageView";

export const metadata = { title: "Showtime Stage", robots: { index: false, follow: false } };

/**
 * The OBS Browser Source target. Public route (OBS's Chromium has no session) but
 * secured by the unguessable stage key in the URL — it renders nothing and reacts to
 * nothing without the admin's key, and there's no sensitive data on it, only animations.
 */
export default function ShowtimeStagePage() {
  return <ShowtimeStageView />;
}
