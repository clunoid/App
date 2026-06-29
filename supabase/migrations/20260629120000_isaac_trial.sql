-- Free-tier Isaac (ElevenLabs) voice trial — COST CONTROL.
-- A free user gets Isaac's premium voice for their FIRST game and FIRST search;
-- after that the app falls back to the browser voice / paced text and we stop
-- calling ElevenLabs. Subscribers (pro/max) always get Isaac, and the shareable
-- VIDEO recap narration is NEVER gated. The trial is SERVER-authoritative so it
-- can't be reset by clearing client state — and /api/tts enforces it per line.

create table if not exists public.isaac_trials (
  user_id       uuid not null references auth.users (id) on delete cascade,
  feature       text not null check (feature in ('game', 'search')),
  granted_until timestamptz not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, feature)
);

alter table public.isaac_trials enable row level security;
drop policy if exists "own isaac_trials - select" on public.isaac_trials;
create policy "own isaac_trials - select" on public.isaac_trials
  for select using (auth.uid() = user_id);
-- No client INSERT/UPDATE/DELETE policy: only the SECURITY DEFINER RPCs write.

-- The caller's current plan ('free' when no subscription row).
create or replace function public.isaac_plan() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select plan from public.subscriptions where user_id = auth.uid()), 'free');
$$;

-- Open an Isaac voice window for THIS session, consuming the one-time free trial.
-- Returns true when Isaac is allowed (subscriber, or the free trial just opened),
-- false when the free trial for this feature is already used. The ~15-minute
-- window comfortably covers one game/search; the trial row is permanent, so a
-- second window is never granted.
create or replace function public.grant_isaac(p_feature text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  if p_feature not in ('game', 'search') then return false; end if;
  if public.isaac_plan() in ('pro', 'max') then return true; end if;  -- subscribers: always, no trial spent
  insert into public.isaac_trials (user_id, feature, granted_until)
    values (auth.uid(), p_feature, now() + interval '15 minutes')
    on conflict (user_id, feature) do nothing;
  get diagnostics n = row_count;
  return n > 0;  -- true only on first use (a row was inserted)
end $$;

-- May the caller's CURRENT tts line be voiced by Isaac? Subscribers and the video
-- narration are always allowed; a free user's game/search is allowed only inside
-- an open trial window. Unknown/absent features are denied (no omit-feature bypass).
create or replace function public.isaac_voice_ok(p_feature text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if public.isaac_plan() in ('pro', 'max') then return true; end if;
  if p_feature = 'video' then return true; end if;
  if p_feature in ('game', 'search') then
    return exists (
      select 1 from public.isaac_trials
      where user_id = auth.uid() and feature = p_feature and granted_until > now()
    );
  end if;
  return false;
end $$;

-- Callable ONLY by an authenticated end-user (they key on auth.uid()); never by
-- anon/public. Revoke the default PUBLIC execute grant that SECURITY DEFINER adds.
revoke all on function public.isaac_plan() from public, anon;
grant execute on function public.isaac_plan() to authenticated;
revoke all on function public.grant_isaac(text) from public, anon;
grant execute on function public.grant_isaac(text) to authenticated;
revoke all on function public.isaac_voice_ok(text) from public, anon;
grant execute on function public.isaac_voice_ok(text) to authenticated;
