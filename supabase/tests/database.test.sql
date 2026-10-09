-- Database tests: bootstrap, integrity rules, RLS isolation, grants and
-- account deletion.
--
-- Run with `npm run test:db`. The runner wraps this file in a transaction
-- that is always ROLLED BACK, so nothing persists. Any failed ASSERT or
-- unexpected error aborts the run with a non-zero exit code.
--
-- Fixture users:
--   A = aaaaaaaa-0000-4000-8000-000000000001  (acts through RLS)
--   B = bbbbbbbb-0000-4000-8000-000000000002  (the "other" user)

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'rls-a@lifeos.test',
   'authenticated', 'authenticated',
   '{"timezone": "America/Bogota", "display_name": "  Athlete A  "}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'rls-b@lifeos.test',
   'authenticated', 'authenticated',
   '{"timezone": "Mars/Olympus_Mons"}');

-- ---------------------------------------------------------------------------
-- 1. Sign-up bootstrap
-- ---------------------------------------------------------------------------
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b constant uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
begin
  assert (select count(*) from public.profiles where user_id = a) = 1,
    'bootstrap: profile created on sign-up';
  assert (select timezone from public.profiles where user_id = a) = 'America/Bogota',
    'bootstrap: valid sign-up timezone is kept';
  assert (select display_name from public.profiles where user_id = a) = 'Athlete A',
    'bootstrap: display name is trimmed';
  assert (select timezone from public.profiles where user_id = b) = 'UTC',
    'bootstrap: unknown timezone falls back to UTC';
  assert (select count(*) from public.score_categories where user_id = a) = 6,
    'bootstrap: six default categories';
  assert (select sum(weight) from public.score_categories where user_id = a) = 100,
    'bootstrap: default weights total 100';
  assert (
    select string_agg(key || ':' || weight::int, ',' order by position)
    from public.score_categories where user_id = a
  ) = 'career:25,business:20,body:20,money:15,discipline:10,life:10',
    'bootstrap: default categories match spec §4';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Fixtures for B (as table owner; RLS does not apply)
-- ---------------------------------------------------------------------------
select set_config(
  'test.b_category',
  (select id::text from public.score_categories
   where user_id = 'bbbbbbbb-0000-4000-8000-000000000002' and key = 'career'),
  true
);

insert into public.metric_definitions
  (id, user_id, category_id, key, name, period, direction, aggregation, config)
values
  ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000002',
   current_setting('test.b_category')::uuid, 'liquid_savings', 'Liquid savings',
   'all_time', 'higher_is_better', 'latest', '{"target": 5000}');

insert into public.metric_events (id, user_id, metric_definition_id, occurred_at, value_numeric)
values ('bbbbbbbb-0000-4000-8000-0000000000e1', 'bbbbbbbb-0000-4000-8000-000000000002',
        'bbbbbbbb-0000-4000-8000-0000000000d1', now(), 2500);

insert into public.goals (id, user_id, title)
values ('bbbbbbbb-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-000000000002',
        'B goal');

insert into public.weekly_commitments (user_id, week_start, title, target_value)
values ('bbbbbbbb-0000-4000-8000-000000000002', date '2026-10-05', 'B commitment', 3);

insert into public.integrations (id, user_id, provider, status)
values ('bbbbbbbb-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-000000000002',
        'strava', 'connected');

insert into public.oauth_credentials (integration_id, encrypted_access_token)
values ('bbbbbbbb-0000-4000-8000-0000000000f1', 'ciphertext');

insert into public.sync_runs (user_id, integration_id)
values ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000f1');

insert into public.score_versions (id, user_id, version, name, configuration, effective_from)
values ('bbbbbbbb-0000-4000-8000-000000000051', 'bbbbbbbb-0000-4000-8000-000000000002',
        1, 'v1', '{}', now() - interval '30 days');

insert into public.score_snapshots (user_id, score_version_id, snapshot_date, life_score)
values ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000051',
        current_date, 54);

insert into public.weekly_reviews (user_id, week_start, week_end)
values ('bbbbbbbb-0000-4000-8000-000000000002', date '2026-10-05', date '2026-10-11');

-- ---------------------------------------------------------------------------
-- 3. Integrity rules (as owner)
-- ---------------------------------------------------------------------------
do $$
declare
  b constant uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  b_def constant uuid := 'bbbbbbbb-0000-4000-8000-0000000000d1';
  b_version constant uuid := 'bbbbbbbb-0000-4000-8000-000000000051';
