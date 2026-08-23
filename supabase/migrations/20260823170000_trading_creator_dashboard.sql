-- CREATOR PROGRAM — the dashboard behind registration.
--
-- Registering is no longer the end of the story: the creator gets a dashboard
-- that tracks where they are in their 30 days, what they must do today, and what
-- they have been paid. Three things are needed for that.
--
-- 1. access_token — registration does not create a Clunoid account, so the row
--    needs its own key. The API hands one back on register, the browser keeps it,
--    and every dashboard call presents it. Signed-in creators can also be found
--    by user_id, so they are not stranded if they clear storage.
--
-- 2. first_post_at — the 30 days do NOT start at registration. They start when
--    the creator confirms their first post is live, which is also the point all
--    three handles become mandatory. Until then the clock is not running.
--
-- 3. posts + payouts — a day-by-day record of what was posted, and the money
--    actually paid. Both are the creator's own history, shown back to them.
--
-- Everything stays server-only: RLS on, no policies, service role reads/writes.

alter table public.trading_creator_applications
  add column if not exists access_token  text,
  add column if not exists first_post_at timestamptz;

create unique index if not exists trading_creator_applications_token_idx
  on public.trading_creator_applications (access_token)
  where access_token is not null;

comment on column public.trading_creator_applications.access_token is
  'Secret key the browser presents to read/write its own row. Never exposed to other creators.';
comment on column public.trading_creator_applications.first_post_at is
  'When the creator confirmed their first post went live. This — not registration — is day 1 of the 30.';

-- ── the posting record ─────────────────────────────────────────────────────
-- One row per video posted. Two a day is the maximum the programme asks for
-- (days 15+), so slot is 1 or 2 and the unique index stops a double log.
create table if not exists public.trading_creator_posts (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.trading_creator_applications(id) on delete cascade,

  posted_on      date not null,
  slot           smallint not null default 1 check (slot between 1 and 2),
  platforms      text[] not null default '{}',   -- tiktok | instagram | youtube
  link           text,

  created_at     timestamptz not null default now(),
  unique (application_id, posted_on, slot)
);

create index if not exists trading_creator_posts_app_idx
  on public.trading_creator_posts (application_id, posted_on desc);

-- ── the money ──────────────────────────────────────────────────────────────
-- Written by us when a month is settled. A new creator sees an empty history,
-- which is the truth: nothing has been paid yet.
create table if not exists public.trading_creator_payouts (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.trading_creator_applications(id) on delete cascade,

  month_number   integer not null,
  period_start   date not null,
  period_end     date not null,

  base_usd       numeric(10,2) not null default 0,
  bonus_usd      numeric(10,2) not null default 0,   -- the 10k-views bonus

  status         text not null default 'scheduled',  -- scheduled | requested | approved | paid | cancelled
  requested_at   timestamptz,
  paid_at        timestamptz,
  method         text,
  reference      text,
  note           text,

  created_at     timestamptz not null default now(),
  unique (application_id, month_number)
);

create index if not exists trading_creator_payouts_app_idx
  on public.trading_creator_payouts (application_id, month_number);

alter table public.trading_creator_posts   enable row level security;
alter table public.trading_creator_payouts enable row level security;
