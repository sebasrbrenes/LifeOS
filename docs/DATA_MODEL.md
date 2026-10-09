# Data model

Source of truth: `supabase/migrations/`. Spec reference: §21–§23. Generated
TypeScript types: `src/lib/supabase/database.types.ts` (`npm run db:types`).

## Tables

| Table                | Purpose                                          | API role `authenticated` can                            |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `profiles`           | Timezone, currency, week start, units, main goal | select; update some columns                             |
| `score_categories`   | Life Score categories and weights                | select/insert/update/delete                             |
| `metric_definitions` | What is measured, how it scores (`config`)       | select/insert/update/delete                             |
| `metric_events`      | Canonical values with provenance                 | select/delete; insert/update only `manual`/`csv_import` |
| `goals`              | Desired future states                            | select/insert/update/delete                             |
| `goal_milestones`    | Milestone ladder per goal                        | select/insert/update/delete                             |
| `weekly_commitments` | Week Score inputs                                | select/insert/update/delete                             |
| `score_versions`     | Scoring configuration per period                 | select/insert; update name / close once                 |
| `score_snapshots`    | Immutable daily score history                    | select/insert                                           |
| `integrations`       | Provider connection state                        | select                                                  |
| `oauth_credentials`  | Encrypted provider tokens                        | nothing (service role only)                             |
| `sync_runs`          | Sync audit log                                   | select                                                  |
| `weekly_reviews`     | Weekly review + notes                            | select/insert; update `user_notes` only                 |

`anon` has no privileges on any table.

## Rules enforced by the database

**Ownership and isolation**

- Every row has `user_id` → `auth.users` `ON DELETE CASCADE`. Deleting an
  account deletes all of its data (tested).
- RLS on every table; policies compare `(select auth.uid())` with `user_id`
  and are scoped `to authenticated`.
- `user_id` defaults to `auth.uid()`, so clients don't send it.
- Cross-table references are composite `(user_id, x_id)` FKs: a row can
  never point at another user's category, metric, goal, version or
  integration — FK checks bypass RLS, so this matters.

**History is protected** (spec principles 5–7)

- A metric definition with events, or a category with metrics, can't be
  deleted (disable it instead).
- `score_snapshots` can't be updated by anyone, or deleted by users.
- `score_versions`: configuration is immutable; periods can't overlap
  (GiST exclusion), so there is at most one open version; a closed version
  can't be reopened.

**Data quality**

- Imported events (`strava`, `google_calendar`, `github`, `google_health`)
  must carry `external_record_id`; a partial unique index on
  `(user_id, source, external_record_id, metric_definition_id)` makes
  re-syncs idempotent (spec §17: never count an activity twice).
- Events need at least one value; numeric values can't be NaN/Infinity.
- Scores are `NULL` (no data) or within 0–100 — never a fake zero.
- Timezones must exist in `pg_timezone_names`.
- A week with a review is closed: RLS refuses inserting, editing or
  deleting its commitments (ADR-024). `close_week(...)` closes the
  commitments and inserts the review atomically, only from the week's last
  local day; `weekly_reviews.score_version_id` records the scoring used.
- Weekly reviews span exactly 7 days; boolean commitments have target 1;
  completed goals have `completed_at`.
- Users can't forge provider-sourced events; those arrive only from the
  server-side sync (service role).

**Not enforced in the database (by design)**

- Active category weights totalling 100 (FR-003). Weights are relative and
  the engine normalises them; the sum is validated where weights are edited
  (phase 4), because single-row edits would otherwise be impossible.
- `metric_definitions.config` shape per direction — validated by the score
  engine's schema (phase 3).
- `weekly_commitments.week_start` aligning with `profiles.week_starts_on` —
  application responsibility.

## Sign-up bootstrap

`auth.users` insert → `private.handle_new_user()` (security definer):

1. Creates the profile. `timezone` comes from sign-up metadata (the signup
   form sends the browser's IANA zone) if valid, else `UTC`.
2. Seeds the six default categories: Career 25, Business 20, Body 20,
   Money 15, Discipline 10, Life 10.

Existing users were backfilled by the migration.

## RPCs (ADR-018)

| Function                                       | Purpose                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `update_category_settings(p_categories jsonb)` | Save names/weights/enabled of several categories in one transaction; enabled weights must total 100 |
| `record_score_version(p_configuration jsonb)`  | Close the open score version and open the next at the same instant, or no-op if unchanged           |

Both are `SECURITY INVOKER` and executable by `authenticated` only.

## Schemas

- `public` — exposed by the Data API. Tables plus the two RPCs above.
- `private` — trigger/bootstrap functions. No usage for `anon` or
  `authenticated`, so they're invisible to the API and generated types.
- `extensions` — `btree_gist` (for the score-version exclusion constraint).

## Vocabularies

Stored as `text` + `CHECK` (easier to evolve than enums):

- `metric_definitions.direction`: higher_is_better, lower_is_better,
  target_range, boolean, milestone, ratio, custom
- `metric_definitions.period`: daily, weekly, monthly, quarterly, yearly,
  all_time
- `metric_definitions.aggregation`: sum, avg, min, max, latest, count
- sources (`source_preference`, `metric_events.source`): manual, strava,
  google_calendar, github, google_health, csv_import, internal, computed
- `goals.status`: active, paused, completed, abandoned
- `weekly_commitments.status`: active, closed, cancelled;
  `completion_type`: quantity, boolean
- `integrations.status`: connected, disconnected, error, unavailable
- `sync_runs.status`: running, succeeded, failed, partial

The score engine (phase 3) will mirror these in TypeScript, with a test
that keeps both in sync.

## Tests

- `supabase/tests/database.test.sql` (`npm run test:db`) — bootstrap,
  integrity rules, two-user RLS isolation (reads, writes, ownership
  transfer, cross-user FKs), server-only tables, anon lockout, catalog
  guarantees (RLS everywhere, no dangerous grants, no executable functions,
  no security definer in `public`), account-deletion cascade.
- `supabase/tests/migrations.test.ts` (Vitest, runs in CI) — static guards
  so every future table enables RLS, revokes default grants, and every
  policy/function follows the conventions.