begin
  -- Imported records are deduplicated by external ID.
  insert into public.metric_events
    (user_id, metric_definition_id, occurred_at, value_numeric, source, external_record_id)
  values (b, b_def, now(), 5, 'strava', 'activity-1');
  begin
    insert into public.metric_events
      (user_id, metric_definition_id, occurred_at, value_numeric, source, external_record_id)
    values (b, b_def, now(), 5, 'strava', 'activity-1');
    raise exception 'FAIL: duplicate external record accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.metric_events
      (user_id, metric_definition_id, occurred_at, value_numeric, source)
    values (b, b_def, now(), 5, 'strava');
    raise exception 'FAIL: provider event without external ID accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.metric_events (user_id, metric_definition_id, occurred_at)
    values (b, b_def, now());
    raise exception 'FAIL: event without any value accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.metric_events (user_id, metric_definition_id, occurred_at, value_numeric)
    values (b, b_def, now(), 'NaN');
    raise exception 'FAIL: NaN value accepted';
  exception when check_violation then null;
  end;

  -- History can't be destroyed by deleting its definition or category.
  begin
    delete from public.metric_definitions where id = b_def;
    raise exception 'FAIL: metric definition with events deleted';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from public.score_categories where id = current_setting('test.b_category')::uuid;
    raise exception 'FAIL: category with metrics deleted';
  exception when foreign_key_violation then null;
  end;

  -- Score versions: no overlap, immutable configuration, close once.
  begin
    insert into public.score_versions (user_id, version, name, configuration, effective_from)
    values (b, 2, 'v2', '{}', now() - interval '1 day');
    raise exception 'FAIL: overlapping score versions accepted';
  exception when exclusion_violation then null;
  end;
  begin
    update public.score_versions set configuration = '{"changed": true}' where id = b_version;
    raise exception 'FAIL: score version configuration changed';
  exception when object_not_in_prerequisite_state then null;
  end;
  update public.score_versions set name = 'Career v1' where id = b_version;
  update public.score_versions set effective_to = now() where id = b_version;
  insert into public.score_versions (user_id, version, name, configuration, effective_from)
  values (b, 2, 'v2', '{}', now());
  begin
    update public.score_versions set effective_to = null where id = b_version;
    raise exception 'FAIL: closed score version reopened';
  exception when object_not_in_prerequisite_state then null;
  end;

  -- Snapshots are immutable.
  begin
    update public.score_snapshots set life_score = 99 where user_id = b;
    raise exception 'FAIL: score snapshot updated';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    insert into public.score_snapshots (user_id, score_version_id, snapshot_date, life_score)
    values (b, b_version, current_date - 1, 101);
    raise exception 'FAIL: score above 100 accepted';
  exception when check_violation then null;
  end;

  -- Profile and calendar rules.
  begin
    update public.profiles set timezone = 'Mars/Olympus_Mons' where user_id = b;
    raise exception 'FAIL: invalid timezone accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.weekly_reviews (user_id, week_start, week_end)
    values (b, date '2026-10-12', date '2026-10-20');
    raise exception 'FAIL: review not spanning 7 days accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.weekly_commitments
      (user_id, week_start, title, target_value, completion_type)
    values (b, date '2026-10-05', 'Bool', 3, 'boolean');
    raise exception 'FAIL: boolean commitment with target 3 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.goals (user_id, title, status)
    values (b, 'Done without date', 'completed');
    raise exception 'FAIL: completed goal without completed_at accepted';
  exception when check_violation then null;
  end;
end $$;

-- Metric sources: provider prefix must match the metric's source (ADR-033).
do $$
declare
  b constant uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
