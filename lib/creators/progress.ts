/**
 * CREATOR PROGRAM — where a creator is in their month.
 *
 * Pure functions, no React and no database, so the same maths runs on the server
 * (when answering /api/creators/me) and in the browser (when re-rendering a
 * countdown every second) and cannot disagree with itself.
 *
 * The rules being modelled:
 *   · The clock starts at the FIRST POST, not at registration.
 *   · A month is 28 POSTED days, not 28 dates on a calendar. 30 days with 2
 *     grace days is the same number said the other way round — miss a day and
 *     you have not failed, you have simply not reached 28 yet.
 *   · Your first 14 posted days ask for 1 video; from your 15th they ask for 2.
 *     That is counted in posted days too, so missing a week does not shove you
 *     into the two-a-day stretch before you are ready for it.
 *   · Every video goes to all the platforms the creator picked — together, that
 *     is one post.
 *
 * The consequence worth understanding: a creator who disappears for a week and
 * comes back can tick the days they actually posted and carry on. Nothing is
 * lost, the finish line just moves out by however long they were away.
 */

export const PROGRAM_DAYS = 30;          // the shape of a month, for display
export const GRACE_DAYS = 2;
export const QUALIFYING_DAYS_NEEDED = PROGRAM_DAYS - GRACE_DAYS; // 28 — the real finish line
export const PACE_CHANGE_DAY = 15;       // first POSTED day that asks for two
export const PAYOUT_LEAD_DAYS = 10;      // finish → paid by (3 working-day check + 7)

/** Never grow the calendar past this many dates, however long someone takes. */
const MAX_CALENDAR_DAYS = 120;

export type PostRow = { posted_on: string; slot: number; platforms: string[]; link: string | null };

export type Phase = "awaiting_first_post" | "running" | "payout_due";

/** Videos required on the creator's Nth POSTED day. */
export function requiredOn(postedDay: number): number {
  if (postedDay < 1) return 0;
  return postedDay < PACE_CHANGE_DAY ? 1 : 2;
}

/** Videos a whole month asks for: 14×1 + 14×2 = 42. */
export const TOTAL_REQUIRED = Array.from(
  { length: QUALIFYING_DAYS_NEEDED },
  (_, i) => requiredOn(i + 1),
).reduce((a, b) => a + b, 0);

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
  /** Which posted day this is — 1..28 once it qualifies, else the one it would become. */
  day: number;
  date: string;           // YYYY-MM-DD
  required: number;       // 1 or 2
  done: number;           // videos logged, capped at required
  qualified: boolean;
  isToday: boolean;
  isPast: boolean;        // elapsed and not today
  isFuture: boolean;
  missed: boolean;        // elapsed, not today, nothing logged
};

export type Progress = {
  phase: Phase;
  startDate: string | null;
  today: string;
  /** Which posted day they are working on: 1..28. */
  day: number;
  requiredToday: number;
  doneToday: number;
  todayDone: boolean;
  days: DayState[];
  postsLogged: number;
  qualifyingDays: number;
  missedDays: number;         // elapsed dates with nothing logged
  daysLeft: number;           // posted days still needed
  paceChangeDate: string | null;  // when they reach posted day 15, if known
  finishDate: string | null;      // projected, if they post every day from today
  paidByDate: string | null;
  payoutOpensAt: string | null;
  percent: number;            // 0..100 of the month's videos delivered
  canLogToday: boolean;
};

const EMPTY: Progress = {
  phase: "awaiting_first_post",
  startDate: null, today: "", day: 0,
  requiredToday: 1, doneToday: 0, todayDone: false,
  days: [], postsLogged: 0, qualifyingDays: 0, missedDays: 0,
  daysLeft: QUALIFYING_DAYS_NEEDED,
  paceChangeDate: null, finishDate: null, paidByDate: null, payoutOpensAt: null,
  percent: 0, canLogToday: true,
};

/**
 * Build the whole picture from the two facts we store: when the first post was
 * confirmed, and every post row logged since.
 */
