-- ANSWERED BY HAND — the third way a request stops waiting.
--
-- A request left `pending` until somebody sent /approve or /decline. But those
-- are not the only way it gets dealt with: most of the time the owner simply
-- replies to the person — asks a question, explains what is missing, tells them
-- what to do next — and that request is then in hand, not waiting on a
-- decision. The queue could not see the difference, so answered requests kept
-- being offered as things to decide about, and the list only ever grew.
--
-- A column rather than a fourth status, deliberately: the status says what was
-- DECIDED, and replying to somebody decides nothing. A request can be answered
-- and then still be approved or declined later, and both facts matter — a new
-- status would have thrown one of them away, and it would have meant touching
-- the check constraint that keeps the other three honest.

alter table public.trading_ea_requests
  add column if not exists answered_at timestamptz;

-- The queue reads "pending and not answered" on every /approve and /decline.
create index if not exists trading_ea_requests_open_idx
  on public.trading_ea_requests (created_at desc)
  where status = 'pending' and answered_at is null;

comment on column public.trading_ea_requests.answered_at is
  'When the owner replied to this person by hand. Takes the request out of the decision queue without deciding it — status still says what was decided, if anything.';
