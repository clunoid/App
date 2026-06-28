-- Clunoid App — robust grant model (replaces grant-on-subscription-event).
--
-- Credits are granted ONLY for a CONFIRMED PAID Polar order, deduped on the
-- immutable order id (append-only). This makes grants safe against: unpaid /
-- trial / failed-capture subscriptions (no order → no grant), webhook replays /
-- out-of-order redeliveries (order id seen → skip), and cancel→resubscribe in the
-- same period (a re-subscribe is a NEW paid order → grants legitimately; a
-- past-due recovery has no new order → no grant). Subscription.* events only sync
-- plan/status meta — they never touch credits.

create table if not exists public.billing_grants (
  order_id   text primary key,
  user_id    uuid not null,
  plan       text not null,
  granted    int  not null,
  created_at timestamptz not null default now()
);
alter table public.billing_grants enable row level security;
-- no policies → only the SECURITY DEFINER functions below ever touch this table.

-- Meta-only: keep plan/status/period_end in sync. NEVER changes credits.
create or replace function public.sync_subscription(
  p_user uuid,
  p_plan text,
  p_status text,
  p_period_end timestamptz,
  p_polar_customer text,
  p_polar_subscription text
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
        current_period_end    = coalesce(excluded.current_period_end, public.subscriptions.current_period_end),
        updated_at            = now();
end;
$$;
revoke all on function public.sync_subscription(uuid, text, text, timestamptz, text, text) from anon, authenticated;

-- Grant credits for a PAID order (idempotent on order_id). On UPGRADE (bigger
-- allowance) carry over the UNUSED portion — capped at the old allowance — plus
-- the new allowance; renewal / same / downgrade resets to the new allowance.
create or replace function public.grant_for_order(
  p_order_id text,
  p_user uuid,
  p_plan text,
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
declare
  cur_balance int;
  cur_grant   int;
  new_balance int;
  rows int;
begin
  if p_order_id is null or p_user is null or p_plan is null then return; end if;

  -- idempotency: each order grants AT MOST once
  insert into public.billing_grants (order_id, user_id, plan, granted)
    values (p_order_id, p_user, p_plan, p_grant)
    on conflict (order_id) do nothing;
  get diagnostics rows = row_count;
  if rows = 0 then
    -- already granted for this order → just keep the subscription meta fresh
    perform public.sync_subscription(p_user, p_plan, 'active', p_period_end, p_polar_customer, p_polar_subscription);
    return;
  end if;

  insert into public.credit_balances (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance, monthly_grant into cur_balance, cur_grant from public.credit_balances where user_id = p_user;

  if p_grant > coalesce(cur_grant, 0) then
    new_balance := least(coalesce(cur_balance, 0), coalesce(cur_grant, 0)) + p_grant; -- upgrade: carry unused (capped) + new
  else
    new_balance := p_grant;                                                            -- renewal / same / downgrade: reset
  end if;

  update public.credit_balances
     set balance = new_balance, monthly_grant = p_grant, period_start = now(), updated_at = now()
   where user_id = p_user;

  insert into public.credit_ledger (user_id, delta, balance_after, action, meta)
    values (p_user, new_balance - coalesce(cur_balance, 0), new_balance, 'grant:' || p_plan,
            jsonb_build_object('order', p_order_id, 'grant', p_grant));

  perform public.sync_subscription(p_user, p_plan, 'active', p_period_end, p_polar_customer, p_polar_subscription);
end;
$$;
revoke all on function public.grant_for_order(text, uuid, text, int, text, text, timestamptz) from anon, authenticated;

-- The previous grant-on-subscription-event path is retired.
drop function if exists public.apply_subscription(uuid, text, text, int, text, text, timestamptz, text);
