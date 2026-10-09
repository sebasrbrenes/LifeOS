-- Life OS core schema (spec §21–§23).
--
-- Conventions
-- * Every user-owned table has `user_id` → auth.users ON DELETE CASCADE, so
--   deleting an account removes all of its data.
-- * Every table gets RLS in the same statement group that creates it, and
--   explicit grants: Supabase's default privileges give anon/authenticated
--   ALL (including TRUNCATE, which ignores RLS) on new tables, so each table
--   revokes everything and grants back only what the app needs.
-- * Cross-table references are composite `(user_id, x_id)` foreign keys so a
--   row can never point at another user's row (FK checks bypass RLS).
-- * History-protecting FKs use the default NO ACTION (not RESTRICT) so an
--   account-deletion cascade can remove parents and children in one
--   statement, while ordinary deletes of referenced rows still fail.
-- * Policies call `(select auth.uid())` so Postgres evaluates it once per
--   statement instead of once per row.
-- * Category/metric/commitment weights are relative. The score engine
--   normalises them; "active category weights total 100" (FR-003) is
--   validated where weights are edited, because toggling or editing one row
--   at a time would otherwise be impossible.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.validate_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception 'invalid timezone: %', new.timezone
      using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

-- Score versions are the record of how historical scores were computed.
-- Only the display name may change, and an open version may be closed once.
create function public.guard_score_version_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.version is distinct from old.version
    or new.configuration is distinct from old.configuration
    or new.effective_from is distinct from old.effective_from
    or new.created_at is distinct from old.created_at
  then
    raise exception 'score versions are immutable; create a new version instead'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if old.effective_to is not null
    and new.effective_to is distinct from old.effective_to
  then
    raise exception 'a closed score version cannot be changed'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

-- Snapshots are immutable history (spec §21.10: never silently recalculate).
create function public.prevent_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are immutable', tg_table_name
    using errcode = 'object_not_in_prerequisite_state';
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.validate_profile() from public, anon, authenticated;
revoke execute on function public.guard_score_version_update() from public, anon, authenticated;
revoke execute on function public.prevent_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles (FR-002). Created by the auth.users trigger; users read/update.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text
    check (display_name is null or char_length(display_name) between 1 and 80),
  timezone text not null default 'UTC',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  week_starts_on smallint not null default 1
    check (week_starts_on between 0 and 6),
  unit_system text not null default 'metric'
    check (unit_system in ('metric', 'imperial')),
  date_of_birth date check (date_of_birth >= date '1900-01-01'),
  primary_goal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.timezone is
  'IANA timezone; daily aggregation uses local dates in this zone.';
comment on column public.profiles.week_starts_on is
  '0 = Sunday … 6 = Saturday. Default 1 (Monday, ISO 8601).';
comment on column public.profiles.primary_goal_id is
  'Current main objective shown on the dashboard.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger profiles_validate
  before insert or update of timezone on public.profiles
  for each row execute function public.validate_profile();

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (
  display_name, timezone, currency, week_starts_on, unit_system,
  date_of_birth, primary_goal_id
) on table public.profiles to authenticated;

create policy "profiles: owner can select" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles: owner can update" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- score_categories (FR-003)
-- ---------------------------------------------------------------------------

create table public.score_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  name text not null check (char_length(name) between 1 and 60),
  weight numeric(6, 3) not null check (weight between 0 and 100),
  position integer not null default 0 check (position >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key),
  unique (user_id, id)
);

comment on column public.score_categories.weight is
  'Relative weight (percent by convention). Normalised by the score engine.';

create trigger score_categories_set_updated_at
  before update on public.score_categories
  for each row execute function public.set_updated_at();

alter table public.score_categories enable row level security;
revoke all on table public.score_categories from anon, authenticated;
grant select, insert, update, delete on table public.score_categories to authenticated;

create policy "score_categories: owner can select" on public.score_categories
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "score_categories: owner can insert" on public.score_categories
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "score_categories: owner can update" on public.score_categories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "score_categories: owner can delete" on public.score_categories
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- metric_definitions (FR-004)
-- ---------------------------------------------------------------------------

