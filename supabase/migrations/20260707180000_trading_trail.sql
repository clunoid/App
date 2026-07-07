-- Chandelier trailing-stop params. NULL = fixed stop (the resolver takes the
-- byte-identical legacy path). No trail-STATE column is needed: the trail is
-- recomputed deterministically each scan from (trail_mult, trail_atr frozen at
-- signal time) + the closed bars after bar_time — which the 60-bar TTL
-- guarantees fit inside every fetch window. R stays denominated in the ORIGINAL
-- stop, so the dedupe index, the audit trail and all R math are untouched.
alter table public.trading_signals
  add column if not exists trail_mult double precision,
  add column if not exists trail_atr  double precision;
