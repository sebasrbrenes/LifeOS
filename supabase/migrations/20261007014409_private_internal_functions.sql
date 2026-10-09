-- Move internal functions out of the API-exposed `public` schema.
--
-- `public` is published by the Data API, so anything in it is part of the
-- attack surface (and of the generated client types), even when EXECUTE is
-- revoked. Trigger and bootstrap functions live in `private`, which the API
-- roles cannot even see. Triggers keep working: they reference functions by
-- OID and are not subject to the caller's privileges.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter function public.set_updated_at() set schema private;
alter function public.validate_profile() set schema private;
alter function public.guard_score_version_update() set schema private;
alter function public.prevent_update() set schema private;
alter function public.seed_default_categories(uuid) set schema private;
alter function public.handle_new_user() set schema private;

-- Re-point the bootstrap at the moved seed function.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_timezone text := new.raw_user_meta_data ->> 'timezone';
  requested_name text :=
    nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 80), '');
begin
  insert into public.profiles (user_id, display_name, timezone)
  values (
    new.id,
    requested_name,
    case
      when exists (
        select 1 from pg_catalog.pg_timezone_names
        where name = requested_timezone
      ) then requested_timezone
      else 'UTC'
    end
  )
  on conflict (user_id) do nothing;

  perform private.seed_default_categories(new.id);
  return new;
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
