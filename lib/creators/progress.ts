/**
 * CREATOR PROGRAM — where a creator is in their 30 days.
 *
 * Pure functions, no React and no database, so the same maths runs on the server
 * (when answering /api/creators/me) and in the browser (when re-rendering a
 * countdown every second) and cannot disagree with itself.
 *
 * The rules being modelled, all of which come from the programme page:
 *   · The clock starts at the FIRST POST, not at registration.
 *   · Days 1–14 ask for 1 video a day; days 15–30 ask for 2.
 *   · Every video goes to all three platforms — that together is one post.
 *   · 2 grace days a month, so 28 qualifying days out of 30 is a pass.
 *   · Payout can be requested on day 30 and is paid within 7 days, after a
 *     3 working-day check.
 */

export const PROGRAM_DAYS = 30;
export const PACE_CHANGE_DAY = 15; // first day that asks for two
export const GRACE_DAYS = 2;
export const QUALIFYING_DAYS_NEEDED = PROGRAM_DAYS - GRACE_DAYS; // 28
export const PAYOUT_LEAD_DAYS = 10; // day 30 → paid by (3 working-day check + 7)

export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type PostRow = { posted_on: string; slot: number; platforms: string[]; link: string | null };

export type Phase = "awaiting_first_post" | "running" | "payout_due" | "finished";

/** Videos required on a given day of the programme. */
export function requiredOn(day: number): number {
  if (day < 1 || day > PROGRAM_DAYS) return 0;
  return day < PACE_CHANGE_DAY ? 1 : 2;
}

/** Total videos the whole 30 days asks for: 14×1 + 16×2 = 46. */
export const TOTAL_REQUIRED = Array.from({ length: PROGRAM_DAYS }, (_, i) => requiredOn(i + 1)).reduce((a, b) => a + b, 0);

const MS_DAY = 86_400_000;

/** Calendar date in UTC as YYYY-MM-DD. Day boundaries are UTC everywhere so a
 *  creator's day count cannot shift when they travel. */
export function dayKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, n: number): string {
  return dayKey(new Date(Date.parse(key + "T00:00:00Z") + n * MS_DAY));
}

/** Whole days between two YYYY-MM-DD keys. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / MS_DAY);
}

export type DayState = {
  day: number;            // 1..30
  date: string;           // YYYY-MM-DD
  required: number;       // 1 or 2
  done: number;           // videos logged
  qualified: boolean;     // done >= required
  isToday: boolean;
  isPast: boolean;        // elapsed and not today
  missed: boolean;        // elapsed, not today, and short
};

export type Progress = {
  phase: Phase;
  startDate: string | null;      // day 1
  today: string;
  day: number;                   // 0 before the clock starts, else 1..30 (clamped)
  requiredToday: number;
  doneToday: number;
  todayDone: boolean;
  days: DayState[];              // always 30 entries once started
  postsLogged: number;
  qualifyingDays: number;
  missedDays: number;
  graceLeft: number;
  onTrack: boolean;              // still able to reach 28 qualifying days
  daysLeft: number;
  paceChangeDate: string | null; // day 15
  finishDate: string | null;     // day 30
  paidByDate: string | null;
  payoutOpensAt: string | null;  // ISO instant the day-30 countdown lands on
  percent: number;               // 0..100 of required videos delivered
};

/**
 * Build the whole picture from the two facts we store: when the first post was
 * confirmed, and every post row logged since.
 */
export function computeProgress(firstPostAt: string | null, posts: PostRow[], now: Date = new Date()): Progress {
  const today = dayKey(now);

  if (!firstPostAt) {
    return {
      phase: "awaiting_first_post",
      startDate: null, today, day: 0,
      requiredToday: 1, doneToday: 0, todayDone: false,
      days: [], postsLogged: 0, qualifyingDays: 0, missedDays: 0,
      graceLeft: GRACE_DAYS, onTrack: true, daysLeft: PROGRAM_DAYS,
      paceChangeDate: null, finishDate: null, paidByDate: null, payoutOpensAt: null,
      percent: 0,
    };
  }

  const startDate = dayKey(firstPostAt);
  const finishDate = addDays(startDate, PROGRAM_DAYS - 1);
  const paceChangeDate = addDays(startDate, PACE_CHANGE_DAY - 1);
  const paidByDate = addDays(finishDate, PAYOUT_LEAD_DAYS);

  // Videos logged per calendar day.
  const perDay = new Map<string, number>();
  for (const p of posts) {
    const k = p.posted_on.slice(0, 10);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  const rawDay = daysBetween(startDate, today) + 1;
  const day = Math.min(Math.max(rawDay, 1), PROGRAM_DAYS);

  const days: DayState[] = [];
  let qualifyingDays = 0;
  let missedDays = 0;
  let delivered = 0;

  for (let n = 1; n <= PROGRAM_DAYS; n++) {
    const date = addDays(startDate, n - 1);
    const required = requiredOn(n);
    const done = Math.min(perDay.get(date) ?? 0, required);
    const qualified = done >= required;
    const isToday = date === today;
    const isPast = daysBetween(date, today) > 0;

    if (qualified) qualifyingDays++;
    if (isPast && !qualified) missedDays++;
    delivered += done;

    days.push({ day: n, date, required, done, qualified, isToday, isPast, missed: isPast && !qualified });
  }

  const postsLogged = posts.length;
  const requiredToday = rawDay >= 1 && rawDay <= PROGRAM_DAYS ? requiredOn(day) : 0;
  const doneToday = perDay.get(today) ?? 0;

  // Days still ahead (today included) that could still qualify.
  const remainingDays = Math.max(0, PROGRAM_DAYS - day + (doneToday >= requiredToday ? 0 : 1));
  const onTrack = qualifyingDays + remainingDays >= QUALIFYING_DAYS_NEEDED;

  const finished = daysBetween(finishDate, today) >= 0;
  const phase: Phase = finished ? "payout_due" : "running";

  return {
    phase,
    startDate, today, day,
    requiredToday, doneToday, todayDone: requiredToday > 0 && doneToday >= requiredToday,
    days, postsLogged, qualifyingDays, missedDays,
    graceLeft: Math.max(0, GRACE_DAYS - missedDays),
    onTrack,
    daysLeft: Math.max(0, PROGRAM_DAYS - day),
    paceChangeDate, finishDate, paidByDate,
    // The day-30 window opens at the END of day 30, i.e. midnight after it.
    payoutOpensAt: new Date(Date.parse(finishDate + "T00:00:00Z") + MS_DAY).toISOString(),
    percent: Math.round((delivered / TOTAL_REQUIRED) * 100),
  };
}

/**
 * What the first month's payout will be, before any bonus.
 * $100 normally, $50 for brand-new accounts, then +$50 a month to a $750 ceiling.
 */
export function baseForMonth(month: number, newAccounts: boolean): number {
  if (month <= 1) return newAccounts ? 50 : 100;
  return Math.min(100 + (month - 1) * 50, 750);
}
