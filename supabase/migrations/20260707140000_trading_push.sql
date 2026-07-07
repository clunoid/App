-- Web Push subscriptions for the trading desk's autonomous alerts.
-- One row per browser/device that opted in. Written EXCLUSIVELY by the service
-- role (the subscribe route, after verifying the admin session); readable only
-- by the allow-listed admin. This is what makes alerts survive tab-close and
-- refresh: the subscription lives server-side, so the scheduled scanner pushes
-- to it regardless of whether any tab is open.
create table if not exists public.trading_push_subs (
  endpoint    text primary key,          -- the browser push endpoint (unique per device)
  subscription jsonb not null,           -- full PushSubscription (endpoint + p256dh/auth keys)
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz                -- last successful delivery (dead subs are pruned)
);

alter table public.trading_push_subs enable row level security;
drop policy if exists "trading admin read subs" on public.trading_push_subs;
create policy "trading admin read subs" on public.trading_push_subs
  for select using (public.is_trading_admin());
-- no insert/update/delete policies → only the service role writes.
