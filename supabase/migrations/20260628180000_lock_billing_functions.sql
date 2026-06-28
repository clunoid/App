-- SECURITY FIX (critical): the privileged billing functions were only revoked
-- from anon + authenticated, but Postgres grants EXECUTE to PUBLIC by default and
-- every role is a member of PUBLIC — so an authenticated end-user could still call
-- them over PostgREST RPC and MINT credits or change their own plan. Revoke the
-- PUBLIC grant and allow ONLY service_role (used by the signature-verified webhook
-- and best-effort refunds). consume_credits / rate_check stay callable by
-- authenticated on purpose (they key on auth.uid() and are safe).

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.grant_for_order(text,uuid,text,int,text,text,timestamptz)',
    'public.sync_subscription(uuid,text,text,timestamptz,text,text)',
    'public.refund_credits(uuid,int,text)',
    'public.downgrade_to_free(uuid)',
    'public.handle_new_user()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- Belt-and-braces: ensure the user-callable ones are exactly scoped.
revoke all on function public.consume_credits(int, text, jsonb) from public, anon;
grant execute on function public.consume_credits(int, text, jsonb) to authenticated;
revoke all on function public.rate_check(text, int, int) from public, anon;
grant execute on function public.rate_check(text, int, int) to authenticated;
