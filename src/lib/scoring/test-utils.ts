/**
 * Builders for scoring tests. Test-only: never imported by app code.
 */
import type {
  CategoryInput,
  CommitmentInput,
  MetricDefinitionInput,
  MetricEventInput,
  ScoreContext,
} from "./types";

export const AS_OF = new Date("2026-10-07T12:00:00Z");
export const CONTEXT: ScoreContext = { asOf: AS_OF, timeZone: "UTC" };

/** An instant `days` before AS_OF (same time of day). */
export function daysAgo(days: number): Date {
  return new Date(AS_OF.getTime() - days * 86_400_000);
}

export function category(
  overrides: Partial<CategoryInput> & { key: string },
): CategoryInput {
  return {
    id: `cat-${overrides.key}`,
    name: overrides.key,
    weight: 10,
    enabled: true,
    ...overrides,
  };
}

export function metric(
  overrides: Partial<MetricDefinitionInput> & { key: string },
): MetricDefinitionInput {
  return {
    id: `metric-${overrides.key}`,
    name: overrides.key,
    categoryId: "cat-body",
    direction: "higher_is_better",
    period: "weekly",
    aggregation: "sum",
    weight: 1,
    enabled: true,
    sourcePreference: "manual",
    config: { target: 10 },
    unit: null,
    ...overrides,
  };
}

let eventCounter = 0;

export function event(
  metricKey: string,
  value: number | null,
  occurredAt: Date = AS_OF,
  overrides: Partial<MetricEventInput> = {},
): MetricEventInput {
  eventCounter += 1;
  return {
    id: `event-${eventCounter}`,
    metricDefinitionId: `metric-${metricKey}`,
    occurredAt,
    value,
    source: "manual",
    externalRecordId: null,
    confidence: 1,
    ...overrides,
  };
}

export function eventsMap(
  events: readonly MetricEventInput[],
): Map<string, MetricEventInput[]> {
  const map = new Map<string, MetricEventInput[]>();
  for (const item of events) {
    map.set(item.metricDefinitionId, [
      ...(map.get(item.metricDefinitionId) ?? []),
      item,
    ]);
  }
  return map;
}

export function commitment(
  overrides: Partial<CommitmentInput> & { id: string },
): CommitmentInput {
  return {
    title: overrides.id,
    categoryId: null,
    targetValue: 3,
    actualValue: 0,
    weight: 1,
    completionType: "quantity",
    status: "active",
    unit: null,
    ...overrides,
  };
}
