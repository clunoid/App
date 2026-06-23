-- Clunoid App — provider lookup for smarter sign-in.
-- Returns the auth providers (e.g. {email}, {google}, {email,google}) registered
-- for an email, so the UI can guide the user to the RIGHT method (e.g. auto-send
-- a Google-only user to Google instead of failing on a password).
-- SECURITY DEFINER so it can read the auth schema; returns {} for unknown emails.
-- NOTE: this is a deliberate, minimal account-existence/method lookup to enable
-- the requested UX; it does not expose any other user data.

create or replace function public.account_providers(p_email text)
returns text[]
language sql
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct i.provider order by i.provider), array[]::text[])
  from auth.identities i
  join auth.users u on u.id = i.user_id
  where u.email = lower(btrim(p_email));
$$;

revoke all on function public.account_providers(text) from public;
grant execute on function public.account_providers(text) to anon, authenticated;
