-- Edge match-prediction video history: one JSONB row per generated video (the
-- prompt + the VideoPlan used to render it), so a video can be re-opened from
-- history. Owner-only RLS, immutable — mirrors graphics_videos / game_results.
-- Kept as its OWN table (not graphics_videos) so the Motion Graphics history is
-- completely untouched.
create table if not exists public.edge_videos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'Prediction video',
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists edge_videos_user_created on public.edge_videos (user_id, created_at desc);

alter table public.edge_videos enable row level security;

drop policy if exists "edge_videos - select own" on public.edge_videos;
create policy "edge_videos - select own" on public.edge_videos
  for select using (auth.uid() = user_id);

drop policy if exists "edge_videos - insert own" on public.edge_videos;
create policy "edge_videos - insert own" on public.edge_videos
  for insert with check (auth.uid() = user_id);

drop policy if exists "edge_videos - delete own" on public.edge_videos;
create policy "edge_videos - delete own" on public.edge_videos
  for delete using (auth.uid() = user_id);
