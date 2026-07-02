-- Video Direct (Guess the Country) — free-tier premium-voice quota.
--
-- Every Video Direct generation is CREDIT-charged (Opus planning + per-line TTS),
-- exactly like the other features. ON TOP of that, PREMIUM-voice (Isaac / future paid
-- voice) videos are capped for the free tier: 2 per calendar month. Subscribers are
-- unlimited (counter untouched). Non-premium (Clunoid studio / silent) videos never
-- touch this counter. Server-authoritative, mirroring the isaac_trials pattern.

create table if not exists public.video_direct_usage (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  period_start timestamptz not null default date_trunc('month', now()),
  used         int not null default 0,
  updated_at   timestamptz not null default now()
);

alter table public.video_direct_usage enable row level security;

-- Clients may READ their own counter (for the "X of 2 left" strip); they may NEVER
-- write it — the count only moves through the SECURITY DEFINER functions below.
drop policy if exists "video_direct_usage - select own" on public.video_direct_usage;
create policy "video_direct_usage - select own" on public.video_direct_usage
  for select using (auth.uid() = user_id);

/* Consume one PREMIUM-voice video slot. Subscribers always pass (counter untouched).
 * Free users pass only while used < 2 this calendar month; the increment is atomic
 * (guarded UPDATE) so two concurrent renders can't both take the last slot. Lazy
 * monthly reset — no cron — mirroring consume_credits. Returns true if allowed. */
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
  -- lazy calendar-month reset
  update public.video_direct_usage
     set used = 0, period_start = date_trunc('month', now()), updated_at = now()
   where user_id = uid and date_trunc('month', now()) > period_start;
  -- atomic guarded increment (only succeeds while under the 2/month free cap)
  update public.video_direct_usage
     set used = used + 1, updated_at = now()
   where user_id = uid and used < 2
   returning used into newused;
  return newused is not null;
end;
$$;

/* Read-only status for the UI — never mutates (a due monthly reset is applied in the
 * read only, so a stale row reports the full 2 remaining without writing). */
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
    return json_build_object('subscriber', false, 'used', 0, 'limit', 2, 'remaining', 0, 'available', false);
  end if;
  if public.isaac_plan() in ('pro', 'max') then
    return json_build_object('subscriber', true, 'used', 0, 'limit', 2, 'remaining', null, 'available', true);
  end if;
  select * into r from public.video_direct_usage where user_id = uid;
  if found and date_trunc('month', now()) <= r.period_start then u := r.used; else u := 0; end if;
  return json_build_object('subscriber', false, 'used', u, 'limit', 2,
                           'remaining', greatest(0, 2 - u), 'available', (2 - u) > 0);
end;
$$;

/* Compensating decrement — return a burnt slot if the render/plan hard-fails after a
 * successful claim. Service-role only (never user-callable), like refund_credits. */
create or replace function public.refund_video_direct(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.video_direct_usage
     set used = greatest(0, used - 1), updated_at = now()
   where user_id = p_user;
end;
$$;

-- SECURITY DEFINER grants EXECUTE to PUBLIC by default; lock that down (mirrors the
-- isaac_trial / lock_billing_functions convention).
revoke all on function public.claim_video_direct() from public, anon;
grant execute on function public.claim_video_direct() to authenticated;
revoke all on function public.video_direct_status() from public, anon;
grant execute on function public.video_direct_status() to authenticated;
revoke all on function public.refund_video_direct(uuid) from public, anon, authenticated;
