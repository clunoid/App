-- Per-signal time-boxed exit (bars). NULL = the engine-wide 60-bar TTL.
-- Session strategies (e.g. London-close fade, ADR exhaustion fade) exit at the
-- Nth closed bar via the SAME expiry path the backtester uses, so live outcome R
-- stays comparable to the OOS R the strategy was validated on.
alter table public.trading_signals
  add column if not exists max_bars int;
