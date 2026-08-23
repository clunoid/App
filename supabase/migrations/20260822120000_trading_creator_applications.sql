-- CREATOR PROGRAM APPLICATIONS
--
-- One row per person applying to make videos about Clunoid and get paid monthly.
-- The row is the record of the whole cycle: when they applied, when they were
-- approved (which starts their 30 days), and the dates that follow from it.
--
-- Server-only: RLS is ON with NO policies, so anon/authenticated clients read
-- nothing. Every read and write goes through the service-role client on our own
-- API routes, exactly like public.mt5_purchases.
--
-- Handles are stored without the leading @ and lowercased by the API, so the
-- unique index below actually catches someone applying twice with @Name/name.

create table if not exists public.trading_creator_applications (
  id            uuid primary key default gen_random_uuid(),

  -- who
  name          text not null,
  email         text not null,
  country       text not null,
  user_id       uuid references auth.users(id) on delete set null,

  -- where they will post (at least one required, enforced in the API)
  tiktok        text,
  instagram     text,
  youtube       text,

  -- brand-new accounts earn the reduced first month
  new_accounts  boolean not null default false,

  -- lifecycle
  status        text not null default 'pending',   -- pending | approved | rejected | active | paid
  applied_at    timestamptz not null default now(),
  approved_at   timestamptz,                        -- day 1 of their 30
  note          text,                               -- internal only, never shown to the applicant

  created_at    timestamptz not null default now()
);

-- One application per email, and one per handle, so the same person cannot
-- occupy several seats. Partial indexes skip the nulls.
create unique index if not exists trading_creator_applications_email_key
  on public.trading_creator_applications (lower(email));
create unique index if not exists trading_creator_applications_tiktok_key
  on public.trading_creator_applications (tiktok) where tiktok is not null;
create unique index if not exists trading_creator_applications_instagram_key
  on public.trading_creator_applications (instagram) where instagram is not null;
create unique index if not exists trading_creator_applications_youtube_key
  on public.trading_creator_applications (youtube) where youtube is not null;

create index if not exists trading_creator_applications_status
  on public.trading_creator_applications (status, applied_at desc);

alter table public.trading_creator_applications enable row level security;
-- (No policies on purpose — deny all to non-service-role. All access is
--  server-side through /api/creators/apply and the admin tooling.)
