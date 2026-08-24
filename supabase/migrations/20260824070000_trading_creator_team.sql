-- CREATOR PROGRAM — teams.
--
-- A creator gets a short code. They put their own link in their bios and share
-- it around; anyone who arrives through it and later registers is recorded as
-- theirs. When one of their people gets paid, the creator earns $20.
--
-- Two reasons the link matters beyond the referral:
--   · Every creator having a DIFFERENT link in their bio is healthier than a
--     hundred accounts all pointing at the identical URL, which is exactly the
--     pattern platforms flag as coordinated spam.
--   · It opens clunoid.com — the product — not the creator programme. People
--     should meet the bots first.
--
-- referred_by points at another application row. A creator cannot be their own
-- referrer; nothing else about the graph is constrained, because A introducing
-- B and B later introducing C is the whole point.

alter table public.trading_creator_applications
  add column if not exists referral_code text,
  add column if not exists referred_by   uuid references public.trading_creator_applications(id) on delete set null;

alter table public.trading_creator_applications
  drop constraint if exists trading_creator_applications_no_self_referral;
alter table public.trading_creator_applications
  add constraint trading_creator_applications_no_self_referral check (referred_by is null or referred_by <> id);

-- Short, unambiguous codes: no 0/O/1/I, so nobody mistypes one off a phone screen.
create or replace function public.trading_creator_new_code() returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text;
  i int;
begin
  loop
    out := '';
    for i in 1..6 loop
      out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.trading_creator_applications where referral_code = out);
  end loop;
  return out;
end;
$$;

update public.trading_creator_applications
   set referral_code = public.trading_creator_new_code()
 where referral_code is null;

alter table public.trading_creator_applications
  alter column referral_code set default public.trading_creator_new_code();

create unique index if not exists trading_creator_applications_referral_code_key
  on public.trading_creator_applications (referral_code)
  where referral_code is not null;

create index if not exists trading_creator_applications_referred_by_idx
  on public.trading_creator_applications (referred_by);

comment on column public.trading_creator_applications.referral_code is
  'Short code for this creator''s own share link: clunoid.com/r/<code>. Opens the product, records the referral.';
comment on column public.trading_creator_applications.referred_by is
  'The creator whose link brought this one in. $20 to them once this creator has been paid.';
