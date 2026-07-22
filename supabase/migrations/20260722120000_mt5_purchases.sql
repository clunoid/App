-- MT5 AUTOMATION PURCHASES — entitlement ledger for the paid MetaTrader 5 bots.
--
-- The general automation is free; the five dedicated automations are one-time
-- purchases through Polar (Merchant of Record). One row per PAID Polar order,
-- keyed by the Polar order id so the webhook is idempotent.
--
-- Two ways a purchase reaches a user, both landing here:
--  1. Signed-in buyer  → externalCustomerId is their auth user id → user_id set.
--  2. Guest buyer      → externalCustomerId is a device token ("dev_…") kept in a
--     first-party cookie → purchase_token set, user_id null. After they sign up,
--     the claim step matches that exact device token and stamps user_id — "match
--     the exact device and remember it".
--
-- Server-only: RLS is ON with NO policies, so anon/authenticated clients can read
-- nothing. Every read/write goes through the service-role client on our own API
-- routes (webhook, claim, download), which bypasses RLS.

create table if not exists public.mt5_purchases (
  order_id       text primary key,                 -- Polar order id (idempotency)
  bot_id         text not null,                     -- our MT5 automation slug
  purchase_token text,                              -- device token for guest checkouts
  user_id        uuid references auth.users(id) on delete set null,
  email          text,
  created_at     timestamptz not null default now()
);

create index if not exists mt5_purchases_user  on public.mt5_purchases (user_id, bot_id);
create index if not exists mt5_purchases_token on public.mt5_purchases (purchase_token);

alter table public.mt5_purchases enable row level security;
-- (No policies on purpose — deny all to non-service-role. All access is server-side.)
