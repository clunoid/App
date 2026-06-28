-- Clunoid App — billing: subscriptions, credit balances, and metered usage.
--
-- Security model (no bypass):
--  • Users can only ever READ their own rows (strict RLS, SELECT-own).
--  • Users NEVER write these tables directly. Spending happens through the
--    SECURITY DEFINER function `consume_credits`, which keys on auth.uid() and
--    deducts atomically so a balance can never go negative or be spent for
--    another user. Subscription grants happen only through `apply_subscription`,
--    called by the signature-verified Polar webhook (service-role).
--  • Free tier = 150 credits / month, refilled lazily (no cron) on first use
--    after the period elapses.

-- ── tables ───────────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  plan                   text not null default 'free',     -- 'free' | 'pro' | 'max'
  status                 text not null default 'active',    -- 'active' | 'canceled' | 'past_due'
  polar_customer_id      text,
  polar_subscription_id  text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "own subscription - select" on public.subscriptions;
create policy "own subscription - select" on public.subscriptions
  for select using (auth.uid() = user_id);
-- (no INSERT/UPDATE/DELETE policy → clients can't write; only the service-role webhook does)

create table if not exists public.credit_balances (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  balance        int not null default 150,
  monthly_grant  int not null default 150,
  period_start   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.credit_balances enable row level security;
drop policy if exists "own credits - select" on public.credit_balances;
create policy "own credits - select" on public.credit_balances
  for select using (auth.uid() = user_id);
-- (no client writes; only the SECURITY DEFINER functions below)

create table if not exists public.credit_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  delta         int not null,
  balance_after int not null,
  action        text not null,
  meta          jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists credit_ledger_user_created
  on public.credit_ledger (user_id, created_at desc);
alter table public.credit_ledger enable row level security;
drop policy if exists "own ledger - select" on public.credit_ledger;
create policy "own ledger - select" on public.credit_ledger
  for select using (auth.uid() = user_id);
-- (no client writes; inserted only by consume_credits)

-- ── spend the CURRENT user's credits (race-safe, never negative) ──────────────
create or replace function public.consume_credits(
  p_amount int,
  p_action text,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  newbal int;
  cur    int;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'invalid amount';
  end if;

  -- make sure the user has a balance row (defensive; trigger/backfill create it)
  insert into public.credit_balances (user_id) values (uid)
    on conflict (user_id) do nothing;

  -- lazy monthly refill: once the period elapses, reset to the monthly grant
  -- (use-it-or-lose-it). For paid users the webhook keeps period_start fresh.
  update public.credit_balances
     set balance = monthly_grant, period_start = now(), updated_at = now()
   where user_id = uid
     and now() >= period_start + interval '1 month';

  -- atomic guarded deduction: only succeeds if there's enough, so the balance
  -- can never go below zero even under concurrent requests.
  update public.credit_balances
     set balance = balance - p_amount, updated_at = now()
   where user_id = uid and balance >= p_amount
   returning balance into newbal;

  if newbal is null then
    select balance into cur from public.credit_balances where user_id = uid;
    return jsonb_build_object('ok', false, 'balance', coalesce(cur, 0));
  end if;

  insert into public.credit_ledger (user_id, delta, balance_after, action, meta)
    values (uid, -p_amount, newbal, p_action, coalesce(p_meta, '{}'::jsonb));

  return jsonb_build_object('ok', true, 'balance', newbal);
end;
$$;
revoke all on function public.consume_credits(int, text, jsonb) from anon;
grant execute on function public.consume_credits(int, text, jsonb) to authenticated;

-- ── apply a subscription / grant (webhook only, via service-role) ─────────────
create or replace function public.apply_subscription(
  p_user uuid,
  p_plan text,
  p_status text,
  p_grant int,
  p_polar_customer text,
  p_polar_subscription text,
  p_period_end timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, plan, status, polar_customer_id, polar_subscription_id, current_period_end, updated_at)
    values (p_user, p_plan, p_status, p_polar_customer, p_polar_subscription, p_period_end, now())
  on conflict (user_id) do update
    set plan                  = excluded.plan,
        status                = excluded.status,
        polar_customer_id     = coalesce(excluded.polar_customer_id, public.subscriptions.polar_customer_id),
        polar_subscription_id = coalesce(excluded.polar_subscription_id, public.subscriptions.polar_subscription_id),
        current_period_end    = excluded.current_period_end,
        updated_at            = now();

  -- refill credits to the plan's monthly grant and reset the period
  insert into public.credit_balances (user_id, balance, monthly_grant, period_start, updated_at)
    values (p_user, p_grant, p_grant, now(), now())
  on conflict (user_id) do update
    set monthly_grant = excluded.monthly_grant,
        balance       = excluded.balance,
        period_start  = now(),
        updated_at    = now();
end;
$$;
-- service-role bypasses grants; revoke from public roles for clarity/safety.
revoke all on function public.apply_subscription(uuid, text, text, int, text, text, timestamptz) from anon, authenticated;

-- ── new users get profile + free subscription + free credits ──────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;

  insert into public.credit_balances (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── refund (best-effort, on a failed action) — service-role ONLY ──────────────
-- Called by the server (admin client) when an already-charged action fails, so a
-- user never loses credits for a result they didn't get. NOT user-callable (that
-- would let anyone mint credits) — revoked from anon/authenticated.
create or replace function public.refund_credits(p_user uuid, p_amount int, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare newbal int;
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  update public.credit_balances
     set balance = balance + p_amount, updated_at = now()
   where user_id = p_user
   returning balance into newbal;
  if newbal is not null then
    insert into public.credit_ledger (user_id, delta, balance_after, action, meta)
      values (p_user, p_amount, newbal, p_action || ':refund', '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.refund_credits(uuid, int, text) from anon, authenticated;

-- ── per-user rate limit (bounds burst speed even within a credit budget) ──────
create table if not exists public.rate_events (
  user_id    uuid not null,
  action     text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_lookup on public.rate_events (user_id, action, created_at desc);
alter table public.rate_events enable row level security;
-- no policies at all → clients can never read or write it (only the definer fn).

create or replace function public.rate_check(p_action text, p_max int, p_window_secs int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cnt int;
begin
  if uid is null then return false; end if;
  -- opportunistic cleanup so the table can't grow unbounded
  if random() < 0.05 then
    delete from public.rate_events where created_at < now() - interval '1 hour';
  end if;
  select count(*) into cnt from public.rate_events
    where user_id = uid and action = p_action
      and created_at > now() - make_interval(secs => p_window_secs);
  if cnt >= p_max then return false; end if;
  insert into public.rate_events (user_id, action) values (uid, p_action);
  return true;
end;
$$;
revoke all on function public.rate_check(text, int, int) from anon;
grant execute on function public.rate_check(text, int, int) to authenticated;

-- ── backfill existing users so everyone is metered from day one ───────────────
insert into public.subscriptions (user_id, plan, status)
  select id, 'free', 'active' from auth.users
  on conflict (user_id) do nothing;
insert into public.credit_balances (user_id)
  select id from auth.users
  on conflict (user_id) do nothing;
