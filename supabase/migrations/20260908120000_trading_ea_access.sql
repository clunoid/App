-- MT5 EA ACCESS — who asked, who was approved, and the code that lets them in.
--
-- The General MT5 Expert Advisor is free, but it is only for the trading
-- community: it takes its signals from clunoid.com's own engine, and that is
-- shared with people who came to Deriv through us rather than with anyone who
-- finds the page. So the file stopped being a public download and became a
-- request.
--
-- The shape of it: somebody enters their MT5 login, their name and an email.
-- That arrives in Telegram through the ordinary support pipe, so it lands in
-- the same place as every other message with the same conversation history
-- attached. The owner checks the login against the partner list on Deriv and
-- swipe-replies /approve or /decline. Approval mints a code here and posts it
-- back into that person's support window; the code then unlocks the download.
--
-- `visitor_id` is the random string minted in the visitor's own browser
-- (lib/support/identity.ts), the same key support conversations already use. It
-- is what binds a code to one person: a code pasted by anybody else is refused,
-- which is the whole point of issuing one.
--
-- RLS is ON with NO policies, which denies everything. Nothing here is
-- reachable from a browser — the only doors are the routes under
-- /api/trading/mt5, and they hold the service key.

create table if not exists public.trading_ea_requests (
  id            uuid primary key default gen_random_uuid(),

  -- Who asked. The browser's own id, not an account: this page does not
  -- require signing in, and asking people to make an account before they can
  -- ask for a free file is a good way to be asked by nobody.
  visitor_id    text not null,

  -- What they gave us. The login is what gets checked against Deriv.
  mt5_login     text not null,
  name          text not null,
  email         text not null,

  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'declined')),

  -- Minted on approval. Unique across the table, so a code identifies exactly
  -- one request and therefore exactly one person.
  code          text unique,

  -- First time the code actually fetched the file. Kept for the owner's sake —
  -- a code issued and never used says something different from one that was.
  code_used_at  timestamptz,

  -- The Telegram message this request became. A swipe-reply points back at it,
  -- and that pointer is how /approve knows which request it is approving —
  -- exactly the way support replies are addressed.
  tg_message_id bigint,

  page          text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);

-- Redeeming a code is the hot path: one lookup, on every download attempt.
create unique index if not exists trading_ea_requests_code_idx
  on public.trading_ea_requests (code)
  where code is not null;

-- The approve/decline lookup: Telegram gives a message id, we need the request.
create unique index if not exists trading_ea_requests_tg_idx
  on public.trading_ea_requests (tg_message_id)
  where tg_message_id is not null;

-- "Has this person already asked, and what happened?" — shown back to them, and
-- used to stop the same visitor filling the form ten times.
create index if not exists trading_ea_requests_visitor_idx
  on public.trading_ea_requests (visitor_id, created_at desc);

alter table public.trading_ea_requests enable row level security;
