-- Client-callable RPCs for multi-row scoring changes that must be atomic.
--
-- Both are SECURITY INVOKER: they run as the calling user, so table
-- grants and RLS apply exactly as for direct queries. They are the only
-- functions in the exposed `public` schema (ADR-011, ADR-018).

-- Saves several categories at once and enforces FR-003: the weights of the
-- enabled categories must total exactly 100 after the change. Doing this in
-- one transaction lets the user move weight between categories, which a
-- row-at-a-time update could never do without passing through an invalid
-- total.
--
-- p_categories: [{ "id": uuid, "name": text, "weight": number, "enabled": bool }]
create function public.update_category_settings(p_categories jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  updated integer;
  enabled_total numeric;
  enabled_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_categories) <> 'array' or jsonb_array_length(p_categories) = 0 then
    raise exception 'p_categories must be a non-empty array'
      using errcode = 'invalid_parameter_value';
  end if;

  for item in select value from jsonb_array_elements(p_categories) loop
    update public.score_categories
    set
      name = item ->> 'name',
      weight = (item ->> 'weight')::numeric,
      enabled = (item ->> 'enabled')::boolean
    where id = (item ->> 'id')::uuid;
    get diagnostics updated = row_count;
    if updated = 0 then
      -- Unknown id, or another user's category hidden by RLS.
      raise exception 'category % not found', item ->> 'id'
        using errcode = 'no_data_found';
    end if;
  end loop;

  select coalesce(sum(weight), 0), count(*)
  into enabled_total, enabled_count
  from public.score_categories
  where user_id = (select auth.uid()) and enabled;

  if enabled_count = 0 then
    raise exception 'at least one category must be enabled'
      using errcode = 'check_violation';
  end if;
  if enabled_total <> 100 then
    raise exception 'enabled category weights must total 100 (got %)', enabled_total
      using errcode = 'check_violation';
  end if;
end;
$$;

-- Records the scoring configuration in force from now on (spec §21.9).
-- No-op when it equals the open version; otherwise closes the open version
-- and opens the next one at the same instant, so periods never overlap or
-- leave gaps. Serialised per user to keep version numbers unique.
create function public.record_score_version(p_configuration jsonb)
returns public.score_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  switched_at timestamptz := clock_timestamp();
  open_version public.score_versions;
  next_version integer;
  created public.score_versions;
begin
  if current_user_id is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_configuration) <> 'object' then
    raise exception 'p_configuration must be an object'
      using errcode = 'invalid_parameter_value';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('score_versions:' || current_user_id::text, 0)
  );

  select * into open_version
  from public.score_versions
  where user_id = current_user_id and effective_to is null;

  -- jsonb equality ignores key order.
  if open_version.id is not null and open_version.configuration = p_configuration then
    return open_version;
  end if;

  if open_version.id is not null then
    update public.score_versions
    set effective_to = switched_at
    where id = open_version.id;
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.score_versions
  where user_id = current_user_id;

  insert into public.score_versions (user_id, version, name, effective_from, configuration)
  values (current_user_id, next_version, 'v' || next_version, switched_at, p_configuration)
  returning * into created;

  return created;
end;
$$;

revoke all on function public.update_category_settings(jsonb) from public, anon;
revoke all on function public.record_score_version(jsonb) from public, anon;
grant execute on function public.update_category_settings(jsonb) to authenticated;
grant execute on function public.record_score_version(jsonb) to authenticated;
