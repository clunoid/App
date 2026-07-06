-- CLUNOID TRADING DESK — persistence for the FX analysis platform.
-- Admin-only feature: rows are written EXCLUSIVELY by the service role (the
-- scheduled scanner) and readable ONLY by allow-listed admin user ids. To open
-- the feature up later, widen the SELECT policies — nothing else changes.

-- The admin allow-list lives in one SQL function so policies stay declarative.
-- Mirrors ADMIN_USER_IDS in lib/billing/meter.ts (the immutable owner id).
create or replace function public.is_trading_admin()
returns boolean
language sql
stable
as $$
  select auth.uid() in ('5191f3cf-f0e5-4187-9c08-8921eb57a64c'::uuid)
$$;

-- ── live + historical signals ────────────────────────────────────────────────
create table if not exists public.trading_signals (
  id          uuid primary key default gen_random_uuid(),
  pair        text not null,
  timeframe   text not null,
  direction   text not null check (direction in ('long','short')),
  entry       double precision not null,
  stop        double precision not null,
  targets     double precision[] not null,
  rr          double precision not null,
  confidence  int not null check (confidence between 0 and 100),
  strategy    text not null,
  factors     jsonb not null default '[]'::jsonb,
  structure   text not null default '',
  vol_regime  text not null default 'normal',
  session     text not null default '',
  news_risk   jsonb not null default '{}'::jsonb,
  ai_narrative text,
  warnings    jsonb not null default '[]'::jsonb,
  status      text not null default 'open' check (status in ('open','tp','sl','expired','suppressed')),
  result_r    double precision,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  -- one live signal per pair+strategy+direction at a time (scanner idempotency)
  bar_time    timestamptz not null
);
create unique index if not exists trading_signals_dedupe
  on public.trading_signals (pair, strategy, timeframe, direction, bar_time);
create index if not exists trading_signals_status on public.trading_signals (status, created_at desc);

alter table public.trading_signals enable row level security;
drop policy if exists "trading admin read" on public.trading_signals;
create policy "trading admin read" on public.trading_signals
  for select using (public.is_trading_admin());
-- no insert/update/delete policies → only the service role writes.

-- ── scan heartbeats (health + observability) ────────────────────────────────
create table if not exists public.trading_scans (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  duration_ms int not null default 0,
  market_open boolean not null default true,
  pairs_ok    int not null default 0,
  pairs_err   int not null default 0,
  new_signals int not null default 0,
  resolved    int not null default 0,
  notes       jsonb not null default '[]'::jsonb
);
alter table public.trading_scans enable row level security;
drop policy if exists "trading admin read scans" on public.trading_scans;
create policy "trading admin read scans" on public.trading_scans
  for select using (public.is_trading_admin());

-- keep the heartbeat table bounded (service role runs this opportunistically)
create or replace function public.prune_trading_scans()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.trading_scans
  where id < (select coalesce(max(id),0) - 2000 from public.trading_scans)
$$;
revoke all on function public.prune_trading_scans() from public, anon, authenticated;
