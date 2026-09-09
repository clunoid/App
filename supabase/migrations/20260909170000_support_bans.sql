-- WHO IS NOT WELCOME, and who used to not be.
--
-- The support window and the EA request form are open to anybody with the
-- page, which is the point of them — asking people to make an account before
-- they can ask a question is how you get asked nothing. The cost of that is
-- that there is no door, so this is the door.
--
-- A ban is matched on EITHER the browser id or the email. Neither alone is
-- enough: a visitor id is lost the moment somebody opens a private window, and
-- an email is whatever they typed. Together they stop the ordinary case, which
-- is one person being a nuisance rather than somebody determined to get back
-- in. This is a nuisance filter, not a security boundary, and it is worth being
-- honest about that: anything stronger would need accounts.
--
-- Unbanning does NOT delete the row — `active` goes false and `unbanned_at` is
-- stamped. The history is the useful part: "this person was banned in March and
-- let back in" is a different situation from "this person has never been
-- banned", and the second is what a deleted row claims. Clearing the list
-- outright is a separate, deliberate act (/bans clear).
--
-- RLS is on with no policies — nothing here is reachable from a browser. The
-- only writer is the Telegram webhook, holding the service key.

create table if not exists public.trading_support_bans (
  id           uuid primary key default gen_random_uuid(),

  -- Either may be null: a ban placed from a Telegram reply knows the visitor,
  -- one placed by typing an address knows only the email.
  visitor_id   text,
  email        text,

  name         text,
  reason       text,

  active       boolean not null default true,
  banned_at    timestamptz not null default now(),
  unbanned_at  timestamptz,

  constraint trading_support_bans_has_key
    check (visitor_id is not null or email is not null)
);

-- The hot path: every inbound message and every EA request asks "is this one
-- banned?" before doing anything else, so both lookups are indexed and both
-- are narrowed to the active rows, which is the only state that blocks.
create index if not exists trading_support_bans_visitor_idx
  on public.trading_support_bans (visitor_id) where active and visitor_id is not null;

create index if not exists trading_support_bans_email_idx
  on public.trading_support_bans (lower(email)) where active and email is not null;

create index if not exists trading_support_bans_recent_idx
  on public.trading_support_bans (banned_at desc);

alter table public.trading_support_bans enable row level security;
