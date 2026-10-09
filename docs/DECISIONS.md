# Architecture decision records

Decisions not already fixed by `docs/LIFE_OS_SPEC.md`.

## ADR-001 — Keep Next.js 16 Cache Components on

- **Decision:** Keep `cacheComponents` and `partialPrefetching` enabled
  (create-next-app defaults for Next 16.4).
- **Reason:** It's the framework's default direction. Authenticated pages
  get a prerendered shell with streamed, session-dependent sections, which
  feels fast on a phone.
- **Alternatives:** Disable it and rely on fully dynamic rendering (simpler
  mental model, but swims against the framework and slower first paint).
- **Consequences:** Request data (`cookies()`, `searchParams`) must be read
  inside `<Suspense>`. Layouts stay static; pages check auth in suspended
  sections. Documented in AGENTS.md.

## ADR-002 — Authorization in a data access layer, Proxy only optimistic

- **Decision:** `src/lib/auth/session.ts` (`getSessionUser`, `requireUser`)
  verifies the JWT with `getClaims()` close to every data read and in every
  Server Action. `src/proxy.ts` only refreshes the cookie and redirects.
- **Reason:** Next.js guidance (layouts don't re-run on navigation; Proxy is
  not an auth boundary) and Supabase guidance (`getSession()` data from
  cookies is untrusted).
- **Alternatives:** Auth check in the `(app)` layout (unsafe on client
  navigation; blocks the whole segment).
- **Consequences:** Small repetition (`await requireUser()` per section),
  deduplicated per request with React `cache()`.

## ADR-003 — Spanish UI copy, English product terms

- **Decision:** Interface text in Spanish. Spec terms — Life Score, Week
  Score, rank names (D…World Class, Complete), category keys — stay English.
- **Reason:** The primary user works in Spanish; the spec defines the
  product vocabulary in English.
- **Alternatives:** Full i18n now (premature for a single user).
- **Consequences:** Copy lives inline in components. If a second language is
  ever needed, extract strings then.

## ADR-004 — Dark-first theme, no theme switcher yet

- **Decision:** `<html class="dark">` always. Light tokens remain in
  `globals.css` but are unused.
- **Reason:** The spec prioritises dark mode; a switcher adds state and a
  flash-of-wrong-theme problem with no current user value.
- **Consequences:** shadcn's `sonner` wrapper (uses `next-themes`) needs an
  explicit `theme="dark"` when introduced.

## ADR-005 — Lazy public env validation + boot-time check

- **Decision:** `getPublicEnv()` validates lazily (memoised);
  `instrumentation.ts` calls it at server boot.
- **Reason:** `NEXT_PUBLIC_*` must be referenced literally for client
  inlining; lazy parsing keeps static build steps independent of config,
  while boot validation still fails fast in every deployed server.
- **Consequences:** Misconfiguration surfaces at `next start`, not
  `next build`. CI builds with placeholder values.

## ADR-006 — Vitest + Playwright; Playwright browser channel configurable

- **Decision:** Vitest for unit tests (node env by default), Playwright for
  E2E against a production build on port 3100, with desktop and iPhone
  viewport projects. `PLAYWRIGHT_CHANNEL` selects a locally installed
  browser.
- **Reason:** Fast pure-logic tests; E2E against real build output. The
  channel option avoids blocking on browser downloads.
- **Consequences:** Signed-in E2E needs a real dev Supabase project and is
  skipped otherwise (see SETUP.md).

## ADR-007 — Content-Security-Policy deferred

- **Decision:** Ship baseline security headers now; add a CSP when the
  integration phases fix the set of external origins (Supabase, Strava,
  Google).
- **Reason:** A CSP written now would be rewritten in phases 7–8; a wrong
  CSP silently breaks auth flows.
- **Consequences:** Tracked in ROADMAP as a phase 9 (PWA hardening) item.

## ADR-008 — Composite `(user_id, id)` foreign keys for ownership

- **Decision:** Every cross-table reference between user-owned rows is a
  composite FK `(user_id, x_id) → parent (user_id, id)`.
- **Reason:** FK checks run with the table owner's rights and ignore RLS.
  With plain `x_id` FKs a user could attach their metric to another user's
  category if they learned its UUID. The composite key makes that
  impossible at the database level.
- **Alternatives:** Plain FKs plus policy subqueries (`exists (…)`) — slower
  and easy to forget on new tables.
- **Consequences:** Parents carry an extra `unique (user_id, id)`; children
  index `(user_id, x_id)`. Nullable references use `ON DELETE SET NULL
(column)` so `user_id` is never nulled.

