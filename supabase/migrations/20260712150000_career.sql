-- CLUNOID CAREER DESK — persistence for the AI job-application platform.
-- Data is PER-USER (master resume + tracked applications), so RLS is owner-scoped
-- (auth.uid() = user_id) — correct for multi-user from day one. The feature is
-- currently ADMIN-ONLY, enforced at the API layer (lib/career/access.ts); opening
-- it to the public later = widening that one gate, this schema never changes.

-- ── master resume (one per user) ─────────────────────────────────────────────
create table if not exists public.career_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  resume      jsonb not null,                 -- structured ResumeDoc (lib/career/types.ts)
  resume_text text not null default '',       -- original raw text (grounding source of truth)
  updated_at  timestamptz not null default now()
);
alter table public.career_profiles enable row level security;
drop policy if exists "career own profile" on public.career_profiles;
create policy "career own profile" on public.career_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── tracked applications ─────────────────────────────────────────────────────
create table if not exists public.career_applications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  company      text not null default '',
  role         text not null default '',
  jd_text      text not null,
  status       text not null default 'saved'
               check (status in ('saved','applied','interviewing','offer','rejected')),
  requirements jsonb,                          -- extracted JobRequirements
  match        jsonb,                          -- deterministic MatchReport (score + evidence)
  docs         jsonb not null default '{}'::jsonb, -- { resume, cover, outreach, interview }
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists career_applications_user
  on public.career_applications (user_id, created_at desc);
alter table public.career_applications enable row level security;
drop policy if exists "career own applications" on public.career_applications;
create policy "career own applications" on public.career_applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
