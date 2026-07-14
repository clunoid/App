-- VLAB — video history for the prompt→3D-animated-short studio. Every produced
-- video is expensive (~$5-8 of generation), so runs persist: the screenplay, all
-- shot assets, and the final MP4 (also copied to storage for permanence).
-- Owner-scoped RLS from day one (same model as career_*); the feature itself is
-- admin-only at the API layer until public launch.

create table if not exists public.vlab_videos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  topic       text not null,
  title       text not null default '',
  plan        jsonb,                        -- the full screenplay (VlabPlan)
  shots       jsonb not null default '[]'::jsonb, -- per-shot {imageUrl, clipUrl}
  narration   jsonb,                        -- {audioUrl, seconds, lineTimings}
  final_url   text not null default '',     -- fal CDN result
  storage_url text not null default '',     -- permanent Supabase Storage copy
  status      text not null default 'planned'
              check (status in ('planned','producing','done','failed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists vlab_videos_user
  on public.vlab_videos (user_id, created_at desc);
alter table public.vlab_videos enable row level security;
drop policy if exists "vlab own videos" on public.vlab_videos;
create policy "vlab own videos" on public.vlab_videos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