## ADR-009 — History-protecting FKs use NO ACTION, not RESTRICT

- **Decision:** `metric_events → metric_definitions` and
  `metric_definitions → score_categories` use the default NO ACTION.
- **Reason:** Both block deleting a parent that still has history. RESTRICT
  checks immediately and would also block the account-deletion cascade;
  NO ACTION checks at end of statement, after the cascade has removed the
  children.
- **Consequences:** Users disable categories/metrics instead of deleting
  them once data exists. Account deletion is covered by a DB test.

## ADR-010 — Integration tables are server-write-only

- **Decision:** `integrations` and `sync_runs` are read-only for users;
  `oauth_credentials` is invisible to them. Provider-sourced
  `metric_events` can't be inserted or edited by users.
- **Reason:** OAuth callbacks and scheduled syncs run without a user
  session (service role). Letting users write these rows would allow
  forged sync state or pre-claimed external IDs that break deduplication.
- **Consequences:** Phase 7 adds a `server-only` service-role client used
  only by integration code. Users can still delete imported events
  (privacy requirement).

## ADR-011 — Internal functions live in a non-exposed `private` schema

- **Decision:** Trigger and bootstrap functions (including the
  `security definer` sign-up handler) live in `private`, with no usage for
  API roles. `public` contains tables only.
- **Reason:** Everything in `public` is published by the Data API and the
  generated types, even when EXECUTE is revoked. Supabase recommends keeping
  security definer functions out of exposed schemas.
- **Consequences:** Future RPCs meant for clients go in `public`
  deliberately, with explicit grants and tests.

## ADR-012 — Database tests run against the linked dev project in a rolled-back transaction

- **Decision:** SQL tests (`supabase/tests/*.test.sql`) run through
  `supabase db query --linked` inside `BEGIN … ROLLBACK`
  (`scripts/test-db.mjs`). `--pending` dry-runs unapplied migrations first.
  Static Vitest guards over the migration files run in CI.
- **Reason:** No Docker on the development machine, so no local Supabase
  stack (`supabase start`, pgTAP via `supabase test db`). The Management
  API path needs no database password.
- **Alternatives:** pgTAP with a local stack (adopt if Docker becomes
  available); a CI database (needs secrets in CI).
- **Consequences:** Behavioural DB tests don't run in CI yet; they must be
  run before every `db push`. Never link a production project.

## ADR-013 — Relative weights; "sum to 100" validated at edit time

- **Decision:** Category, metric and commitment weights are stored as
  relative numbers (0–100). The engine normalises. FR-003's "active
  categories total 100%" is validated by the settings action that edits
  weights, not by a database constraint.
- **Reason:** A deferred sum constraint would make enabling/disabling a
  single category or editing one weight impossible without a bulk RPC, and
  the engine must normalise defensively anyway.
- **Consequences:** Phase 4's weight editor saves all weights atomically
  and validates the sum.

## ADR-014 — Rolling local-day windows for metric periods

- **Decision:** A metric's `period` sets a trailing window of local
  calendar days ending on the local date of `asOf` (weekly = last 7 days),
  not the current calendar week/month.
- **Reason:** Life Score measures state. With calendar periods, a weekly
  running total would drop to 0 every Monday morning and recover by
  Sunday — a sawtooth that reflects the calendar, not the user. Calendar
  weeks belong to the Week Score (execution).
- **Alternatives:** Current calendar period (sawtooth); last _complete_
  period (always up to a week stale).
- **Consequences:** Windows use `profiles.timezone` local dates via `Intl`
  (DST-safe, no extra dependency).

## ADR-015 — Empty windows: zero for totals with history, else missing

- **Decision:** For `sum`/`count`, an empty window counts as 0 if the
  metric has earlier history; a never-recorded metric, an empty window for
  `avg`/`min`/`max`/`latest`, or an unavailable source is missing.
  Overridable per metric (`config.emptyWindow`).
- **Reason:** "Missing data is not zero" (spec §34) must not become a
  loophole: not logging a bad week would otherwise hide it by
  re-weighting. Conversely, a broken Strava sync must not read as "you
  stopped running".
- **Consequences:** Integration health feeds `unavailableSources` into the
  engine (phase 7). Zero-filled values are flagged and lose confidence as
  the last real event ages.

## ADR-016 — Floor scores for display; rank from the displayed number

- **Decision:** `displayScore()` floors; ranks are derived from the
  displayed integer.
- **Reason:** Rounding can show a number whose rank wasn't reached (29.6 →
  "30" but rank D) or claim "Complete" at 99.6. Flooring keeps the number
  and the rank consistent and honest (spec §45 "false precision").
