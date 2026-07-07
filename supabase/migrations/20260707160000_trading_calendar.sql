-- Economic-calendar CACHE. The ForexFactory JSON feed rate-limits aggressively
-- (HTTP 429 after a couple of rapid requests), so fetching it live on every
-- terminal state load made the calendar flicker between real events and a false
-- "Quiet — no events" whenever a load tripped the limit.
--
-- Fix: the autonomous scanner (every 5 min, well within the feed's limit) is the
-- ONLY fetcher; it upserts the full event list here on SUCCESS and never
-- overwrites good data with a failure. The terminal reads this single row, so
-- the display is stable and never hits the provider.
create table if not exists public.trading_calendar (
  id         int primary key default 1 check (id = 1),  -- single-row cache
  events     jsonb not null default '[]'::jsonb,        -- full event list (all impacts)
  fetched_at timestamptz not null default now()         -- last SUCCESSFUL fetch
);

alter table public.trading_calendar enable row level security;
drop policy if exists "trading admin read calendar" on public.trading_calendar;
create policy "trading admin read calendar" on public.trading_calendar
  for select using (public.is_trading_admin());
-- no insert/update/delete policies → only the service role (scanner) writes.