begin
  insert into public.metric_definitions
    (user_id, category_id, key, name, period, direction, aggregation,
     source_preference, source_metric, source_filter)
  values (b, current_setting('test.b_category')::uuid, 'strava_km', 'Km', 'weekly',
          'higher_is_better', 'sum', 'strava', 'strava.run_distance_km', '{}');
  begin
    insert into public.metric_definitions
      (user_id, category_id, key, name, period, direction, aggregation,
       source_preference, source_metric)
    values (b, current_setting('test.b_category')::uuid, 'mismatch', 'X', 'weekly',
            'higher_is_better', 'sum', 'manual', 'strava.run_distance_km');
    raise exception 'FAIL: source metric from another provider accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.metric_definitions
      (user_id, category_id, key, name, period, direction, aggregation,
       source_preference, source_metric)
    values (b, current_setting('test.b_category')::uuid, 'bad_name', 'X', 'weekly',
            'higher_is_better', 'sum', 'strava', 'Strava Run!');
    raise exception 'FAIL: malformed source metric accepted';
  exception when check_violation then null;
  end;
  begin
    update public.metric_definitions set source_filter = '[]' where key = 'strava_km';
    raise exception 'FAIL: non-object source filter accepted';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. RLS: user A through the API role
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "aaaaaaaa-0000-4000-8000-000000000001", "role": "authenticated"}',
  true
);

do $$
declare
  a constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b constant uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  n integer;
  my_category uuid;
  my_definition uuid;
  my_goal uuid;
  my_version uuid;
begin
  assert auth.uid() = a, 'rls: running as A';

  -- Reads only return A's rows.
  assert (select count(*) from public.profiles) = 1, 'rls: one profile visible';
  assert (select count(*) from public.score_categories) = 6, 'rls: own categories only';
  assert (select count(*) from public.metric_definitions) = 0, 'rls: B metric definitions hidden';
  assert (select count(*) from public.metric_events) = 0, 'rls: B metric events hidden';
  assert (select count(*) from public.goals) = 0, 'rls: B goals hidden';
  assert (select count(*) from public.weekly_commitments) = 0, 'rls: B commitments hidden';
  assert (select count(*) from public.integrations) = 0, 'rls: B integrations hidden';
  assert (select count(*) from public.sync_runs) = 0, 'rls: B sync runs hidden';
  assert (select count(*) from public.score_versions) = 0, 'rls: B score versions hidden';
  assert (select count(*) from public.score_snapshots) = 0, 'rls: B snapshots hidden';
  assert (select count(*) from public.weekly_reviews) = 0, 'rls: B reviews hidden';

  -- Writes can't touch B's rows.
  update public.score_categories set name = 'Hacked' where user_id = b;
  get diagnostics n = row_count;
  assert n = 0, 'rls: cannot update B categories';
  update public.profiles set display_name = 'Hacked' where user_id = b;
  get diagnostics n = row_count;
  assert n = 0, 'rls: cannot update B profile';
  delete from public.metric_events where user_id = b;
  get diagnostics n = row_count;
  assert n = 0, 'rls: cannot delete B events';
  delete from public.goals where user_id = b;
  get diagnostics n = row_count;
  assert n = 0, 'rls: cannot delete B goals';

  begin
    insert into public.score_categories (user_id, key, name, weight)
    values (b, 'spy', 'Spy', 1);
    raise exception 'FAIL: inserted a row owned by B';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.score_categories set user_id = b where key = 'career';
    raise exception 'FAIL: moved own row to B';
  exception when insufficient_privilege then null;
  end;
  -- Composite FKs: can't attach own rows to B's rows.
  begin
    insert into public.metric_definitions (category_id, key, name, period, direction, aggregation)
    values (current_setting('test.b_category')::uuid, 'spy', 'Spy', 'weekly',
            'higher_is_better', 'sum');
    raise exception 'FAIL: metric attached to B category';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.profiles set primary_goal_id = 'bbbbbbbb-0000-4000-8000-0000000000a1';
    raise exception 'FAIL: primary goal set to B goal';
  exception when foreign_key_violation then null;
  end;

  -- Server-only tables.
  begin
    perform 1 from public.oauth_credentials;
    raise exception 'FAIL: oauth_credentials readable';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.integrations (user_id, provider) values (a, 'strava');
    raise exception 'FAIL: integration inserted by user';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.sync_runs (user_id, integration_id)
    values (a, 'bbbbbbbb-0000-4000-8000-0000000000f1');
    raise exception 'FAIL: sync run inserted by user';
  exception when insufficient_privilege then null;
  end;

  -- Happy path on own data.
  select id into my_category from public.score_categories where key = 'body';
  insert into public.metric_definitions
    (category_id, key, name, unit, period, direction, aggregation, config)
  values (my_category, 'weekly_running_km', 'Weekly running distance', 'km',
          'weekly', 'higher_is_better', 'sum', '{"target": 15}')
  returning id into my_definition;

  insert into public.metric_events (metric_definition_id, occurred_at, value_numeric, unit, note)
  values (my_definition, now() - interval '3 days', 12, 'km', 'backdated entry');
  update public.metric_events set value_numeric = 13 where metric_definition_id = my_definition;
  get diagnostics n = row_count;
  assert n = 1, 'rls: can edit own manual event';
  assert (select user_id from public.metric_events where metric_definition_id = my_definition) = a,
    'defaults: user_id defaults to auth.uid()';

  begin
    insert into public.metric_events
      (metric_definition_id, occurred_at, value_numeric, source, external_record_id)
    values (my_definition, now(), 5, 'strava', 'forged-1');
    raise exception 'FAIL: user wrote a provider-sourced event';
  exception when insufficient_privilege then null;
  end;

  insert into public.goals (category_id, title) values (my_category, 'Run 5K under 25 minutes')
  returning id into my_goal;
  insert into public.goal_milestones (goal_id, name, score_value)
  values (my_goal, 'Sub 28:00', 50);
  update public.profiles set primary_goal_id = my_goal, timezone = 'Europe/Madrid';
  get diagnostics n = row_count;
  assert n = 1, 'rls: can update own profile';
  begin
    update public.profiles set user_id = b;
    raise exception 'FAIL: profile user_id changed';
  exception when insufficient_privilege then null;
  end;

  insert into public.weekly_commitments (category_id, week_start, title, target_value, unit)
  values (my_category, date '2026-10-05', '3 runs', 3, 'runs');

  insert into public.score_versions (version, name, configuration)
  values (1, 'v1', '{"categories": {}}') returning id into my_version;
  insert into public.score_snapshots (score_version_id, snapshot_date, life_score, week_score)
  values (my_version, current_date, 54.8, 92);
  -- Missing data is NULL, not zero.
  insert into public.score_snapshots (score_version_id, snapshot_date, life_score, week_score)
  values (my_version, current_date - 1, null, null);

  insert into public.weekly_reviews (week_start, week_end) values (date '2026-10-05', date '2026-10-11');
  update public.weekly_reviews set user_notes = 'Strong execution week.';
  get diagnostics n = row_count;
  assert n = 1, 'rls: can annotate own review';

  -- updated_at is maintained by trigger.
  update public.score_categories set updated_at = '2000-01-01', name = 'Body'
  where id = my_category;
  assert (select updated_at from public.score_categories where id = my_category)
    > timestamptz '2000-01-02', 'trigger: updated_at refreshed';

  -- Deleting a goal clears it as primary objective and removes milestones.
  delete from public.goals where id = my_goal;
  assert (select primary_goal_id from public.profiles) is null,
    'fk: primary goal cleared when goal deleted';
  assert (select count(*) from public.goal_milestones) = 0,
    'fk: milestones deleted with goal';

  -- History is append-only for users.
  begin
    delete from public.score_snapshots;
    raise exception 'FAIL: user deleted snapshots';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.score_versions;
    raise exception 'FAIL: user deleted score versions';
  exception when insufficient_privilege then null;
  end;

  -- Internal functions are not reachable through the API.
  begin
    perform private.seed_default_categories(a);
    raise exception 'FAIL: seed_default_categories callable by user';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4b. RPCs as user A
