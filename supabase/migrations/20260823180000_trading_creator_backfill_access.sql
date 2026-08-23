-- CREATOR PROGRAM — make sure every existing creator can still reach a dashboard.
--
-- Rows registered before the dashboard existed have neither an access_token nor
-- a user_id, which would leave them on the sign-up page unable to register again
-- (their email is already taken). Two safe repairs:
--
--   1. Mint a token for every row that has none, so the column is never empty.
--   2. Link a row to the Clunoid account with the same email, where one exists.
--      This only enables the signed-in fallback — the person still has to prove
--      the email by signing in, so it grants no access that email alone would.
--
-- Neither touches a row that already has these set.

update public.trading_creator_applications
   set access_token = encode(gen_random_bytes(24), 'hex')
 where access_token is null;

update public.trading_creator_applications a
   set user_id = u.id
  from auth.users u
 where a.user_id is null
   and lower(u.email) = lower(a.email);

alter table public.trading_creator_applications
  alter column access_token set default encode(gen_random_bytes(24), 'hex');
