-- Bucket-accurate refunds. consume_credits drains the MONTHLY allowance first, then
-- PURCHASED — but the two existing refund RPCs each restore a FIXED bucket:
--   • refund_credits         → always MONTHLY  (a purchased-funded TTS line refunded
--                               here is lost at the next monthly reset)
--   • refund_credits_purchased → always PURCHASED (a monthly-funded plan refunded here
--                               launders expiring allowance into permanent credits and
--                               can self-unlock the purchased>0 access gate)
-- Fix: consume_credits now RETURNS the exact per-bucket split it spent, and a new
-- refund restores EACH bucket by exactly what was taken from it. Additive + backward
-- compatible: existing callers read {ok, balance} and ignore the new fields.

-- ── consume_credits: same guarded, monthly-first, never-negative spend — now also
--    returns from_balance / from_purchased (computed as the before/after diff under a
--    row lock, so it's exact and concurrency-safe). ────────────────────────────────
create or replace function public.consume_credits(p_amount int, p_action text, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  bal_before int;
  pur_before int;
  newb       int;
  newp       int;
  total      int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'invalid amount'; end if;

  insert into public.credit_balances (user_id) values (uid) on conflict (user_id) do nothing;

  -- lazy monthly refill of the ALLOWANCE only (purchased credits persist)
  update public.credit_balances
     set balance = monthly_grant, period_start = now(), updated_at = now()
   where user_id = uid and now() >= period_start + interval '1 month';

  -- lock the row and read the buckets BEFORE spending, so the split is exact and no
  -- concurrent charge can interleave between the read and the deduction.
  select balance, purchased into bal_before, pur_before
    from public.credit_balances where user_id = uid for update;

  -- atomic guarded deduction across both buckets — RHS reads the OLD row values, so it
  -- drains `balance` first and only the remainder from `purchased` (unchanged logic).
  update public.credit_balances
     set balance    = balance   - least(balance, p_amount),
         purchased   = purchased - greatest(0, p_amount - balance),
         updated_at  = now()
   where user_id = uid and (balance + purchased) >= p_amount
   returning balance, purchased into newb, newp;

  if newb is null then
    return jsonb_build_object('ok', false, 'balance', coalesce(bal_before, 0) + coalesce(pur_before, 0));
  end if;

  total := newb + newp;
  insert into public.credit_ledger (user_id, delta, balance_after, action, meta)
    values (uid, -p_amount, total, p_action, coalesce(p_meta, '{}'::jsonb));
  -- the split: exactly how much came from each bucket (before − after)
  return jsonb_build_object(
    'ok', true,
    'balance', total,
    'from_balance', coalesce(bal_before, 0) - newb,
    'from_purchased', coalesce(pur_before, 0) - newp
  );
end;
$$;
revoke all on function public.consume_credits(int, text, jsonb) from public, anon;
grant execute on function public.consume_credits(int, text, jsonb) to authenticated;

-- ── refund each bucket by exactly what was spent from it (service-role only). The
--    monthly restore is clamped to monthly_grant (a refund right after a charge can
--    never exceed the pre-charge value, so this only guards the rare refill-between
--    race); purchased is restored 1:1 and can never exceed what was drained. ────────
create or replace function public.refund_credits_split(p_user uuid, p_to_balance int, p_to_purchased int, p_action text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  addb int := greatest(0, coalesce(p_to_balance, 0));
  addp int := greatest(0, coalesce(p_to_purchased, 0));
  newbal int;
begin
  if addb = 0 and addp = 0 then return; end if;
  update public.credit_balances
     set balance   = least(monthly_grant, balance + addb),
         purchased  = purchased + addp,
         updated_at = now()
   where user_id = p_user
   returning balance + purchased into newbal;
  if newbal is null then return; end if;
  insert into public.credit_ledger (user_id, delta, balance_after, action)
    values (p_user, addb + addp, newbal, p_action || ':refund');
end;
$$;
revoke all on function public.refund_credits_split(uuid, int, int, text) from public, anon, authenticated;