create table public.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  category_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,59}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  unit text check (unit is null or char_length(unit) between 1 and 20),
  period text not null
    check (period in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'all_time')),
  direction text not null
    check (direction in (
      'higher_is_better', 'lower_is_better', 'target_range', 'boolean',
      'milestone', 'ratio', 'custom'
    )),
  weight numeric(6, 3) not null default 1 check (weight between 0 and 100),
  aggregation text not null
    check (aggregation in ('sum', 'avg', 'min', 'max', 'latest', 'count')),
  source_preference text not null default 'manual'
    check (source_preference in (
      'manual', 'strava', 'google_calendar', 'github', 'google_health',
      'csv_import', 'internal', 'computed'
    )),
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  enabled boolean not null default true,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key),
  unique (user_id, id),
  -- NO ACTION: a category with metrics can't be deleted (disable it instead).
  foreign key (user_id, category_id)
    references public.score_categories (user_id, id)
);

comment on column public.metric_definitions.config is
  'Scoring parameters (target, targetMin/Max, milestones…). Validated by the score engine schema.';

create index metric_definitions_category_idx
  on public.metric_definitions (user_id, category_id);

create trigger metric_definitions_set_updated_at
  before update on public.metric_definitions
  for each row execute function public.set_updated_at();

alter table public.metric_definitions enable row level security;
revoke all on table public.metric_definitions from anon, authenticated;
grant select, insert, update, delete on table public.metric_definitions to authenticated;

create policy "metric_definitions: owner can select" on public.metric_definitions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "metric_definitions: owner can insert" on public.metric_definitions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "metric_definitions: owner can update" on public.metric_definitions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "metric_definitions: owner can delete" on public.metric_definitions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- metric_events (FR-005, §21.4): canonical event store with provenance.
-- ---------------------------------------------------------------------------

create table public.metric_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  metric_definition_id uuid not null,
  occurred_at timestamptz not null check (occurred_at >= timestamptz '1900-01-01'),
  value_numeric numeric
    check (value_numeric is null or value_numeric not in ('NaN', 'Infinity', '-Infinity')),
  value_text text check (value_text is null or char_length(value_text) <= 1000),
  value_json jsonb,
  unit text check (unit is null or char_length(unit) between 1 and 20),
  source text not null default 'manual'
    check (source in (
      'manual', 'strava', 'google_calendar', 'github', 'google_health',
      'csv_import', 'internal', 'computed'
    )),
  external_record_id text
    check (external_record_id is null or char_length(external_record_id) between 1 and 200),
  confidence numeric(4, 3) not null default 1 check (confidence between 0 and 1),
  note text check (note is null or char_length(note) <= 1000),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(value_numeric, value_text, value_json) >= 1),
  -- Provider data must carry its external ID so re-syncs can't double count.
  check (
    source not in ('strava', 'google_calendar', 'github', 'google_health')
    or external_record_id is not null
  ),
  -- NO ACTION: a metric with history can't be deleted (disable it instead).
  foreign key (user_id, metric_definition_id)
    references public.metric_definitions (user_id, id)
);

-- Deduplication key for imported records (spec §21.4).
create unique index metric_events_external_record_key
  on public.metric_events (user_id, source, external_record_id, metric_definition_id)
  where external_record_id is not null;
create index metric_events_definition_time_idx
  on public.metric_events (user_id, metric_definition_id, occurred_at desc);
create index metric_events_user_time_idx
  on public.metric_events (user_id, occurred_at desc);

create trigger metric_events_set_updated_at
  before update on public.metric_events
  for each row execute function public.set_updated_at();

alter table public.metric_events enable row level security;
revoke all on table public.metric_events from anon, authenticated;
grant select, insert, update, delete on table public.metric_events to authenticated;

-- Users write manual/CSV values; provider records arrive only through the
-- server-side sync (service role). Users may delete any of their events
-- (privacy: "delete imported provider data").
create policy "metric_events: owner can select" on public.metric_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "metric_events: owner can insert manual" on public.metric_events
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id and source in ('manual', 'csv_import')
  );
create policy "metric_events: owner can update manual" on public.metric_events
  for update to authenticated
  using ((select auth.uid()) = user_id and source in ('manual', 'csv_import'))
  with check ((select auth.uid()) = user_id and source in ('manual', 'csv_import'));
create policy "metric_events: owner can delete" on public.metric_events
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- goals (FR-006) and goal_milestones
-- ---------------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  category_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'abandoned')),
  priority smallint not null default 3 check (priority between 1 and 5),
  target_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null)),
  unique (user_id, id),
  foreign key (user_id, category_id)
    references public.score_categories (user_id, id)
);

comment on column public.goals.priority is '1 = highest, 5 = lowest.';

create index goals_category_idx on public.goals (user_id, category_id);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

