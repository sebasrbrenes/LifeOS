-- Phases 7–8 — link metrics to canonical provider metrics (ADR-033).
--
-- An integration adapter outputs normalised records such as
-- "strava.run_distance_km". A metric opts in by naming that source metric;
-- the sync writes one event per record into every enabled metric linked
-- to it. `source_filter` narrows which records count (e.g. calendar events
-- whose title contains "QA").

alter table public.metric_definitions
  add column source_metric text
    check (source_metric is null or source_metric ~ '^[a-z_]+\.[a-z0-9_]{1,60}$'),
  add column source_filter jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_filter) = 'object'),
  -- The provider prefix must match the metric's source.
  add constraint metric_definitions_source_metric_provider check (
    source_metric is null
    or split_part(source_metric, '.', 1) = source_preference
  );

comment on column public.metric_definitions.source_metric is
  'Canonical provider metric feeding this metric (e.g. strava.run_distance_km); null for manual metrics.';
comment on column public.metric_definitions.source_filter is
  'Provider-specific filter for which records count (validated by the app).';

create index metric_definitions_source_metric_idx
  on public.metric_definitions (user_id, source_metric)
  where source_metric is not null;
