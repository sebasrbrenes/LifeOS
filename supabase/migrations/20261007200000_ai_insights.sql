-- Phase 11 — AI coach (spec §30, ADR-035).
--
-- An AI analysis of a closed week. The AI is an analysis layer: it reads
-- the stored review summary (sent as `payload`, kept for transparency)
-- and returns prose. Numbers in the prose are checked against the payload
-- before saving; the scores themselves never come from the AI.

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  week_start date not null,
  model text not null check (char_length(model) between 1 and 100),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default now(),
  -- Only for closed weeks.
  foreign key (user_id, week_start)
    references public.weekly_reviews (user_id, week_start) on delete cascade
);

create index ai_insights_week_idx
  on public.ai_insights (user_id, week_start, created_at desc);

alter table public.ai_insights enable row level security;
revoke all on table public.ai_insights from anon, authenticated;
grant select, insert, delete on table public.ai_insights to authenticated;

create policy "ai_insights: owner can select" on public.ai_insights
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_insights: owner can insert" on public.ai_insights
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ai_insights: owner can delete" on public.ai_insights
  for delete to authenticated using ((select auth.uid()) = user_id);