- **Consequences:** The UI must use `displayScore()`, never `Math.round`.

## ADR-017 — Engine returns issue codes, not messages

- **Decision:** Scoring results carry typed `ScoreIssue` codes with data;
  the UI owns the Spanish copy.
- **Reason:** Keeps the engine language-neutral and testable; copy can
  change without touching scoring.

## ADR-018 — Two security-invoker RPCs in `public` for atomic scoring changes

- **Decision:** `update_category_settings(jsonb)` and
  `record_score_version(jsonb)` are the only client-callable functions.
  Both are `SECURITY INVOKER` (RLS and grants apply as for direct queries)
  and granted to `authenticated` only.
- **Reason:** Moving weight between categories can't be done row by row
  without passing through a total ≠ 100. Closing one score version and
  opening the next must be atomic and serialised (advisory lock) so periods
  stay contiguous and version numbers unique.
- **Consequences:** DB tests allow-list exactly these two functions. The
  app calls `record_score_version` after every scoring-relevant change; it
  is a no-op when the configuration (jsonb equality) is unchanged.

## ADR-019 — `io()` before every session read

- **Decision:** `getSessionUser()` calls `await io()` before Supabase.
- **Reason:** With Cache Components, reading the clock during a prerender
  is an error. Supabase's JWT validation and the scoring `asOf` both read
  the clock; with a real session this logged "unstable value `Date.now()`"
  on every authenticated route. `io()` marks the work as per-request,
  resolves immediately in real requests and Server Actions, and keeps
  prefetching possible.

## ADR-020 — Forms submit via `startTransition`, not `<form action>`

- **Decision:** App forms use `useFormAction()` (preventDefault +
  `startTransition(dispatch)`).
- **Reason:** React resets uncontrolled fields after a form action even
  when it returns a validation error, wiping long forms like the metric
  editor. The hook resets only when asked (after registering a value).
- **Consequences:** These forms need JavaScript; auth forms still work
  without it.

## ADR-021 — Values are dated by local day

- **Decision:** The user picks a local date. Today maps to "now"; past
  days map to local noon in the profile timezone.
- **Reason:** A value entered at 08:00 must not be stored at 12:00 — it
  would be a future event and ignored. Noon keeps past values on their day
  regardless of DST.

## ADR-022 — Dedicated E2E users created by SQL in the dev project

- **Decision:** Two confirmed users (`e2e-a@lifeos.test`,
  `e2e-b@lifeos.test`; reserved TLD, they never receive email) created
  with SQL through the Supabase CLI. Passwords live only in `.env.local`.
  Real-data specs reset user A before and after.
- **Reason:** Signed-in E2E and cross-user RLS checks need real sessions,
  and no service-role key exists in the project yet.
- **Consequences:** Never create them in production. Removal:
  `delete from auth.users where email like 'e2e-%@lifeos.test';`

## ADR-023 — 404s under streaming are verified by content, not status

- **Decision:** `notFound()` runs inside Suspense-wrapped sections; tests
  assert the Spanish "No encontrado" page rather than HTTP 404.
- **Reason:** With Partial Prerendering, the static shell has already been
  sent with status 200 when the session-dependent section finds the row
  isn't the user's. Nothing leaks: RLS returns no data.

## ADR-024 — A week is closed by its review, and closed weeks are frozen

- **Decision:** Closing a week = inserting its `weekly_reviews` row via the
  `close_week` RPC (security invoker), which also marks its commitments
  `closed` in the same transaction. RLS then refuses inserting, editing or
  deleting commitments of any week that has a review; review scores and
  summary are column-level read-only (only `user_notes` is updatable).
  Reviews can't be deleted by users.
- **Reason:** Spec: historical data is never destroyed or silently
  rewritten. Enforcing it in RLS (not only in the UI) means no client can
  bend a closed week. RLS rather than a trigger, because account-deletion
  cascades run outside RLS and must still remove everything.
- **Alternatives:** A trigger (blocks cascades); app-only checks (bypassable
  through the Data API); allowing reopening (makes history negotiable).
- **Consequences:** A closed week can't be fixed — the close form warns
  about it. E2E runs consume one old week of the test user per run.

## ADR-025 — Reviews are computed on the server with one score version

