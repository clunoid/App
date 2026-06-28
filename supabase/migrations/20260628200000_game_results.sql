-- Clunoid App — Game (Guess the Country) history. One row per completed game,
-- holding a snapshot (flags played + per-round results) as JSON so the user can
-- re-play the same flags or build the shareable recap video later. RLS-protected:
-- a user can only ever read / insert / DELETE their OWN games. No UPDATE policy —
-- a played game is an immutable record; deletes are permanent (hard delete).

create table if not exists public.game_results (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'Guess the Country',
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists game_results_user_created
  on public.game_results (user_id, created_at desc);

alter table public.game_results enable row level security;

drop policy if exists "own game_results - select" on public.game_results;
create policy "own game_results - select" on public.game_results
  for select using (auth.uid() = user_id);

drop policy if exists "own game_results - insert" on public.game_results;
create policy "own game_results - insert" on public.game_results
  for insert with check (auth.uid() = user_id);

drop policy if exists "own game_results - delete" on public.game_results;
create policy "own game_results - delete" on public.game_results
  for delete using (auth.uid() = user_id);