-- ---------------------------------------------------------------------------
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  payload jsonb;
  first_version public.score_versions;
  same_version public.score_versions;
  next_version public.score_versions;
begin
  -- update_category_settings: moving weight between categories in one call.
  select jsonb_agg(jsonb_build_object(
    'id', id,
    'name', case key when 'career' then 'Carrera' else name end,
    'weight', case key when 'career' then 30 when 'business' then 15 else weight end,
    'enabled', enabled))
  into payload from public.score_categories;
  perform public.update_category_settings(payload);
  assert (select weight from public.score_categories where key = 'career') = 30,
    'rpc: weights saved';
  assert (select name from public.score_categories where key = 'career') = 'Carrera',
    'rpc: names saved';

  -- Totals other than 100 are rejected and nothing is written.
  select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'weight',
    case key when 'career' then 31 else weight end, 'enabled', enabled))
  into payload from public.score_categories;
  begin
    perform public.update_category_settings(payload);
    raise exception 'FAIL: weights totalling 101 accepted';
  exception when check_violation then null;
  end;
  assert (select weight from public.score_categories where key = 'career') = 30,
    'rpc: rejected update left weights unchanged';

  -- Disabling a category requires redistributing its weight.
  select jsonb_agg(jsonb_build_object('id', id, 'name', name,
    'weight', case key when 'life' then 0 when 'career' then 40 else weight end,
    'enabled', key <> 'life'))
  into payload from public.score_categories;
  perform public.update_category_settings(payload);
  assert not (select enabled from public.score_categories where key = 'life'),
    'rpc: category disabled';

  select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'weight', weight,
    'enabled', false))
  into payload from public.score_categories;
  begin
    perform public.update_category_settings(payload);
    raise exception 'FAIL: all categories disabled';
  exception when check_violation then null;
  end;

  -- Another user's category is invisible, so it can't be updated.
  begin
    perform public.update_category_settings(jsonb_build_array(jsonb_build_object(
      'id', current_setting('test.b_category'), 'name', 'Hacked',
      'weight', 100, 'enabled', true)));
    raise exception 'FAIL: updated B category through RPC';
  exception when no_data_found then null;
  end;

  -- record_score_version: no-op when unchanged, new version when changed.
  select * into first_version
  from public.record_score_version('{"engineVersion": 1, "categories": [], "metrics": []}');
  select * into same_version
  from public.record_score_version('{"metrics": [], "categories": [], "engineVersion": 1}');
  assert same_version.id = first_version.id, 'rpc: unchanged config keeps the version';

  select * into next_version
  from public.record_score_version('{"engineVersion": 1, "categories": [{"key": "x"}], "metrics": []}');
  assert next_version.version = first_version.version + 1, 'rpc: next version number';
  assert next_version.user_id = a, 'rpc: version owned by caller';
  assert (select effective_to from public.score_versions where id = first_version.id)
    = next_version.effective_from, 'rpc: previous version closed where the next starts';
  assert (select count(*) from public.score_versions where effective_to is null) = 1,
    'rpc: exactly one open version';