- **Decision:** `buildWeeklyReview` (pure engine) compares the Life Score
  at the end of the day before the week with the end of its last day (or
  now, when closing on that day), both computed with the configuration in
  force at closing time; its id is stored in
  `weekly_reviews.score_version_id`. The server action recomputes the
  summary — the client never sends scores. Rules are explicit constants:
  high execution ≥ 80, low < 50, stagnant |Δ| < 1 pt; the bottleneck is
  the off-target metric with the largest potential Life Score gain,
  `(100 − score) × metric share × category share`.
- **Reason:** Comparing two endpoints scored with different weights would
  make a configuration change look like progress. Every item in the review
  must be explainable (spec §3.3).
- **Alternatives:** Daily score snapshots (phase 6 history); LLM-written
  reviews (phase 11, on top of this structured summary).
- **Consequences:** Life Score and Week Score are shown side by side,
  never merged. Summaries carry `summaryVersion` and are validated with a
  schema when read back.

## ADR-026 — Week planning rules

- **Decision:** Commitments can be added, edited, cancelled or deleted in
  the current week and up to 4 weeks ahead. Past (unclosed) weeks only
  accept progress — late logging — so targets aren't bent after the fact.
  Progress starts when the week starts. A week can be closed from its last
  local day on (checked in the app and in `close_week`). Ended weeks with
  commitments and no review are listed as "por cerrar".
- **Reason:** Execution has to be measured against the plan as it was;
  closing on the last day matches a Sunday review habit.
- **Consequences:** Changing `week_starts_on` applies to new weeks; weeks
  already planned keep their dates and are still found by `?w=`.

## ADR-027 — Leaked password protection unavailable on the current plan

- **Decision:** Keep the 8-character minimum enforced by Supabase and the
  app; leave the HaveIBeenPwned check off while the project is on the free
  plan. The Supabase advisor warning is expected.
- **Reason:** The setting is a paid feature (confirmed by the user).
- **Consequences:** Revisit before real users join or when the plan
  changes; a stronger local password policy is an option then.

## ADR-028 — History is replayed from events with each date's rules

- **Decision:** `/history` recomputes past scores from `metric_events`
  using the score version in force at each date
  (`score_versions.configuration` applied to today's definitions by key).
  A metric created after that date joins with its first recorded
  configuration, so values dated in the past show up. Ranges are sampled
  to at most 120 points. `score_snapshots` stays unused for now.
- **Reason:** Events are never destroyed and versions keep the rules, so
  replay is exact, needs no background job, and honours "never recompute
  history with new rules" — a weight change today doesn't move last
  month's line. Backdated corrections do change the past, which is the
  point of backdating.
- **Alternatives:** Daily snapshots (need a scheduler and a service key,
  and would freeze errors the user later corrects); recomputing with
  today's rules (rewrites the meaning of history).
- **Consequences:** Cost grows with events × points; if it becomes slow,
  snapshots become a cache of this replay, not a different truth. Points
  whose stored rules can't be replayed (unknown engine version) fall back
  to today's rules and the UI says so.

## ADR-029 — Content-Security-Policy without nonces

- **Decision:** Every response carries a CSP built by
  `src/lib/security/csp.ts`: only this origin plus Supabase (HTTPS and
  websockets) for connections; no framing, plugins or foreign form
  targets; `'unsafe-eval'` only in development; scripts and styles allow
  `'unsafe-inline'`.
- **Reason:** Next.js inlines bootstrap scripts. Nonces would make every
  page dynamic and drop Partial Prerendering. The external origins are now
  known: OAuth providers (Strava, Google) are top-level navigations and
  their APIs are called server-side, so they need no CSP entries.
- **Alternatives:** Nonce-based strict CSP (slower pages); no CSP.
- **Consequences:** XSS defence still relies on React escaping and never
  using `dangerouslySetInnerHTML` with user data. Adding a browser-side
  origin (e.g. provider avatars) requires updating the CSP and its tests.
  Supersedes ADR-007.

## ADR-030 — Service worker caches assets, never personal pages

- **Decision:** `public/sw.js` caches hashed `_next/static` assets and
  icons (cache-first) and a static `/offline` page. Navigations always go
  to the network; offline they get `/offline`. Data requests and Server
  Actions pass through untouched. Registered only in production builds.
- **Reason:** Life OS holds health, money and career data: cached HTML
  could expose it on a shared device and would show stale scores. Spec
  §29 makes the offline shell and cached dashboard optional.
- **Consequences:** No offline data entry. When the network returns, the
  banner refreshes the page data. Bump `VERSION` in `sw.js` to purge old
  caches when its strategy changes.

## ADR-031 — Trends and diagnostics use today's configuration at both ends

- **Decision:** 7/30/90-day trends and the spec §11 strategy diagnostics
  score both ends with the configuration in force now. Diagnostics use
  the last four closed weeks: per category, weighted completion of its
  commitments vs. its score change over those weeks (≥ 80 % and < 2 pts →
  "high execution, low outcome"; < 50 % and ≤ 0 → "execution bottleneck").
  The bottleneck is the off-target metric with the largest potential Life
  Score gain.
- **Reason:** A trend answers "did my state change?"; a weight or target
  change in between would otherwise show up as progress or decline. The
  history chart, which answers "what did I see then?", keeps per-date
  rules (ADR-028).
- **Consequences:** Commitments without a category don't feed category
  diagnostics. Thresholds are constants in `src/lib/scoring/analytics.ts`.

## ADR-032 — Account deletion waits for the service-role key

- **Decision:** Personal data export ships now (RLS-scoped JSON). Account
  deletion will use `auth.admin.deleteUser` on the server with the
  service-role key, which also arrives for integrations.
- **Reason:** Users can't delete history rows by design (append-only
  versions, snapshots, reviews), and deleting from `auth.users` needs
  elevated rights. A `security definer` RPC in the exposed schema would
  break the catalog guarantee that none exist (ADR-011).
