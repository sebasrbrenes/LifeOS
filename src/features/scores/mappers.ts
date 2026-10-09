import {
  COMMITMENT_COMPLETION_TYPES,
  COMMITMENT_STATUSES,
  METRIC_AGGREGATIONS,
  METRIC_DIRECTIONS,
  METRIC_PERIODS,
  METRIC_SOURCES,
  type CategoryInput,
  type CommitmentInput,
  type MetricDefinitionInput,
  type MetricEventInput,
} from "@/lib/scoring";
import type { Tables } from "@/lib/supabase/database.types";

/**
 * Database rows → score-engine inputs. The only place that knows both
 * shapes; the engine never sees Supabase types (spec principle 3).
 */

export type CategoryRow = Pick<
  Tables<"score_categories">,
  "id" | "key" | "name" | "weight" | "enabled" | "position"
>;
export type MetricRow = Pick<
  Tables<"metric_definitions">,
  | "id"
  | "key"
  | "name"
  | "description"
  | "category_id"
  | "direction"
  | "period"
  | "aggregation"
  | "weight"
  | "enabled"
  | "source_preference"
  | "config"
  | "unit"
  | "position"
> &
  // Loaded for the metric page; not part of scoring.
  Partial<
    Pick<Tables<"metric_definitions">, "source_metric" | "source_filter">
  >;
export type EventRow = Pick<
  Tables<"metric_events">,
  | "id"
  | "metric_definition_id"
  | "occurred_at"
  | "value_numeric"
  | "source"
  | "external_record_id"
  | "confidence"
>;
export type CommitmentRow = Pick<
  Tables<"weekly_commitments">,
  | "id"
  | "title"
  | "category_id"
  | "target_value"
  | "actual_value"
  | "weight"
  | "completion_type"
  | "status"
  | "unit"
>;

function oneOf<T extends string>(
  values: readonly T[],
  value: string,
  what: string,
): T {
  if ((values as readonly string[]).includes(value)) return value as T;
  throw new Error(`Unknown ${what}: ${value}`);
}

export function toCategoryInput(row: CategoryRow): CategoryInput {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    weight: Number(row.weight),
    enabled: row.enabled,
  };
}

export function toMetricInput(row: MetricRow): MetricDefinitionInput {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    categoryId: row.category_id,
    direction: oneOf(METRIC_DIRECTIONS, row.direction, "direction"),
    period: oneOf(METRIC_PERIODS, row.period, "period"),
    aggregation: oneOf(METRIC_AGGREGATIONS, row.aggregation, "aggregation"),
    weight: Number(row.weight),
    enabled: row.enabled,
    sourcePreference: oneOf(METRIC_SOURCES, row.source_preference, "source"),
    config: row.config,
    unit: row.unit,
  };
}

export function toEventInput(row: EventRow): MetricEventInput {
  return {
    id: row.id,
    metricDefinitionId: row.metric_definition_id,
    occurredAt: new Date(row.occurred_at),
    value: row.value_numeric === null ? null : Number(row.value_numeric),
    source: oneOf(METRIC_SOURCES, row.source, "source"),
    externalRecordId: row.external_record_id,
    confidence: Number(row.confidence),
  };
}

export function toCommitmentInput(row: CommitmentRow): CommitmentInput {
  return {
    id: row.id,
    title: row.title,
    categoryId: row.category_id,
    targetValue: Number(row.target_value),
    actualValue: Number(row.actual_value),
    weight: Number(row.weight),
    completionType: oneOf(
      COMMITMENT_COMPLETION_TYPES,
      row.completion_type,
      "completion type",
    ),
    status: oneOf(COMMITMENT_STATUSES, row.status, "commitment status"),
    unit: row.unit,
  };
}
