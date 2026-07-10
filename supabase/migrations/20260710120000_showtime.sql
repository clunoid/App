-- SHOWTIME ARCADE — persistence backbone.
--
-- Three concerns: (1) crash-resume snapshots so a stage/browser restart resumes the
-- war in ~2s instead of wiping it (TikTok LIVE Studio has documented multi-hour
-- crash reports — restarts must be non-events); (2) persistent gifter recognition
-- (all-time leaderboards, veteran wars count, best rank) — the research-proven
-- return-visit + status driver; (3) the Monument Wall for 10,000+ coin gifts,
-- shown in every future stream.
--
-- SECURITY: the stage page is public (sessionless inside the capture browser), so
-- NO client role touches these tables. RLS is enabled with ZERO policies — reads
-- and writes flow exclusively through /api/showtime/persist, which authenticates
-- signed stage credentials (HMAC over the stage key) and writes via service_role.

create table if not exists public.showtime_snapshots (
  key_hash   text primary key,          -- sha256 of the stage key (key itself never stored)
  state      jsonb not null default '{}'::jsonb,
  room       text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.showtime_gifters (
  id          text primary key,         -- TikTok uniqueId (lowercase)
  name        text not null,
  avatar_url  text,
  total_coins bigint not null default 0,
  wars        integer not null default 0,
  best_rank   integer,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create index if not exists showtime_gifters_coins_idx
  on public.showtime_gifters (total_coins desc);

create table if not exists public.showtime_monuments (
  id         bigserial primary key,
  user_id    text not null,
  name       text not null,
  coins      integer not null,
  created_at timestamptz not null default now()
);

create index if not exists showtime_monuments_created_idx
  on public.showtime_monuments (created_at desc);

-- RLS on, no policies: clients (anon/authenticated) can do NOTHING; only the
-- service role (which bypasses RLS) reads/writes via the persist route.
alter table public.showtime_snapshots enable row level security;
alter table public.showtime_gifters   enable row level security;
alter table public.showtime_monuments enable row level security;
