-- Motion Graphics history: one JSONB row per generated motion-graphics video (the
-- prompt + the full MotionSpec + voice), so a video can be re-opened and re-rendered
-- from history exactly like games and stat battles. Owner-only RLS; immutable
-- (select/insert/delete, no update) — mirrors game_results.

create table if not exists public.graphics_videos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'Motion graphics',
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists graphics_videos_user_created on public.graphics_videos (user_id, created_at desc);

alter table public.graphics_videos enable row level security;

drop policy if exists "graphics_videos - select own" on public.graphics_videos;
create policy "graphics_videos - select own" on public.graphics_videos
  for select using (auth.uid() = user_id);

drop policy if exists "graphics_videos - insert own" on public.graphics_videos;
create policy "graphics_videos - insert own" on public.graphics_videos
  for insert with check (auth.uid() = user_id);

drop policy if exists "graphics_videos - delete own" on public.graphics_videos;
create policy "graphics_videos - delete own" on public.graphics_videos
  for delete using (auth.uid() = user_id);