end $$;

-- ---------------------------------------------------------------------------
-- 4c. Week system as user A: closing a week freezes it (ADR-024)
-- ---------------------------------------------------------------------------
do $$
declare
  b_version constant uuid := 'bbbbbbbb-0000-4000-8000-000000000051';
  closed_week constant date := date '2026-09-28';
  commitment uuid;
  review public.weekly_reviews;
  n integer;
begin
  insert into public.weekly_commitments (week_start, title, target_value, actual_value)
  values (closed_week, 'Run 3 times', 3, 2) returning id into commitment;

  review := public.close_week(closed_week, 50, 52.5, 66.67, null,
                              '{"summaryVersion": 1}', '  Good week  ');
  assert review.week_end = closed_week + 6, 'close_week: week_end set';
  assert review.user_notes = 'Good week', 'close_week: notes trimmed';
  assert review.week_score = 66.67, 'close_week: week score saved';
  assert (select status from public.weekly_commitments where id = commitment) = 'closed',
    'close_week: commitments closed';

  -- The closed week is read-only.
  update public.weekly_commitments set actual_value = 3 where id = commitment;
  get diagnostics n = row_count;
  assert n = 0, 'closed week: commitment progress frozen';
  delete from public.weekly_commitments where id = commitment;
  get diagnostics n = row_count;
  assert n = 0, 'closed week: commitment cannot be deleted';
  begin
    insert into public.weekly_commitments (week_start, title, target_value)
    values (closed_week, 'Late addition', 1);
    raise exception 'FAIL: commitment added to a closed week';
  exception when insufficient_privilege then null;
  end;
  insert into public.weekly_commitments (week_start, title, target_value)
  values (date '2026-10-19', 'Open week', 1);
  begin
    update public.weekly_commitments set week_start = closed_week
    where week_start = date '2026-10-19';
    raise exception 'FAIL: commitment moved into a closed week';
  exception when insufficient_privilege then null;
  end;

  -- Review scores are history; notes stay editable.
  begin
    update public.weekly_reviews set week_score = 100 where week_start = closed_week;
    raise exception 'FAIL: review score edited';
  exception when insufficient_privilege then null;
  end;
  update public.weekly_reviews set user_notes = 'Edited' where week_start = closed_week;
  get diagnostics n = row_count;
  assert n = 1, 'review: notes editable';

  -- A week closes once, and only from its last day on.
  begin
    perform public.close_week(closed_week, null, null, null, null, '{}', null);
    raise exception 'FAIL: week closed twice';
  exception when unique_violation then null;
  end;
  begin
    perform public.close_week(current_date + 14, null, null, null, null, '{}', null);
    raise exception 'FAIL: future week closed';
  exception when check_violation then null;
  end;
  -- Another user's score version can't be referenced.
  begin
    perform public.close_week(date '2026-09-21', null, null, null, b_version, '{}', null);
    raise exception 'FAIL: review referenced B score version';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4d. AI insights as user A: only for own closed weeks, never others'
