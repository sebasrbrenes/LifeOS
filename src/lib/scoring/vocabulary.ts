/**
 * Domain vocabularies. These mirror the CHECK constraints in
 * supabase/migrations; vocabulary.test.ts fails if the two drift apart.
 */

export const METRIC_DIRECTIONS = [
  "higher_is_better",
  "lower_is_better",
  "target_range",
  "boolean",
  "milestone",
  "ratio",
  "custom",
] as const;
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];

export const METRIC_PERIODS = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "all_time",
] as const;
export type MetricPeriod = (typeof METRIC_PERIODS)[number];

export const METRIC_AGGREGATIONS = [
  "sum",
  "avg",
  "min",
  "max",
  "latest",
  "count",
] as const;
export type MetricAggregation = (typeof METRIC_AGGREGATIONS)[number];

export const METRIC_SOURCES = [
  "manual",
  "strava",
  "google_calendar",
  "github",
  "google_health",
  "csv_import",
  "internal",
  "computed",
] as const;
export type MetricSource = (typeof METRIC_SOURCES)[number];

export const COMMITMENT_COMPLETION_TYPES = ["quantity", "boolean"] as const;
export type CommitmentCompletionType =
  (typeof COMMITMENT_COMPLETION_TYPES)[number];

export const COMMITMENT_STATUSES = ["active", "closed", "cancelled"] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

/**
 * Length of the trailing window, in local calendar days, that a metric of
 * each period is evaluated over. `null` = all history.
 */
export const PERIOD_WINDOW_DAYS: Record<MetricPeriod, number | null> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
  all_time: null,
};
