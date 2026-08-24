-- CREATOR PROGRAM — remembering a creator across their devices.
--
-- The dashboard is opened with a token kept in one browser. Change phone, clear
-- storage, or use a laptop instead, and there is no token — so the creator lands
-- on the sign-up form, tries to register again, and is told their email is taken.
-- A dead end, and the most common one there is.
--
-- Every creator here has a Deriv account connected, so that is the thing that
-- follows them between devices. We record the account id, and on a new device we
-- match against it.
--
-- The id alone is NOT the proof — a string can be guessed. The API verifies the
-- caller by asking Deriv, with the caller's own access token, which accounts it
-- belongs to. Controlling the Deriv session is what identifies them.

alter table public.trading_creator_applications
  add column if not exists deriv_loginid text;

create index if not exists trading_creator_applications_deriv_loginid_idx
  on public.trading_creator_applications (deriv_loginid)
  where deriv_loginid is not null;

comment on column public.trading_creator_applications.deriv_loginid is
  'Deriv options account id of this creator, recorded when they open the dashboard with a connection. Used to find them again on another device — always verified against Deriv first, never trusted from the browser.';
