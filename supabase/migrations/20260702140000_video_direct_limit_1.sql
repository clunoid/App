-- Reduce the free-tier premium-voice Video Direct allowance from 2 → 1 per month.
-- Subscribers stay unlimited; non-premium voices are still uncapped. Only the two
-- limit-bearing functions change (the table + refund fn are unchanged).

create or replace function public.claim_video_direct()
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  newused int;
begin
  if uid is null then return false; end if;
  if public.isaac_plan() in ('pro', 'max') then return true; end if; -- subscribers unlimited

  insert into public.video_direct_usage (user_id) values (uid) on conflict (user_id) do nothing;
  update public.video_direct_usage
     set used = 0, period_start = date_trunc('month', now()), updated_at = now()
   where user_id = uid and date_trunc('month', now()) > period_start;
  -- atomic guarded increment: 1 free premium video per calendar month
  update public.video_direct_usage
     set used = used + 1, updated_at = now()
   where user_id = uid and used < 1
   returning used into newused;
  return newused is not null;
end;
$$;

create or replace function public.video_direct_status()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u   int := 0;
  r   public.video_direct_usage%rowtype;
begin
  if uid is null then
    return json_build_object('subscriber', false, 'used', 0, 'limit', 1, 'remaining', 0, 'available', false);
  end if;
  if public.isaac_plan() in ('pro', 'max') then
    return json_build_object('subscriber', true, 'used', 0, 'limit', 1, 'remaining', null, 'available', true);
  end if;
  select * into r from public.video_direct_usage where user_id = uid;
  if found and date_trunc('month', now()) <= r.period_start then u := r.used; else u := 0; end if;
  return json_build_object('subscriber', false, 'used', u, 'limit', 1,
                           'remaining', greatest(0, 1 - u), 'available', (1 - u) > 0);
end;
$$;

-- re-assert grants (CREATE OR REPLACE can reset the default PUBLIC EXECUTE grant).
revoke all on function public.claim_video_direct() from public, anon;
grant execute on function public.claim_video_direct() to authenticated;
revoke all on function public.video_direct_status() from public, anon;
grant execute on function public.video_direct_status() to authenticated;
