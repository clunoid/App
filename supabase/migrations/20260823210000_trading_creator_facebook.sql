-- CREATOR PROGRAM — Facebook Reels joins the platforms.
--
-- A creator now posts each video to four places instead of three. Facebook is
-- the cheapest of them to add: linking an Instagram professional account to a
-- Facebook Page cross-posts Reels automatically, so one upload lands on both.
--
-- Same shape as the other three: stored without the leading @, lowercased by the
-- API, and unique across the programme so one account cannot hold two seats.

alter table public.trading_creator_applications
  add column if not exists facebook text;

create unique index if not exists trading_creator_applications_facebook_key
  on public.trading_creator_applications (facebook)
  where facebook is not null;

comment on column public.trading_creator_applications.facebook is
  'Facebook page or profile handle, normalised like the others. Usually linked to Instagram so Reels cross-post.';