alter table public.goals enable row level security;
revoke all on table public.goals from anon, authenticated;
grant select, insert, update, delete on table public.goals to authenticated;

create policy "goals: owner can select" on public.goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "goals: owner can insert" on public.goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "goals: owner can update" on public.goals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "goals: owner can delete" on public.goals
  for delete to authenticated using ((select auth.uid()) = user_id);

create table public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  goal_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  target_value numeric
    check (target_value is null or target_value not in ('NaN', 'Infinity', '-Infinity')),
  score_value numeric(5, 2) not null check (score_value between 0 and 100),
  position integer not null default 0 check (position >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, goal_id)
    references public.goals (user_id, id) on delete cascade
);

create index goal_milestones_goal_idx
  on public.goal_milestones (user_id, goal_id, position);

create trigger goal_milestones_set_updated_at
  before update on public.goal_milestones
  for each row execute function public.set_updated_at();

alter table public.goal_milestones enable row level security;
revoke all on table public.goal_milestones from anon, authenticated;
grant select, insert, update, delete on table public.goal_milestones to authenticated;

create policy "goal_milestones: owner can select" on public.goal_milestones
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "goal_milestones: owner can insert" on public.goal_milestones
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "goal_milestones: owner can update" on public.goal_milestones
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "goal_milestones: owner can delete" on public.goal_milestones
  for delete to authenticated using ((select auth.uid()) = user_id);

-- The profile's main objective must be one of the user's own goals.
alter table public.profiles
  add constraint profiles_primary_goal_fkey
  foreign key (user_id, primary_goal_id)
  references public.goals (user_id, id)
  on delete set null (primary_goal_id);

create index profiles_primary_goal_idx
  on public.profiles (user_id, primary_goal_id);

-- ---------------------------------------------------------------------------
-- weekly_commitments (FR-007)
-- ---------------------------------------------------------------------------

create table public.weekly_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  category_id uuid,
  week_start date not null,
  title text not null check (char_length(title) between 1 and 200),
  target_value numeric not null
    check (target_value > 0 and target_value <> 'Infinity'),
  actual_value numeric not null default 0
    check (actual_value >= 0 and actual_value <> 'Infinity'),
  unit text check (unit is null or char_length(unit) between 1 and 20),
  weight numeric(6, 3) not null default 1 check (weight between 0 and 100),
  completion_type text not null default 'quantity'
    check (completion_type in ('quantity', 'boolean')),
  status text not null default 'active'
    check (status in ('active', 'closed', 'cancelled')),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completion_type <> 'boolean' or target_value = 1),
  foreign key (user_id, category_id)
    references public.score_categories (user_id, id)
);

comment on column public.weekly_commitments.week_start is
  'First local day of the week (per profiles.week_starts_on).';
comment on column public.weekly_commitments.status is
  'active: current week; closed: week finalised; cancelled: excluded from Week Score.';

create index weekly_commitments_week_idx
  on public.weekly_commitments (user_id, week_start);
create index weekly_commitments_category_idx
  on public.weekly_commitments (user_id, category_id);

create trigger weekly_commitments_set_updated_at
  before update on public.weekly_commitments
  for each row execute function public.set_updated_at();

alter table public.weekly_commitments enable row level security;
revoke all on table public.weekly_commitments from anon, authenticated;
grant select, insert, update, delete on table public.weekly_commitments to authenticated;

create policy "weekly_commitments: owner can select" on public.weekly_commitments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "weekly_commitments: owner can insert" on public.weekly_commitments
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "weekly_commitments: owner can update" on public.weekly_commitments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "weekly_commitments: owner can delete" on public.weekly_commitments
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- score_versions (§21.9): how scores were computed during a period.
-- ---------------------------------------------------------------------------

create table public.score_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  version integer not null check (version >= 1),
  name text not null check (char_length(name) between 1 and 120),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  configuration jsonb not null check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  unique (user_id, version),
  unique (user_id, id),
  -- Periods never overlap, which also means at most one open version.
  constraint score_versions_no_overlap exclude using gist (
    user_id with =,
    tstzrange(effective_from, effective_to, '[)') with &&
  )
);

create trigger score_versions_guard_update
  before update on public.score_versions
  for each row execute function public.guard_score_version_update();

alter table public.score_versions enable row level security;
revoke all on table public.score_versions from anon, authenticated;
grant select, insert, update on table public.score_versions to authenticated;

create policy "score_versions: owner can select" on public.score_versions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "score_versions: owner can insert" on public.score_versions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "score_versions: owner can update" on public.score_versions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- score_snapshots (§21.10): immutable daily history.
-- ---------------------------------------------------------------------------

