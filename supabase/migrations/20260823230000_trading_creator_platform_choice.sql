-- CREATOR PROGRAM — creators choose their three platforms.
--
-- Four fixed columns assumed everyone can use the same four apps. They cannot:
-- TikTok is banned in India, blocked or restricted elsewhere, and a creator who
-- physically cannot open one of them was locked out of the whole programme.
--
-- So the rule is now three platforms of the creator's choosing. Instagram,
-- TikTok and YouTube stay the recommended set; the alternates exist for people
-- who cannot use one of those where they live.
--
-- One row per chosen platform. The rows ARE the choice, so a row with a null
-- handle means "picked this, handle still to come". Two indexes carry the rules:
-- one platform once per creator, and one account cannot be used by two creators.

create table if not exists public.trading_creator_handles (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.trading_creator_applications(id) on delete cascade,

  platform       text not null,
  handle         text,               -- null until they fill it in

  created_at     timestamptz not null default now(),
  unique (application_id, platform)
);

-- Null handles do not collide, so unfilled choices never block each other.
create unique index if not exists trading_creator_handles_platform_handle_key
  on public.trading_creator_handles (platform, handle)
  where handle is not null;

create index if not exists trading_creator_handles_app_idx
  on public.trading_creator_handles (application_id);

alter table public.trading_creator_handles enable row level security;

-- Carry across anything already stored in the old columns.
insert into public.trading_creator_handles (application_id, platform, handle)
select a.id, p.platform, p.handle
  from public.trading_creator_applications a
  cross join lateral (values
    ('tiktok',    a.tiktok),
    ('instagram', a.instagram),
    ('facebook',  a.facebook),
    ('youtube',   a.youtube)
  ) as p(platform, handle)
 where p.handle is not null
on conflict do nothing;

alter table public.trading_creator_applications
  drop column if exists tiktok,
  drop column if exists instagram,
  drop column if exists facebook,
  drop column if exists youtube;
