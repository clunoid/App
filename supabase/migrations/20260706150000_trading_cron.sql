-- Trading Desk — FULLY AUTONOMOUS scanning without Vercel Pro.
-- pg_cron (in-database scheduler) + pg_net (async HTTP) fire the production scan
-- endpoint every 15 minutes, 24/7, with no browser and no external service.
-- The scan route itself no-ops cheaply when FX markets are closed.
--
-- NOTE: the live job was scheduled via the management API with the real
-- CRON_SECRET injected from the environment — the secret is never committed.
-- This migration documents the shape and enables the extensions idempotently.
-- To (re)schedule manually, run the block below with <CRON_SECRET> filled in:
--
--   select cron.schedule(
--     'trading-scan-15m',
--     '*/15 * * * *',
--     $job$
--     select net.http_post(
--       url := 'https://www.clunoid.com/api/trading/scan',
--       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>',
--                                     'Content-Type', 'application/json'),
--       body := '{}'::jsonb,
--       timeout_milliseconds := 290000
--     )
--     $job$
--   );
--
-- Observability: select * from cron.job_run_details order by start_time desc;
-- and the app-level heartbeats in public.trading_scans.

create extension if not exists pg_cron;
create extension if not exists pg_net;
