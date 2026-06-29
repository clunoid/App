-- Auto-reload: make the default top-up amount $100 (was $10) everywhere.
-- The UI already prefills $100 for new users; this aligns the DB column default
-- and bumps existing rows that still carry the old $10 default ($1000 cents).

alter table public.auto_reload alter column amount_cents set default 10000;

update public.auto_reload
   set amount_cents = 10000, updated_at = now()
 where amount_cents = 1000;