create table public.score_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  score_version_id uuid not null,
  snapshot_date date not null,
  -- NULL = not enough data to compute (missing data is not zero).
  life_score numeric(5, 2) check (life_score between 0 and 100),
  week_score numeric(5, 2) check (week_score between 0 and 100),
  category_scores jsonb not null default '{}'::jsonb
    check (jsonb_typeof(category_scores) = 'object'),
  metric_scores jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metric_scores) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date),
  foreign key (user_id, score_version_id)
    references public.score_versions (user_id, id)
);

create index score_snapshots_version_idx
  on public.score_snapshots (user_id, score_version_id);

create trigger score_snapshots_immutable
  before update on public.score_snapshots
  for each row execute function public.prevent_update();

alter table public.score_snapshots enable row level security;
revoke all on table public.score_snapshots from anon, authenticated;
grant select, insert on table public.score_snapshots to authenticated;

create policy "score_snapshots: owner can select" on public.score_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "score_snapshots: owner can insert" on public.score_snapshots
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- integrations, oauth_credentials, sync_runs (§21.11–§21.13)
-- Written only server-side (service role: OAuth callbacks, sync jobs).
-- ---------------------------------------------------------------------------

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null
    check (provider in ('strava', 'google_calendar', 'google_health', 'github')),
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'error', 'unavailable')),
  scopes jsonb not null default '[]'::jsonb check (jsonb_typeof(scopes) = 'array'),
  provider_user_id text
    check (provider_user_id is null or char_length(provider_user_id) <= 200),
  last_synced_at timestamptz,
  last_success_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  unique (user_id, id)
);

create trigger integrations_set_updated_at
  before update on public.integrations
  for each row execute function public.set_updated_at();

alter table public.integrations enable row level security;
revoke all on table public.integrations from anon, authenticated;
grant select on table public.integrations to authenticated;

create policy "integrations: owner can select" on public.integrations
  for select to authenticated using ((select auth.uid()) = user_id);

-- Tokens never reach the browser: no grants and no policies for anon or
-- authenticated. Only the service role (server) can read or write.
create table public.oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null unique
    references public.integrations (id) on delete cascade,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  expires_at timestamptz,
  token_type text check (token_type is null or char_length(token_type) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.oauth_credentials is
  'Encrypted provider tokens. Server-only (service role); never exposed to clients.';

create trigger oauth_credentials_set_updated_at
  before update on public.oauth_credentials
  for each row execute function public.set_updated_at();

alter table public.oauth_credentials enable row level security;
revoke all on table public.oauth_credentials from anon, authenticated;

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  integration_id uuid not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'partial')),
  records_received integer not null default 0 check (records_received >= 0),
  records_created integer not null default 0 check (records_created >= 0),
  records_updated integer not null default 0 check (records_updated >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 100),
  error_message text check (error_message is null or char_length(error_message) <= 1000),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  check (finished_at is null or finished_at >= started_at),
  check ((status = 'running') = (finished_at is null)),
  foreign key (user_id, integration_id)
    references public.integrations (user_id, id) on delete cascade
);

create index sync_runs_integration_idx
  on public.sync_runs (user_id, integration_id, started_at desc);

alter table public.sync_runs enable row level security;
revoke all on table public.sync_runs from anon, authenticated;
grant select on table public.sync_runs to authenticated;

create policy "sync_runs: owner can select" on public.sync_runs
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- weekly_reviews (§21.14)
-- ---------------------------------------------------------------------------

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  life_score_start numeric(5, 2) check (life_score_start between 0 and 100),
  life_score_end numeric(5, 2) check (life_score_end between 0 and 100),
  week_score numeric(5, 2) check (week_score between 0 and 100),
  summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(summary) = 'object'),
  user_notes text check (user_notes is null or char_length(user_notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (week_end = week_start + 6),
  unique (user_id, week_start)
);

create trigger weekly_reviews_set_updated_at
  before update on public.weekly_reviews
  for each row execute function public.set_updated_at();

alter table public.weekly_reviews enable row level security;
revoke all on table public.weekly_reviews from anon, authenticated;
grant select, insert, update on table public.weekly_reviews to authenticated;

create policy "weekly_reviews: owner can select" on public.weekly_reviews
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "weekly_reviews: owner can insert" on public.weekly_reviews
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "weekly_reviews: owner can update" on public.weekly_reviews
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
