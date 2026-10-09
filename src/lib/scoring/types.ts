import type { Normalized } from "./normalize";
import type { DateWindow } from "./time";
import type {
  CommitmentCompletionType,
  CommitmentStatus,
  MetricAggregation,
  MetricDirection,
  MetricPeriod,
  MetricSource,
} from "./vocabulary";

// ---------------------------------------------------------------------------
// Inputs — plain domain objects, independent of the database layer.
// ---------------------------------------------------------------------------

export type CategoryInput = {
  id: string;
  key: string;
  name: string;
  /** Relative weight; normalised among enabled categories. */
  weight: number;
  enabled: boolean;
};

export type MetricDefinitionInput = {
  id: string;
  key: string;
  name: string;
  categoryId: string;
  direction: MetricDirection;
  period: MetricPeriod;
  aggregation: MetricAggregation;
  /** Relative weight; normalised among the category's enabled metrics. */
  weight: number;
  enabled: boolean;
  sourcePreference: MetricSource;
  /** Raw `metric_definitions.config`; validated by the engine. */
  config: unknown;
  unit?: string | null;
};

export type MetricEventInput = {
  id: string;
  metricDefinitionId: string;
  occurredAt: Date;
  /** `value_numeric`. Events without one only count for `count`. */
  value: number | null;
  source: MetricSource;
  externalRecordId?: string | null;
  /** 0–1. Defaults to 1. */
  confidence?: number;
};

export type ScoreContext = {
  /** The instant the score describes. Later events are ignored. */
  asOf: Date;
  /** IANA timezone used for local-date windows (profiles.timezone). */
  timeZone: string;
  /**
   * Sources whose integration is currently broken or disconnected. Their
   * metrics become "missing" instead of silently scoring zero.
   */
  unavailableSources?: readonly MetricSource[];
};

export type CommitmentInput = {
  id: string;
  title: string;
  categoryId?: string | null;
  targetValue: number;
  actualValue: number;
  weight: number;
  completionType: CommitmentCompletionType;
  status: CommitmentStatus;
  unit?: string | null;
};

// ---------------------------------------------------------------------------
// Outputs — every number carries what is needed to explain it (spec §3.3).
// ---------------------------------------------------------------------------

/**
 * Machine-readable notes. The UI turns codes into user-facing copy; the
 * engine stays language-neutral.
 */
export type ScoreIssue =
  | { code: "invalid_config"; errors: string[] }
  | { code: "source_unavailable"; source: MetricSource }
  | { code: "never_recorded" }
  | { code: "no_data_in_window" }
  | { code: "empty_window_counted_as_zero" }
  | { code: "insufficient_sample"; denominator: number; minDenominator: number }
  | { code: "unknown_ratio_metric"; key: string }
  | { code: "duplicate_events_ignored"; count: number }
  | { code: "events_without_value_ignored"; count: number }
  | { code: "future_events_ignored"; count: number }
  | { code: "overperformance_capped"; rawScore: number }
  | { code: "underperformance_floored"; rawScore: number }
  | { code: "dominant_metric"; metricKey: string; share: number }
  | { code: "no_weighted_items" }
  | { code: "metrics_without_category"; metricKeys: string[] };

export type MetricStatus = "scored" | "missing" | "error";

/** Spec §33. */
export type Freshness = "fresh" | "delayed" | "stale" | "missing" | "error";

export type MetricScore = {
  metricId: string;
  key: string;
  name: string;
  categoryId: string;
  direction: MetricDirection;
  period: MetricPeriod;
  aggregation: MetricAggregation;
  unit: string | null;
  status: MetricStatus;
  /** Aggregated value over the window (the ratio for ratio metrics). */
  value: number | null;
  /** 0–100, or null when missing/error. Never a stand-in zero. */
  score: number | null;
  normalized: Normalized | null;
  window: DateWindow;
  eventCount: number;
  lastEventAt: Date | null;
  freshness: Freshness;
  /** 0–1. Shown separately; never mixed into the score (spec §35). */
  confidence: number;
  ratio: { numerator: number; denominator: number } | null;
  issues: ScoreIssue[];
};

export type WeightedMetric = MetricScore & {
  weight: number;
  /** Share of the category's total enabled metric weight (0–1). */
  weightShare: number;
  /** Share among metrics that have a score (missing ones re-weighted out). */
  effectiveWeight: number;
  /** Points this metric adds to the category score. */
  categoryContribution: number;
  /** Points this metric adds to the Life Score. */
  lifeContribution: number;
};

export type Rank = {
  key: "D" | "C" | "B" | "A" | "S" | "world_class" | "complete";
  label: string;
  min: number;
  max: number;
};

export type CategoryScore = {
  categoryId: string;
  key: string;
  name: string;
  weight: number;
  /** Share of the total enabled category weight (0–1). */
  weightShare: number;
  /** Share among categories that have a score. */
  effectiveWeight: number;
  score: number | null;
  rank: Rank | null;
  /** Weighted share of metrics that have data (spec §34). */
  completeness: number;
  confidence: number;
  /** Points this category adds to the Life Score. */
  lifeContribution: number;
  metrics: WeightedMetric[];
  issues: ScoreIssue[];
};

export type LifeScore = {
  score: number | null;
  rank: Rank | null;
  completeness: number;
  confidence: number;
  categories: CategoryScore[];
  issues: ScoreIssue[];
  asOf: Date;
  timeZone: string;
};

export type CommitmentScore = CommitmentInput & {
  /** 0–1; doing more than the target is not rewarded (spec §10). */
  completion: number | null;
  completed: boolean;
  weightShare: number;
  /** Points this commitment adds to the Week Score. */
  contribution: number;
};

export type WeekScore = {
  score: number | null;
  completedCount: number;
  totalCount: number;
  /** completedCount / totalCount, unweighted ("7 / 9 completed"). */
  executionRate: number | null;
  commitments: CommitmentScore[];
  issues: ScoreIssue[];
};
