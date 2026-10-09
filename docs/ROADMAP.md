# Roadmap

Phases from the build plan. Each phase must work end to end before the next
starts. Details: `docs/LIFE_OS_SPEC.md` §41, §48–§50.

| #   | Phase                | Status                                      |
| --- | -------------------- | ------------------------------------------- |
| 1   | Foundation           | ✅ Done                                     |
| 2   | Data model + RLS     | ✅ Done                                     |
| 3   | Score engine         | ✅ Done                                     |
| 4   | First usable product | ✅ Done                                     |
| 5   | Week system          | ✅ Done                                     |
| 6   | History              | ✅ Done                                     |
| 7   | Strava               | Built; waiting for credentials              |
| 8   | Google Calendar      | Built; waiting for credentials              |
| 9   | PWA                  | ✅ Done                                     |
| 10  | Analytics            | ✅ Done                                     |
| 11  | AI Coach             | Built; waiting for an API key               |
| —   | Google Health        | Blocked: Google not onboarding new projects |

## Phase 1 — Foundation ✅

- Next.js 16 + TypeScript + App Router + Tailwind 4 + shadcn/ui.
- Supabase Auth: sign up, sign in, sign out, password recovery, password
  change, email link confirmation (`/auth/confirm`).
- Proxy session refresh + optimistic redirects; DAL authorization.
- Authenticated shell: sidebar (desktop), bottom tab bar (iPhone),
  `/dashboard` (honest empty Life/Week Score), `/settings` (account).
- Env validation, security headers, ESLint + Prettier, Vitest, Playwright,
  GitHub Actions CI.

## Phase 2 — Data model ✅

- Migrations for all spec §21 tables (except the optional
  `metric_daily_rollups`) with constraints, indexes, composite ownership
  FKs, RLS and explicit grants. Details: docs/DATA_MODEL.md.
- Sign-up bootstrap: profile (browser timezone) + six default categories;
  existing users backfilled.
- Internal functions in a non-exposed `private` schema.
- DB tests (`npm run test:db`), static migration guards in CI, typed
  Supabase client, Supabase advisors clean except the expected items.

Leaked password protection is a paid Supabase feature: off for now (ADR-027).

## Phase 3 — Score engine ✅

Pure TypeScript in `src/lib/scoring` (docs/SCORING.md): config schemas and
normalisation for all seven directions, local-day rolling windows,
aggregation, deduplication, missing-data rules, freshness, confidence,
category and Life Score with exact contributions, rank, Week Score, and
score-version configuration. Vocabularies are tested against the SQL
CHECK constraints; ESLint keeps the engine framework-free. ADR-014–017.

## Phase 4 — First usable product ✅

- `/dashboard`: Life Score ring + rank, Week Score (when commitments exist),
  six categories, strongest/weakest, main objective, data status.
- `/score`: full explanation — weights, effective weights, contributions
  per category and metric, completeness, confidence, issues in Spanish.
- `/metrics`, `/metrics/new` (14 templates from spec §44), `/metrics/[id]`:
  create/edit metrics and scoring config, register/backdate/edit/delete
  values, history with source, enable/disable, safe delete.
- `/settings`: category weights (atomic RPC, must total 100), main
  objective, timezone and week start.
- Every scoring-relevant change records a score version (RPC).
- Tests: unit, DB (SQL), RLS integration via the Data API, E2E against real
  Supabase (desktop + iPhone viewport). ADR-018–023.

Known gaps: no commitment UI yet (phase 5), so the Week Score only appears
if commitments exist; no charts or history comparison (phase 6).

## Phase 5 — Week system ✅

- `/week`: plan commitments (quantity or yes/no, category, weight) for the
  current week and up to 4 ahead; copy last week's plan; log progress
  (+/−, exact value, done toggle); cancel/edit/delete; Week Score with
  each commitment's contribution; navigate weeks.
- `/review`, `/review/[week]`: preview the review from the week's last
  day, close the week (atomic RPC), notes, history of closed weeks.
- Review: Life Score start → end with one score version, Week Score
  beside it, category changes, biggest gain/decline, strongest/weakest,
  off-target metrics ranked by potential gain (bottleneck), fastest
  improving, stagnant despite high execution, rule-based next focus.
- Dashboard: Life Score change this week, link to the week, weeks pending
  review. Closed weeks frozen by RLS. ADR-024–027.

Known gaps: commitments are logged manually (automatic progress from
integrations comes with phases 7–8); multi-week diagnostics (spec §11
rolling windows) with analytics (phase 10).

## Phase 6 — History ✅

- `/history`: Life Score and per-category charts for 30/90/180/365 days,
  replayed with the rules in force at each date (ADR-028); closed weeks'
  Week Score as a separate bar chart; "Tú vs tú" comparison of two dates
  (scores and raw metric values). Text summaries for screen readers.
- Recharts added; shadcn CLI moved to devDependencies (production audit:
  0 vulnerabilities).

## Phases 7–8 — Strava, Google Calendar (built; waiting for credentials)

- `/integrations`: CSV import (works now), provider status, connect /
  sync / disconnect / delete imported data.
- Adapters for Strava and Google Calendar, reconciliation, sync
  orchestration, encrypted tokens, OAuth with CSRF state, daily cron
  (ADR-033, ADR-034). Unit-tested with simulated provider responses.
- Metrics choose their data origin (manual or a provider metric + filter).
- **Pending for the user:** create the Strava app and the Google OAuth
  client, and provide the Supabase service-role key (docs/SETUP.md
  §Integrations). Then: verify connect → sync → scores end to end.
- GitHub: not built (optional, spec §19). Google Health: disabled until
  Google onboards new projects (spec §16).

## Phase 9 — PWA ✅

- Manifest (standalone, dark, shortcuts), PNG and maskable icons, Apple
  touch icon and home-screen meta; safe-area aware layout.
- Service worker: cached assets, `/offline` fallback, nothing personal
  cached (ADR-030). Offline/online banner; error boundary with retry.
- Content-Security-Policy on every response (ADR-029).
- Pending for the user: install on a real iPhone (Safari → Compartir →
  Añadir a pantalla de inicio) and report anything odd; automated tests
  use Chromium with an iPhone viewport.

## Phase 10 — Analytics ✅

- Trends over 7/30/90 days (history page) and 30-day arrows per category
  on the dashboard; current bottleneck panel; spec §11 strategy alerts
  from the last four closed weeks (ADR-031).
- Personal data export from Settings (JSON, RLS-scoped). Account
  deletion pending the service-role key (ADR-032).

## Phase 11 — AI coach (built; waiting for an API key)

- Optional AI analysis on closed reviews: summary, bottleneck, focus and
  reflection questions from the structured review only; invented numbers
  are rejected (ADR-035). Privacy note in Settings.
- **Pending for the user:** an Anthropic API key (`ANTHROPIC_API_KEY`)
  if they want it; then verify a real analysis end to end.

## Backlog notes

- Custom SMTP for auth emails before real use.
- `metric_daily_rollups` (spec §21.5) only if dashboard queries get slow.
- Account deletion (spec §22) — needs the service-role key (ADR-032).
- `/settings` grows: category weights, targets, export/delete data (phase 4+).
