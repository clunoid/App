/**
 * Showtime — live TikTok gift feed data model.
 *
 * The old visual/animation layer (Lottie asset player, canvas engine, choreographed
 * shows and the styled gift catalogue) was removed — the stage is being redesigned from
 * scratch. These are the minimal gift types the Euler feed and the Realtime bus still
 * rely on. Add visual/theme fields back here when the new design is planned.
 */
export type Tier = 1 | 2 | 3 | 4;

export type Gift = {
  id: string;
  name: string;
  emoji: string;
  coins: number; // TikTok coin value — drives the tier
  tier: Tier;
};

/** One received gift (real or simulated), ready to be handled by the stage. */
export type GiftEvent = { gift: Gift; sender: string; count: number; ts: number };
