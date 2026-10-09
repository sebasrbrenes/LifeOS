-- New-user bootstrap: every account gets a profile and the default Life
-- Score categories (spec §4) the moment it is created.

-- Default categories. Weights are editable later; these are only the
-- starting point. Idempotent per (user_id, key).
create function public.seed_default_categories(target_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.score_categories (user_id, key, name, weight, position)
  values
    (target_user_id, 'career',     'Career',     25, 0),
    (target_user_id, 'business',   'Business',   20, 1),
    (target_user_id, 'body',       'Body',       20, 2),
    (target_user_id, 'money',      'Money',      15, 3),
    (target_user_id, 'discipline', 'Discipline', 10, 4),
    (target_user_id, 'life',       'Life',       10, 5)
  on conflict (user_id, key) do nothing;
$$;

-- Runs as the function owner because new users have no session yet. Only
-- trusted, validated values from the sign-up metadata are used: an unknown
-- timezone falls back to UTC instead of blocking the sign-up.
create function public.handle_new_user()
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

  perform public.seed_default_categories(new.id);
  return new;
end;
$$;

-- Not callable through the API: only the trigger (and migrations) use them.
revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill accounts created before this migration.
insert into public.profiles (user_id)
select u.id
from auth.users as u
where not exists (select 1 from public.profiles as p where p.user_id = u.id);

select public.seed_default_categories(u.id) from auth.users as u;
