-- consume_credits_capped — a "generous" atomic spend used by the Stat Battle Opus step.
--
-- Rule: a custom (Opus) stat battle lists at 500 credits. To be generous, a user with at
-- least HALF (>= the floor) may still create one, but it drains ALL their remaining credits
-- (capped at the list price); below the floor they're blocked. This must be ATOMIC and
-- never go negative, so the cap is computed INSIDE the guarded UPDATE (not from a stale read).
--
-- Deducts least(p_cap, available) from the user's own balance ONLY when
-- (balance + purchased) >= p_min; spends the monthly `balance` bucket first, then
-- `purchased` — identical bucket/guard semantics to consume_credits. Returns the exact
-- amount taken as `charged` so a later failure can refund precisely that.
create or replace function public.consume_credits_capped(
  p_cap int, p_min int, p_action text, p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  newb    int;
  newp    int;
  charged int;
  total   int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_cap is null or p_cap < 0 or p_min is null or p_min < 0 then raise exception 'invalid amount'; end if;

  insert into public.credit_balances (user_id) values (uid) on conflict (user_id) do nothing;

  -- same lazy monthly refill of the ALLOWANCE bucket as consume_credits (purchased persists)
  update public.credit_balances
     set balance = monthly_grant, period_start = now(), updated_at = now()
   where user_id = uid and now() >= period_start + interval '1 month';

  -- Atomic: lock the row, compute the cap (least(p_cap, total)) from the OLD values, and
  -- deduct ONLY if total >= p_min. Drains `balance` first, the remainder from `purchased`.
  -- (balance + purchased) >= p_min is the floor; least(...) keeps it non-negative.
  with cur as (
    select cb.user_id,
           cb.balance,
           cb.purchased,
           least(p_cap, cb.balance + cb.purchased) as chg
      from public.credit_balances cb
     where cb.user_id = uid and (cb.balance + cb.purchased) >= p_min
     for update
  )
  update public.credit_balances cb
     set balance    = cb.balance   - least(cb.balance, cur.chg),
         purchased  = cb.purchased - greatest(0, cur.chg - cb.balance),
         updated_at = now()
    from cur
   where cb.user_id = cur.user_id
   returning cb.balance, cb.purchased, cur.chg into newb, newp, charged;

  if newb is null then
    -- floor not met → no charge
    select balance, purchased into newb, newp from public.credit_balances where user_id = uid;
    return jsonb_build_object('ok', false, 'balance', coalesce(newb, 0) + coalesce(newp, 0), 'charged', 0);
  end if;

  total := newb + newp;
  insert into public.credit_ledger (user_id, delta, balance_after, action, meta)
    values (uid, -charged, total, p_action, coalesce(p_meta, '{}'::jsonb));
  return jsonb_build_object('ok', true, 'balance', total, 'charged', charged);
end;
$$;

revoke all on function public.consume_credits_capped(int, int, text, jsonb) from public, anon;
grant execute on function public.consume_credits_capped(int, int, text, jsonb) to authenticated;
