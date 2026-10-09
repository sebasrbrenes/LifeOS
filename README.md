# Life OS

A personal performance system. It continuously answers: where am I, am I
improving, am I executing, what is my biggest weakness, and what should I
attack next?

Two scores, never combined:

- **Life Score** — the current _state_ of your life against chosen goals.
- **Week Score** — the _quality of execution_ this week.

The full product and technical specification is
[`docs/LIFE_OS_SPEC.md`](docs/LIFE_OS_SPEC.md) — the source of truth.

## Status

Phases 1–6, 9 and 10 complete; 7–8 (Strava, Google Calendar) and 11 (AI
coach) built and tested with simulated providers, waiting for the owner's
credentials. Working today: metrics with backdated values, an explained
Life Score, weekly commitments and reviews, history and "You vs You",
trends and strategy alerts, CSV import, data export, installable PWA. See
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Stack

Next.js 16 (App Router, Cache Components, Turbopack) · React 19 · TypeScript
· Tailwind CSS 4 · shadcn/ui (Base UI) · Supabase (Postgres, Auth, RLS) ·
Zod · Vitest · Playwright · Vercel. Modular monolith.

## Getting started

Requirements: Node.js ≥ 22.12, npm, a Supabase project.

```bash
npm install
cp .env.example .env.local   # then fill in — see docs/SETUP.md
npm run dev                  # http://localhost:3000
```

The server refuses to start with missing or invalid environment variables
and lists which ones to fix.

## Scripts

| Command                    | What it does                                   |
| -------------------------- | ---------------------------------------------- |
| `npm run dev`              | Dev server                                     |
| `npm run build`            | Production build                               |
| `npm start`                | Serve the production build                     |
| `npm run check`            | Prettier check, ESLint, typecheck, unit tests  |
| `npm run format`           | Format everything with Prettier                |
| `npm test`                 | Unit tests (Vitest)                            |
| `npm run test:e2e`         | E2E tests (Playwright; builds, serves on 3100) |
| `npm run typecheck`        | Generate route types and run `tsc`             |
| `npm run test:db`          | Database tests on the linked Supabase project  |
| `npm run test:integration` | RLS through the real Data API (dev project)    |
| `npm run db:types`         | Regenerate TypeScript types from the schema    |

## Documentation

- [`docs/SETUP.md`](docs/SETUP.md) — environment, Supabase, auth emails, E2E.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — structure, auth flow, boundaries.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — tables, RLS, integrity rules.
- [`docs/SCORING.md`](docs/SCORING.md) — how every score is computed.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — architecture decision records.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phases and current status.
- [`AGENTS.md`](AGENTS.md) — rules for coding agents (and humans).