-- ---------------------------------------------------------------------------
do $$
declare
  n integer;
begin
  -- A closed 2026-09-28 in 4c and has a review for 2026-10-05.
  insert into public.ai_insights (week_start, model, payload, content)
  values (date '2026-09-28', 'test-model', '{"weekScore": 66.67}', '{"summary": "ok"}');
  assert (select count(*) from public.ai_insights) = 1, 'ai: own insight saved';
  begin
    insert into public.ai_insights (week_start, model, payload, content)
    values (date '2026-08-03', 'test-model', '{}', '{}');
    raise exception 'FAIL: insight for a week without review accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.ai_insights (user_id, week_start, model, payload, content)
    values ('bbbbbbbb-0000-4000-8000-000000000002', date '2026-10-05', 'm', '{}', '{}');
    raise exception 'FAIL: insight inserted for B';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_insights set content = '{"summary": "edited"}';
    raise exception 'FAIL: insight edited';
  exception when insufficient_privilege then null;
  end;
  delete from public.ai_insights;
  get diagnostics n = row_count;
  assert n = 1, 'ai: owner can delete own insight';
end $$;

-- ---------------------------------------------------------------------------
-- 5. anon (signed-out API callers) can't read or write any table
-- ---------------------------------------------------------------------------
reset role;
set local role anon;

do $$
declare
  t text;
begin
  for t in select tablename from pg_catalog.pg_tables where schemaname = 'public' loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'FAIL: anon can read public.%', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 6. Catalog-level guarantees
-- ---------------------------------------------------------------------------
do $$
declare
  offender text;
begin
  select string_agg(c.relname, ', ') into offender
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  assert offender is null, format('catalog: RLS disabled on %s', offender);

  select string_agg(format('%s:%s:%s', c.relname, r.rolname, p.priv), ', ') into offender
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as r (rolname)
  cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) as p (priv)
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and has_table_privilege(r.rolname, c.oid, p.priv);
  assert offender is null, format('catalog: dangerous grants %s', offender);

  select string_agg(c.relname, ', ') into offender
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and (has_any_column_privilege('anon', c.oid, 'SELECT')
      or has_any_column_privilege('anon', c.oid, 'INSERT')
      or has_any_column_privilege('anon', c.oid, 'UPDATE'));
  assert offender is null, format('catalog: anon has privileges on %s', offender);

  select string_agg(p.proname, ', ') into offender
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE');
  assert offender is null, format('catalog: anon can execute %s', offender);

  -- Only the deliberate, security-invoker RPCs are callable by users.
  select string_agg(p.proname, ', ') into offender
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and p.proname not in ('update_category_settings', 'record_score_version', 'close_week');
  assert offender is null, format('catalog: unexpected callable functions %s', offender);

  assert not has_schema_privilege('anon', 'private', 'USAGE')
     and not has_schema_privilege('authenticated', 'private', 'USAGE'),
    'catalog: API roles can use the private schema';

  select string_agg(p.proname, ', ') into offender
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef;
  assert offender is null,
    format('catalog: security definer functions in exposed schema: %s', offender);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Deleting an account removes all of its data
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  remaining bigint;
begin
  delete from auth.users
  where id in ('aaaaaaaa-0000-4000-8000-000000000001',
               'bbbbbbbb-0000-4000-8000-000000000002');

  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'user_id'
  loop
    execute format(
      'select count(*) from public.%I where user_id in (%L, %L)', t,
      'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002'
    ) into remaining;
    assert remaining = 0, format('cascade: %s rows left in %s', remaining, t);
  end loop;

  assert (select count(*) from public.oauth_credentials
          where integration_id = 'bbbbbbbb-0000-4000-8000-0000000000f1') = 0,
    'cascade: oauth credentials removed';
end $$;

select 'ok: all database tests passed' as result;
