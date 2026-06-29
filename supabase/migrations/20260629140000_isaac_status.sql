-- Read-only Isaac availability check for the host-voice pickers (game start +
-- create-video). Lets the UI show "Isaac enabled" vs "Isaac off — subscribe"
-- WITHOUT consuming the one-time free trial (grant_isaac is what spends it).
--
-- Mirrors isaac_voice_ok's window logic: a free user has Isaac available until
-- their one-time trial row for this feature has expired (granted_until <= now()).
-- Subscribers always available. Returns JSON { subscriber, available }.
create or replace function public.isaac_status(p_feature text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sub boolean;
  avail boolean;
begin
  if auth.uid() is null then
    return json_build_object('subscriber', false, 'available', false);
  end if;
  sub := public.isaac_plan() in ('pro', 'max');
  if sub then
    avail := true;
  elsif p_feature in ('game', 'search') then
    -- available unless a trial row exists AND has already expired
    avail := not exists (
      select 1 from public.isaac_trials
      where user_id = auth.uid() and feature = p_feature and granted_until <= now()
    );
  else
    avail := false;
  end if;
  return json_build_object('subscriber', sub, 'available', avail);
end
$$;

-- Lock to authenticated only (Postgres grants EXECUTE to PUBLIC by default — must
-- revoke from public, not just anon/authenticated).
revoke all on function public.isaac_status(text) from public, anon;
grant execute on function public.isaac_status(text) to authenticated;
