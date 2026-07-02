-- Purchased-bucket refund. refund_credits() restores into the MONTHLY balance, but a
-- charge may have drained the non-expiring `purchased` bucket (consume_credits spends
-- monthly first, then purchased). For features gated on purchased>0 (Motion Graphics),
-- refunding into the monthly bucket could destroy paid credits at the next reset AND
-- revoke the very access the charge required. This variant refunds into `purchased`,
-- which is always safe: it never mints expiring allowance and preserves access.
-- Service-role ONLY (a user-callable refund would mint credits).

create or replace function public.refund_credits_purchased(p_user uuid, p_amount int, p_action text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  update public.credit_balances
     set purchased = purchased + p_amount
   where user_id = p_user;
  insert into public.credit_ledger (user_id, delta, balance_after, action)
  select p_user, p_amount, balance + purchased, p_action || ':refund'
    from public.credit_balances where user_id = p_user;
end;
$$;

revoke all on function public.refund_credits_purchased(uuid, int, text) from public, anon, authenticated;
