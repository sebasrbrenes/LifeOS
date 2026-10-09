<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Life OS — agent instructions

Life OS is a personal performance system. **`docs/LIFE_OS_SPEC.md` is the
source of truth** for product, data model, scoring and roadmap. Read it before
changing behaviour. Priority when sources conflict: explicit user instruction
→ this file → the spec → other docs → your own judgement.

## The one product rule

**Life Score** measures _state_. **Week Score** measures _execution_. Never
combine them, derive one from the other, or show them as a single number.

## Architectural rules (spec §51)

1. Do not hard-code scoring weights or rules in UI components.
2. Do not couple scoring logic to third-party API payloads.
3. All provider data passes through `Adapter → Normalization → Canonical metrics → Score engine`.
4. Every user-owned table has RLS; users only read/write their own rows.
5. Provider secrets and `SUPABASE_SERVICE_ROLE_KEY` never reach the browser.
6. Every scoring function has unit tests (pure TypeScript in `src/lib/scoring`).
7. Historical score snapshots are immutable.
8. Scoring configuration changes create a new `score_version`.
9. Missing data is **not** zero. Show "sin datos", never `0`.
10. Don't build an integration until its data changes a product decision.
11. Modular monolith. No microservices, queues or extra infra without need.
12. Every number on screen must be explainable.

## Next.js 16 conventions used here

- `cacheComponents` is on. Anything that reads the session (`cookies()`),
  `searchParams` or other request data must sit inside `<Suspense>`. Keep
  layouts static; read the session in components below a boundary.
- Middleware is called **Proxy**: `src/proxy.ts`. It refreshes the Supabase
  session and does optimistic redirects only.
- **Authorization lives in the data access layer**: call `requireUser()` /
  `getSessionUser()` from `src/lib/auth/session.ts` in every page section that
  reads data and in every Server Action. Never trust the proxy or the client.
- Request APIs (`cookies`, `headers`, `params`, `searchParams`) are async.
- `getSessionUser()` calls `io()` first: never read the clock or random
  values in a server render before that boundary (ADR-019).
- `usePathname()` and similar hooks on dynamic routes sit under `<Suspense>`.
- Forms use `useFormAction()` (ADR-020). Mutations end with `refresh()` or
  `redirect()`; scoring changes also call `syncScoreVersion()`.
- Unbounded reads use `fetchAllRows()` (PostgREST caps at 1000 rows).

## Code layout

```
src/app/          routes only (thin): (auth) and (app) route groups
src/features/     feature modules: UI + server actions + schemas per feature
src/components/   shared UI; components/ui is shadcn (Base UI)
src/lib/          framework-agnostic core: env, auth rules, supabase, scoring…
e2e/              Playwright
supabase/         Supabase CLI config and SQL migrations
docs/             spec, architecture, decisions, setup, roadmap
```

Pure logic (validation, routing rules, scoring) must not import Next.js or
Supabase, so it stays unit-testable.

## Scoring rules

- All scoring goes through `src/lib/scoring` (docs/SCORING.md). UI and server
  code call the engine; they never re-implement formulas or weights.
- Show scores with `displayScore()` (floored) and `rankFor()` — never
  `Math.round`. Show `null` scores as "sin datos", never 0.
- Translate `ScoreIssue` codes into copy in the UI; the engine stays
  language-neutral.
- Changing formulas: bump `SCORE_ENGINE_VERSION`. Changing configuration:
  check `requiresNewScoreVersion()` and create a new score version.

## Database rules

- Schema changes only via new files in `supabase/migrations/` (never edit a
  pushed migration). Workflow in docs/SETUP.md §1b.
- Every new table: `user_id` → auth.users ON DELETE CASCADE, RLS enabled,
  `revoke all … from anon, authenticated` then minimal grants, policies
  `to authenticated` using `(select auth.uid())`, composite `(user_id, x_id)`
  FKs. `supabase/tests/migrations.test.ts` enforces most of this.
- Functions: `set search_path = ''`; internal ones go in `private`.
- Run `npm run test:db -- --pending` before `supabase db push`, then
  `npm run test:db`, `npm run db:types` and the advisors.
- Data model reference: docs/DATA_MODEL.md.

## Working agreement

- Work in small, verifiable phases (see `docs/ROADMAP.md`). Don't start the
  next phase until the current one works end to end.
- Before a phase: inspect the repo, run the checks, avoid duplicates.
- After a phase: `npm run check`, `npm run build`, `npm run test:e2e`, update
  docs (README, ROADMAP, DECISIONS for new architectural choices).
- Done means it works — not that code was written. No placeholders presented
  as real data, no dead buttons or links, no secrets in code or logs.
- UI copy is Spanish; product terms from the spec (Life Score, Week Score,
  rank names) stay in English.
- Never log tokens, passwords, emails or provider payloads.
- Commit in small coherent commits (`feat(scope): …`). Never push without
  explicit permission.

## Commands

```
npm run dev          # dev server
npm run check        # format:check + lint + typecheck + unit tests
npm run build        # production build
npm run test:e2e     # Playwright (builds and serves on :3100)
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e   # reuse local Chrome
```
