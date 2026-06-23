# Clunoid

A voice-driven, visually-interactive AI platform led by **Isaac** — a
super-intelligent companion who shows you anything and figures out anything
you're curious about.

This is the production rebuild (the earlier prototype lives in `clunoid test`).
Features are being added step by step, securely.

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript
- Tailwind CSS (warm-dark "book cloth" palette)
- Zustand (client state)
- Supabase (Auth + Postgres with Row Level Security)
- framer-motion · lucide-react · Vercel Analytics + Speed Insights

## Status — Milestone 1: Authentication

- Welcome gate with **Start exploring**
- Sign up / sign in (email + password, or Google OAuth)
- Automatic session restore (returning users are signed straight back in)
- Per-user **profile** (auto-created on sign-up via a DB trigger), shown in the
  profile menu (name, email, join date, location)
- Strict RLS — a user can only ever read/write their own data; no service-role
  key is used anywhere

## Develop

```bash
npm install
cp .env.example .env   # then fill in real values (see project owner)
npm run dev
```

## Database

Schema lives in `supabase/migrations/`. Applied to project
`fgxjscoirazdkckcyory` (auth settings are managed in the Supabase dashboard).
