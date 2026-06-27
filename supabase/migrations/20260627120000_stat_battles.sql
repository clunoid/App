-- Clunoid App — Stat Battle history. One row per saved stat battle, holding the
-- full RaceData (entities, keyframes, events, resolved media) as JSON so it can be
-- re-opened, edited, re-rendered to video, or its data sheet re-downloaded. The
-- downloadable "file" is derived from `data`, so it doesn't need separate storage.
-- RLS-protected: a user can only ever read/write/DELETE their OWN battles.

create table if not exists public.stat_battles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'Stat Battle',
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists stat_battles_user_created
  on public.stat_battles (user_id, created_at desc);

alter table public.stat_battles enable row level security;

drop policy if exists "own stat_battles - select" on public.stat_battles;
create policy "own stat_battles - select" on public.stat_battles
  for select using (auth.uid() = user_id);

drop policy if exists "own stat_battles - insert" on public.stat_battles;
create policy "own stat_battles - insert" on public.stat_battles
  for insert with check (auth.uid() = user_id);

drop policy if exists "own stat_battles - update" on public.stat_battles;
create policy "own stat_battles - update" on public.stat_battles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own stat_battles - delete" on public.stat_battles;
create policy "own stat_battles - delete" on public.stat_battles
  for delete using (auth.uid() = user_id);
