-- Clunoid App — credit TOP-UPS (one-time purchases) + AUTO-RELOAD.
--
-- Security model (unchanged guarantees):
--  • End users can only READ their own rows; they NEVER mint credits.
--  • Credits are added ONLY for a CONFIRMED PAID Polar order, deduped on the
--    immutable order id (append-only billing_grants) — same path that passed the
--    earlier adversarial audit. Top-up grants are SERVICE-ROLE only.
--  • Auto-reload PREFERENCES are user-set (their own card, their own credits — no
--    cross-user risk), but the off-session CHARGE + the in-flight lock are
--    server-managed; users can't touch the lock or grant themselves credits.
--
-- New "purchased" bucket: bought credits do NOT expire at the monthly reset (only
-- the subscription/free allowance does). Spending drains the monthly allowance
-- first, then purchased.

-- ── persistent purchased-credit bucket ───────────────────────────────────────
alter table public.credit_balances add column if not exists purchased int not null default 0;

-- ── spend monthly allowance FIRST, then purchased (atomic, never negative) ────
create or replace function public.consume_credits(p_amount int, p_action text, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  newb  int;
  newp  int;
  total int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'invalid amount'; end if;

  insert into public.credit_balances (user_id) values (uid) on conflict (user_id) do nothing;

  -- lazy monthly refill of the ALLOWANCE only (purchased credits persist)
  update public.credit_balances
     set balance = monthly_grant, period_start = now(), updated_at = now()
   where user_id = uid and now() >= period_start + interval '1 month';

  -- atomic guarded deduction across both buckets — RHS reads the OLD row values,
  -- so this drains `balance` first and only the remainder from `purchased`.
  update public.credit_balances
     set balance    = balance   - least(balance, p_amount),
         purchased   = purchased - greatest(0, p_amount - balance),
         updated_at  = now()
   where user_id = uid and (balance + purchased) >= p_amount
   returning balance, purchased into newb, newp;

  if newb is null then
    select balance, purchased into newb, newp from public.credit_balances where user_id = uid;
    return jsonb_build_object('ok', false, 'balance', coalesce(newb, 0) + coalesce(newp, 0));
  end if;

  total := newb + newp;
  insert into public.credit_ledger (user_id, delta, balance_after, action, meta)
    values (uid, -p_amount, total, p_action, coalesce(p_meta, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'balance', total);
end;
$$;
revoke all on function public.consume_credits(int, text, jsonb) from public, anon;
grant execute on function public.consume_credits(int, text, jsonb) to authenticated;

-- ── grant purchased credits for a PAID top-up order (idempotent per order) ────
create or replace function public.grant_topup(p_order_id text, p_user uuid, p_credits int, p_polar_customer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare newbal int; rows int;
begin
  if p_order_id is null or p_user is null or p_credits is null or p_credits <= 0 then return; end if;

  -- idempotency: each order tops up AT MOST once (append-only)
  insert into public.billing_grants (order_id, user_id, plan, granted)
    values (p_order_id, p_user, 'topup', p_credits)
    on conflict (order_id) do nothing;
  get diagnostics rows = row_count;
  if rows = 0 then return; end if;

  insert into public.credit_balances (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.credit_balances
     set purchased = purchased + p_credits, updated_at = now()
   where user_id = p_user
   returning balance + purchased into newbal;

  insert into public.credit_ledger (user_id, delta, balance_after, action, meta)
    values (p_user, p_credits, coalesce(newbal, 0), 'topup',
            jsonb_build_object('order', p_order_id, 'credits', p_credits));

  -- remember the Polar customer so we can off-session charge for auto-reload
  if p_polar_customer is not null then
    insert into public.subscriptions (user_id, polar_customer_id)
      values (p_user, p_polar_customer)
    on conflict (user_id) do update
      set polar_customer_id = coalesce(excluded.polar_customer_id, public.subscriptions.polar_customer_id),
          updated_at = now();
  end if;
end;
$$;
revoke all on function public.grant_topup(text, uuid, int, text) from public, anon, authenticated;
grant execute on function public.grant_topup(text, uuid, int, text) to service_role;

-- ── auto-reload settings (user-owned prefs; lock state is server-managed) ─────
create table if not exists public.auto_reload (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  enabled        boolean not null default false,
  threshold      int not null default 100,    -- fire when TOTAL credits < this
  amount_cents   int not null default 1000,   -- charge this much ($10 default)
  reloading      boolean not null default false,  -- in-flight lock (server-only)
  last_reload_at timestamptz,                       -- cooldown anchor (server-only)
  updated_at     timestamptz not null default now(),
  constraint auto_reload_amount_min check (amount_cents >= 500),     -- $5 minimum
  constraint auto_reload_amount_max check (amount_cents <= 50000),   -- $500 sanity cap
  constraint auto_reload_threshold_ok check (threshold >= 0 and threshold <= 100000)
);
alter table public.auto_reload enable row level security;
drop policy if exists "own autoreload - select" on public.auto_reload;
create policy "own autoreload - select" on public.auto_reload for select using (auth.uid() = user_id);
-- no INSERT/UPDATE/DELETE policy → users write ONLY via set_auto_reload (prefs);
-- the lock columns (reloading/last_reload_at) are touched only by the definer fns.

-- Set the CURRENT user's auto-reload preferences (clamped; never touches the lock).
create or replace function public.set_auto_reload(p_enabled boolean, p_threshold int, p_amount_cents int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_amount_cents is null or p_amount_cents < 500 then p_amount_cents := 500; end if;
  if p_amount_cents > 50000 then p_amount_cents := 50000; end if;
  if p_threshold is null or p_threshold < 0 then p_threshold := 0; end if;
  if p_threshold > 100000 then p_threshold := 100000; end if;
  insert into public.auto_reload (user_id, enabled, threshold, amount_cents, updated_at)
    values (uid, coalesce(p_enabled, false), p_threshold, p_amount_cents, now())
  on conflict (user_id) do update
    set enabled = excluded.enabled, threshold = excluded.threshold,
        amount_cents = excluded.amount_cents, updated_at = now();
end;
$$;
revoke all on function public.set_auto_reload(boolean, int, int) from public, anon;
grant execute on function public.set_auto_reload(boolean, int, int) to authenticated;

-- Atomically CLAIM an auto-reload for the current user if eligible (enabled, below
-- threshold, not already reloading, cooldown elapsed). One concurrent caller wins
-- the row lock → no double-charge. Returns { claim, amount_cents }.
create or replace function public.claim_auto_reload()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); amt int;
begin
  if uid is null then return jsonb_build_object('claim', false); end if;
  update public.auto_reload a
     set reloading = true, updated_at = now()
    from public.credit_balances b
   where a.user_id = uid and b.user_id = uid
     and a.enabled
     and (not a.reloading or a.last_reload_at <= now() - interval '10 minutes')   -- stuck-lock recovery
     and (a.last_reload_at is null or a.last_reload_at <= now() - interval '3 minutes')  -- cooldown
     and (coalesce(b.balance, 0) + coalesce(b.purchased, 0)) < a.threshold
   returning a.amount_cents into amt;
  if amt is null then return jsonb_build_object('claim', false); end if;
  return jsonb_build_object('claim', true, 'amount_cents', amt);
end;
$$;
revoke all on function public.claim_auto_reload() from public, anon;
grant execute on function public.claim_auto_reload() to authenticated;

-- Release the in-flight lock after an off-session attempt (service-role only).
create or replace function public.finish_auto_reload(p_user uuid, p_mark_attempt boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.auto_reload
     set reloading = false,
         last_reload_at = case when p_mark_attempt then now() else last_reload_at end,
         updated_at = now()
   where user_id = p_user;
end;
$$;
revoke all on function public.finish_auto_reload(uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_auto_reload(uuid, boolean) to service_role;
