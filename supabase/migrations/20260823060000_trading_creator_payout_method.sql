-- CREATOR PROGRAM — how the creator wants to be paid.
--
-- Chosen at application time so we know which rails we need for a given cohort,
-- but the account details themselves are collected after the first 30 days, when
-- there is actually a payment to make. Nothing sensitive lives in this column —
-- it is only the choice, e.g. 'mpesa' or 'usdt'.

alter table public.trading_creator_applications
  add column if not exists payout_method text;

comment on column public.trading_creator_applications.payout_method is
  'Preferred rail: usdt | paypal | venmo | cashapp | mpesa | wise | payoneer. Account details are collected separately after the first 30 days.';