export function computeProgress(firstPostAt: string | null, posts: PostRow[], now: Date = new Date()): Progress {
  const today = dayKey(now);
  if (!firstPostAt) return { ...EMPTY, today };

  const startDate = dayKey(firstPostAt);

  // Videos logged per calendar date.
  const perDay = new Map<string, number>();
  for (const p of posts) {
    const k = p.posted_on.slice(0, 10);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  // How far the calendar has to reach: the whole month's shape, everything that
  // has already happened, and enough room ahead to finish from here.
  const elapsed = Math.max(0, daysBetween(startDate, today)) + 1;
  const span = Math.min(MAX_CALENDAR_DAYS, Math.max(PROGRAM_DAYS, elapsed + QUALIFYING_DAYS_NEEDED));

  const days: DayState[] = [];
  let qualifying = 0;
  let delivered = 0;
  let missedDays = 0;
  let paceChangeDate: string | null = null;
  let finishDate: string | null = null;

  for (let i = 0; i < span; i++) {
    const date = addDays(startDate, i);
    const diff = daysBetween(date, today);
    const isToday = diff === 0;
    const isPast = diff > 0;
    const isFuture = diff < 0;

    // Which posted day this date would be, given everything that qualified
    // before it. Missing a day pushes the pace change out rather than skipping it.
    const nth = Math.min(qualifying + 1, QUALIFYING_DAYS_NEEDED);
    const required = requiredOn(nth);
    const done = Math.min(perDay.get(date) ?? 0, required);
    const qualified = done >= required && qualifying < QUALIFYING_DAYS_NEEDED;

    if (qualified) {
      qualifying++;
      delivered += done;
      if (nth === PACE_CHANGE_DAY && !paceChangeDate) paceChangeDate = date;
      if (qualifying === QUALIFYING_DAYS_NEEDED && !finishDate) finishDate = date;
    } else if (isPast) {
      missedDays++;
    }

    days.push({
      day: nth, date, required, done, qualified,
      isToday, isPast, isFuture,
      missed: isPast && !qualified,
    });

    // Stop once the month is complete and today is covered — no point drawing
    // empty squares past the finish line.
    if (qualifying >= QUALIFYING_DAYS_NEEDED && !isFuture) break;
  }

  const done = qualifying >= QUALIFYING_DAYS_NEEDED;
  const daysLeft = Math.max(0, QUALIFYING_DAYS_NEEDED - qualifying);
  const day = Math.min(qualifying + (done ? 0 : 1), QUALIFYING_DAYS_NEEDED);

  const requiredToday = done ? 0 : requiredOn(day);
  const doneToday = perDay.get(today) ?? 0;

  // Not yet finished? Project the finish from here, assuming they post daily.
  if (!finishDate) finishDate = addDays(today, Math.max(0, daysLeft - 1));
  if (!paceChangeDate && qualifying < PACE_CHANGE_DAY) {
    paceChangeDate = addDays(today, Math.max(0, PACE_CHANGE_DAY - qualifying - 1));
  }

  const paidByDate = addDays(finishDate, PAYOUT_LEAD_DAYS);

  return {
    phase: done ? "payout_due" : "running",
    startDate, today, day,
    requiredToday, doneToday,
    todayDone: requiredToday > 0 && doneToday >= requiredToday,
    days,
    postsLogged: posts.length,
    qualifyingDays: qualifying,
    missedDays,
    daysLeft,
    paceChangeDate, finishDate, paidByDate,
    // The window opens at the END of the finishing day, i.e. midnight after it.
    payoutOpensAt: new Date(Date.parse(finishDate + "T00:00:00Z") + MS_DAY).toISOString(),
    percent: Math.min(100, Math.round((delivered / TOTAL_REQUIRED) * 100)),
    canLogToday: !done && doneToday < requiredToday,
  };
}

/**
 * What a month pays, before any bonus.
 * $100 normally, $50 for brand-new accounts, then +$50 a month to a $750 ceiling.
 */
export function baseForMonth(month: number, newAccounts: boolean): number {
  if (month <= 1) return newAccounts ? 50 : 100;
  return Math.min(100 + (month - 1) * 50, 750);
}
