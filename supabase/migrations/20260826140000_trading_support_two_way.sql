-- SUPPORT — making it a conversation instead of a drop box.
--
-- Until now a support message went one way: into Telegram, where it was read
-- and answered by email. Email is slow, lands in spam, and ends the thread —
-- the person asking has usually gone by the time it arrives.
--
-- This table is the join between the two sides. Every message the bubble sends
-- is posted to Telegram and recorded here with the id of the Telegram message
-- it became. When the owner swipe-replies to that message, Telegram hands us
-- back the id it was a reply to, which is how we know which visitor the answer
-- belongs to. Nothing else identifies them: there is no account to sign into.
--
-- `visitor_id` is the random string minted in the visitor's own browser
-- (lib/support/identity.ts). It is a thread key, not a tracker.
--
-- RLS is ON with NO policies, which denies everything. Nothing reaches this
-- table from a browser: the only door is the routes under /api/support, and
-- they hold the service key. A visitor can only ever read messages addressed to
-- their own visitor_id, and only through a route that filters on it.

create table if not exists public.trading_support_messages (
  id            uuid primary key default gen_random_uuid(),

  -- Who the conversation belongs to.
  visitor_id    text not null,

  -- 'in'  = from the visitor, posted to Telegram
  -- 'out' = the owner's reply, waiting for the visitor to collect it
  direction     text not null check (direction in ('in', 'out')),

  body          text not null,

  -- Carried on inbound messages so a reply has context without a second lookup.
  email         text,
  name          text,
  source        text,
  page          text,

  -- The Telegram message this became. Only inbound rows have one, and it is what
  -- a swipe-reply points back at.
  tg_message_id bigint,

  -- When the visitor's browser collected an outbound reply. Null = still waiting,
  -- which is also what an email fallback would key off later.
  seen_at       timestamptz,

  created_at    timestamptz not null default now()
);

-- The bubble asks "anything new for me since X" on a timer; this is that query.
create index if not exists trading_support_messages_visitor_idx
  on public.trading_support_messages (visitor_id, created_at desc);

-- The reply lookup: Telegram gives us a message id, we need the visitor.
-- Unique because one Telegram message is one inbound support message, and a
-- duplicate would make the owner's reply ambiguous.
create unique index if not exists trading_support_messages_tg_idx
  on public.trading_support_messages (tg_message_id)
  where tg_message_id is not null;

-- Undelivered replies, cheaply — for the email fallback when it is added.
create index if not exists trading_support_messages_unseen_idx
  on public.trading_support_messages (created_at)
  where direction = 'out' and seen_at is null;

alter table public.trading_support_messages enable row level security;
