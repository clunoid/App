-- CREATOR PROGRAM — registering starts the clock, there is no approval step.
--
-- Originally a row landed as 'pending' and somebody had to approve it before the
-- creator's 30 days began. That gate is gone: people register and start posting
-- the same day, so the start date is simply the moment they registered.
--
-- started_at is what every downstream date hangs off (day 14 pace change, day 30
-- finish, payout window). approved_at stays, but it now means the payout review
-- at the END of the month, not permission to begin.

alter table public.trading_creator_applications
  add column if not exists started_at timestamptz;

-- Anyone already in the table began when they applied.
update public.trading_creator_applications
   set started_at = applied_at
 where started_at is null;

alter table public.trading_creator_applications
  alter column started_at set default now(),
  alter column status set default 'active';

comment on column public.trading_creator_applications.started_at is
  'Day 1 of the creator''s 30 days — the moment they registered. There is no approval gate.';
comment on column public.trading_creator_applications.approved_at is
  'End-of-month payout review sign-off. NOT permission to start; started_at is day 1.';
