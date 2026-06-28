-- Clunoid App — billing: smooth upgrades (carry-over credits) + idempotent grants.
--
-- When a user UPGRADES (e.g. Pro→Max), their remaining credits are KEPT and the
-- new plan's monthly allowance is ADDED on top (balance = remaining + new grant).
-- Renewals / downgrades RESET to the plan's allowance (use-it-or-lose-it).
-- Every grant is idempotent on a (plan, period) key so duplicate webhook events
-- (e.g. subscription.created + subscription.active for the same purchase) only
-- grant once.

alter table public.credit_balances add column if not exists last_grant_key text;

-- Old 7-arg version is replaced by the 8-arg version below.
drop function if exists public.apply_subscription(uuid, text, text, int, text, text, timestamptz);

create or replace function public.apply_subscription(
  p_user uuid,
  p_plan text,
  p_status text,
  p_grant int,
  p_polar_customer text,
  p_polar_subscription text,
  p_period_end timestamptz,
  p_grant_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_balance int;
  cur_grant   int;
  last_key    text;
  new_balance int;
begin
  -- subscription meta is always kept in sync
  insert into public.subscriptions (user_id, plan, status, polar_customer_id, polar_subscription_id, current_period_end, updated_at)
    values (p_user, p_plan, p_status, p_polar_customer, p_polar_subscription, p_period_end, now())
  on conflict (user_id) do update
    set plan                  = excluded.plan,
        status                = excluded.status,
        polar_customer_id     = coalesce(excluded.polar_customer_id, public.subscriptions.polar_customer_id),
        polar_subscription_id = coalesce(excluded.polar_subscription_id, public.subscriptions.polar_subscription_id),
        current_period_end    = coalesce(excluded.current_period_end, public.subscriptions.current_period_end),
        updated_at            = now();

  insert into public.credit_balances (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance, monthly_grant, last_grant_key into cur_balance, cur_grant, last_key
    from public.credit_balances where user_id = p_user;

  -- idempotent: this (plan, period) was already granted → meta-only update above is enough
  if p_grant_key is not null and p_grant_key is not distinct from last_key then
    return;
  end if;

  -- UPGRADE (bigger monthly allowance than before) → keep remaining + add new allowance.
  -- Renewal / same / downgrade → reset to the plan's allowance.
  if p_grant > coalesce(cur_grant, 0) then
    new_balance := coalesce(cur_balance, 0) + p_grant;
  else
    new_balance := p_grant;
  end if;

  update public.credit_balances
     set balance = new_balance, monthly_grant = p_grant, period_start = now(),
         last_grant_key = p_grant_key, updated_at = now()
   where user_id = p_user;

  insert into public.credit_ledger (user_id, delta, balance_after, action, meta)
    values (p_user, new_balance - coalesce(cur_balance, 0), new_balance, 'grant:' || p_plan,
            jsonb_build_object('key', p_grant_key, 'grant', p_grant));
end;
$$;
revoke all on function public.apply_subscription(uuid, text, text, int, text, text, timestamptz, text) from anon, authenticated;

-- Subscription ended → back to free (clear the grant key so a future re-subscribe grants again).
create or replace function public.downgrade_to_free(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare cur_balance int;
begin
  update public.subscriptions
     set plan = 'free', status = 'canceled', current_period_end = null, updated_at = now()
   where user_id = p_user;

  select balance into cur_balance from public.credit_balances where user_id = p_user;
  update public.credit_balances
     set balance = 150, monthly_grant = 150, period_start = now(), last_grant_key = null, updated_at = now()
   where user_id = p_user;

  insert into public.credit_ledger (user_id, delta, balance_after, action, meta)
    values (p_user, 150 - coalesce(cur_balance, 0), 150, 'downgrade:free', '{}'::jsonb);
end;
$$;
revoke all on function public.downgrade_to_free(uuid) from anon, authenticated;
