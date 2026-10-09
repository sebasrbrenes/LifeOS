-- Phase 5 — week system: closed weeks are history (ADR-024).
--
-- A week is "closed" once its weekly review exists. From then on its
-- commitments are read-only and the review's scores and summary are
-- immutable; only the user's notes stay editable.

-- ---------------------------------------------------------------------------
-- weekly_reviews: which scoring configuration produced the numbers.
-- ---------------------------------------------------------------------------

alter table public.weekly_reviews
  add column score_version_id uuid,
  add foreign key (user_id, score_version_id)
    references public.score_versions (user_id, id);

comment on column public.weekly_reviews.score_version_id is
  'Score version used for both Life Score endpoints, so the delta compares like with like.';

-- Scores and summary are history: only notes can change after closing.
revoke update on table public.weekly_reviews from authenticated;
grant update (user_notes) on table public.weekly_reviews to authenticated;

-- ---------------------------------------------------------------------------
-- weekly_commitments: no writes into a closed week.
-- Enforced in RLS (not a trigger) so account deletion cascades, which run
-- outside RLS, still remove everything.
-- ---------------------------------------------------------------------------

drop policy "weekly_commitments: owner can insert" on public.weekly_commitments;
drop policy "weekly_commitments: owner can update" on public.weekly_commitments;
drop policy "weekly_commitments: owner can delete" on public.weekly_commitments;

create policy "weekly_commitments: owner can insert into open weeks"
  on public.weekly_commitments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from public.weekly_reviews r
      where r.user_id = weekly_commitments.user_id
        and r.week_start = weekly_commitments.week_start
    )
  );

create policy "weekly_commitments: owner can update in open weeks"
  on public.weekly_commitments
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from public.weekly_reviews r
      where r.user_id = weekly_commitments.user_id
        and r.week_start = weekly_commitments.week_start
    )
  )
  with check (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from public.weekly_reviews r
      where r.user_id = weekly_commitments.user_id
        and r.week_start = weekly_commitments.week_start
    )
  );

create policy "weekly_commitments: owner can delete in open weeks"
  on public.weekly_commitments
  for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from public.weekly_reviews r
      where r.user_id = weekly_commitments.user_id
        and r.week_start = weekly_commitments.week_start
    )
  );

-- ---------------------------------------------------------------------------
-- close_week: closes the commitments and saves the review atomically.
-- SECURITY INVOKER: grants and RLS apply as for direct queries. The scores
-- and summary are computed by the TypeScript engine; the database checks
-- what it can (the week has ended or ends today, in the user's timezone)
-- and the unique (user_id, week_start) key makes closing happen once.
-- ---------------------------------------------------------------------------

create function public.close_week(
  p_week_start date,
  p_life_score_start numeric,
  p_life_score_end numeric,
  p_week_score numeric,
  p_score_version_id uuid,
  p_summary jsonb,
  p_user_notes text
)
returns public.weekly_reviews
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  user_timezone text;
  local_today date;
  created public.weekly_reviews;
begin
  if current_user_id is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select timezone into user_timezone
  from public.profiles where user_id = current_user_id;
  local_today := (pg_catalog.now() at time zone coalesce(user_timezone, 'UTC'))::date;
  if p_week_start + 6 > local_today then
    raise exception 'week % has not reached its last day', p_week_start
      using errcode = 'check_violation';
  end if;

  update public.weekly_commitments
  set status = 'closed'
  where user_id = current_user_id
    and week_start = p_week_start
    and status = 'active';

  insert into public.weekly_reviews (
    user_id, week_start, week_end, life_score_start, life_score_end,
    week_score, score_version_id, summary, user_notes
  )
  values (
    current_user_id, p_week_start, p_week_start + 6, p_life_score_start,
    p_life_score_end, p_week_score, p_score_version_id,
    coalesce(p_summary, '{}'::jsonb), nullif(pg_catalog.btrim(p_user_notes), '')
  )
  returning * into created;

  return created;
end;
$$;

revoke all on function public.close_week(date, numeric, numeric, numeric, uuid, jsonb, text)
  from public, anon;
grant execute on function public.close_week(date, numeric, numeric, numeric, uuid, jsonb, text)
  to authenticated;
