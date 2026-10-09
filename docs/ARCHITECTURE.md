# Architecture

Modular monolith on Next.js (App Router) + Supabase. The target shape is in
spec §13–§15 and §24; this document describes what exists today.

## Layers

```
src/app/            Routes. Thin: compose features, no business logic.
  (auth)/           login, signup, forgot-password, reset-password
  (app)/            dashboard, score, metrics (list/new/[id]), settings
  auth/confirm/     Route Handler for auth email links
src/features/       Feature modules (UI + Server Actions + schemas)
  auth/             forms, actions, validation, error mapping
  navigation/       nav config + sidebar/bottom nav
  dashboard/        dashboard panels
  metrics/          metric/value parsing, templates, actions, components
  scores/           data loader (DB → engine), versioning, explanations
  settings/         weights, main objective, preferences
src/components/     Shared UI. components/ui = shadcn (Base UI primitives)
src/lib/            Framework-agnostic core
  env/              Zod-validated environment
  scoring/          pure score engine (docs/SCORING.md); no framework imports
  auth/             routes.ts (pure access rules), session.ts (DAL)
  supabase/         typed server client, proxy session refresh, generated DB types
src/proxy.ts        Next.js Proxy (formerly middleware)
src/instrumentation.ts  boot-time env validation
supabase/migrations/    SQL schema, RLS, grants (see docs/DATA_MODEL.md)
supabase/tests/         database tests (SQL, rolled back) + static migration guards
scripts/test-db.mjs     runs SQL tests against the linked project
```

Dependency direction: `app → features → lib`. `lib` never imports from
`features` or `app`. Pure modules (`lib/auth/routes.ts`, `lib/env/parse.ts`,
`features/auth/schemas.ts`, `features/auth/errors.ts`) import neither Next.js
nor Supabase, and are covered by unit tests.

## Authentication

```
Browser ──► Proxy (src/proxy.ts)
              │ refresh Supabase session cookie (getClaims)
              │ optimistic redirect via resolveAuthRedirect()
              ▼
            Page (static shell) ──► <Suspense> section
                                      │ requireUser()  ← DAL, verifies JWT
                                      ▼
                                    data (RLS-bound Supabase client)
```

- **Proxy is a UX optimisation, not security.** It redirects signed-out
  users away from protected pages and signed-in users away from guest-only
  pages.
- **The data access layer is the security boundary.** `getSessionUser()` /
  `requireUser()` verify the JWT with `supabase.auth.getClaims()`. Every page
  section that reads data and every Server Action calls them.
- **Postgres RLS is the last line.** The browser-safe anon key is used with
  the user's JWT; RLS policies scope every row to `auth.uid()`, and explicit grants
  limit each table to the operations the app needs. See docs/DATA_MODEL.md.
- Route classes (`lib/auth/routes.ts`): `guest-only` (/login, /signup,
  /forgot-password), `public` (/auth/*), `protected` (everything else,
  including /reset-password, which needs the recovery session).
- `next` redirect targets go through `safeNextPath()` (same-origin only).
- Auth errors are mapped to Spanish messages that don't reveal whether an
  account exists. Logs carry only error codes.

## Data flow

```
Supabase (RLS) ──► features/scores/data.ts  loadScoringInputs() (per request)
                     │ rows → mappers.ts → engine inputs
                     ├─► loadScoringOverview()   dashboard, score, metrics
                     └─► features/week/data.ts   week, reviews, pending reviews
                     ▼
                  lib/scoring  computeLifeScore (any instant) / computeWeekScore
                               / buildWeeklyReview
                     ▼
                  pages render results + explanations

Server Action ──► requireUser → parse (Zod + engine schemas) → write (RLS)
                 → syncScoreVersion() if scoring changed → refresh()/redirect
```

Unbounded list reads go through `fetchAllRows`: PostgREST silently
truncates at 1000 rows, which would corrupt scores.

Closing a week recomputes the review on the server and calls the
`close_week` RPC; closed weeks are frozen by RLS (ADR-024, ADR-025).

## Rendering

`cacheComponents` and `partialPrefetching` are enabled (Next 16 defaults for
new apps). Authenticated pages are Partial Prerenders: the shell (nav,
headings) is static; session-dependent sections stream in behind
`<Suspense>` with same-size skeletons.

## Security baseline

- Security headers for every route (`next.config.ts`): `X-Frame-Options`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS; no `X-Powered-By`.
- Content-Security-Policy (`src/lib/security/csp.ts`, ADR-029).
- Service worker caches only hashed assets and the offline page (ADR-030).
- Env validation never echoes values.
- No service-role key or provider secret exists in the app yet; when added
  they will live in a `server-only` module.
- Database: RLS on every table, no `anon` privileges, provider tokens
  readable only by the service role, internal functions in a non-exposed
  `private` schema.

## Testing

| Layer | Tool           | Location                                        |
| ----- | -------------- | ----------------------------------------------- |
| Unit  | Vitest         | `src/**/*.test.ts`, `supabase/tests/*.test.ts`  |
| DB    | SQL via CLI    | `supabase/tests/*.test.sql` (`npm run test:db`) |
| E2E   | Playwright     | `e2e/` (desktop + iPhone viewport)              |
| CI    | GitHub Actions | `.github/workflows/ci.yml`                      |