- **Consequences:** Until then, deletion is a manual SQL step for the
  project owner; the cascade is already tested in the database tests.

## ADR-033 — Integrations: adapters, canonical metrics, service-role writes

- **Decision:** Adapters (`src/lib/integrations`) turn provider payloads
  into canonical records (`strava.run_distance_km`,
  `google_calendar.planned_minutes`…). A metric opts in with
  `metric_definitions.source_metric` and an optional `source_filter`.
  Each sync reconciles a window (90 days first, then 30): inserts new
  items, updates edited ones and deletes those the provider removed —
  only for currently linked metrics, only within the window. Provider
  events and tokens are written with the service-role client, scoped by
  the verified user id on every query; users still can't forge provider
  data through the API. Tokens: AES-256-GCM, integration id as associated
  data. OAuth `state` in an httpOnly cookie bound to the user. Least
  privilege: Strava `activity:read_all`, Google
  `calendar.events.readonly`. Calendar events count as planned time,
  never as done.
- **Reason:** Spec §15–18 and the security rules: no provider payload in
  the engine, no token in the browser or logs, idempotent re-syncs (spec
  §17: never count an activity twice), and edits/deletions on the
  provider reflected instead of frozen errors.
- **Alternatives:** Webhooks (Strava supports them; later, with a public
  deployment); per-provider tables (duplicates the event model); RLS-only
  writes (would let users forge provider data).
- **Consequences:** Provider values add to manual ones — the UI warns not
  to log twice. Removing a link stops syncing but keeps past events.
  Disconnecting revokes access and forgets tokens; imported values stay
  until the user deletes them ("Borrar datos importados").

## ADR-034 — Daily scheduled sync plus manual sync

- **Decision:** `/api/cron/sync` (bearer `CRON_SECRET`, constant-time
  check) syncs every connected integration, least recently synced first,
  within a 50 s budget; `vercel.json` schedules it daily. Users can sync
  manually every 2 minutes.
- **Reason:** Vercel Hobby allows daily crons; Strava limits are 100–200
  requests / 15 min per app. Daily + on demand is enough for weekly and
  monthly metrics.
- **Consequences:** On a paid plan, raise the schedule (spec §31: every
  few hours) by editing `vercel.json` only.

## ADR-035 — AI coach: opt-in, structured input, numbers verified

- **Decision:** On a closed review the user may ask for an AI analysis.
  The server sends only a structured payload built from the stored review
  (scores, category/metric names, commitments, main goal, alerts — no
  email, no notes) to Claude (`claude-sonnet-5-5` by default, `AI_MODEL`
  to change) with a forced tool call returning JSON. Every number in the
  answer must appear in the payload (in prose forms: rounded, absolute,
  decimal comma); otherwise one retry, then nothing is saved. Results go
  to `ai_insights` with the payload, max 3 per week, deletable, included
  in the export.
- **Reason:** Spec §30: AI is an analysis layer, must not invent
  measurements, and all factual statements must come from stored data.
  Sending data to a third party must be the user's explicit choice.
- **Alternatives:** Free-text prompts (unverifiable); automatic weekly
  generation (sends data without asking); an SDK dependency (a single
  fetch call is enough and testable).
- **Consequences:** Without `ANTHROPIC_API_KEY` the panel says it isn't
  configured. The number check can reject a good answer that uses a
  number not in the data (e.g. a date); the retry and the "try again"
  message cover it.
