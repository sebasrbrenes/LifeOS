import { parseMetricConfig, type ParsedMetricConfig } from "./metric-config";
import { normalize } from "./normalize";
import {
  daysBetween,
  evaluationWindow,
  isWithinWindow,
  localDate,
  type DateWindow,
} from "./time";
import type {
  Freshness,
  MetricDefinitionInput,
  MetricEventInput,
  MetricScore,
  ScoreContext,
  ScoreIssue,
} from "./types";
import { PERIOD_WINDOW_DAYS, type MetricAggregation } from "./vocabulary";

/** Freshness thresholds for all-time metrics (e.g. a savings balance). */
const ALL_TIME_FRESH_DAYS = 30;
const ALL_TIME_DELAYED_DAYS = 90;

/** How much each freshness level is trusted (spec §35). */
const FRESHNESS_CONFIDENCE: Record<Freshness, number> = {
  fresh: 1,
  delayed: 0.75,
  stale: 0.5,
  missing: 0,
  error: 0,
};

/**
 * Removes duplicate events: the same row twice, or the same external
 * record imported twice (spec §9.5 — never count an activity twice). The
 * database enforces this too; the engine doesn't rely on it.
 */
export function dedupeEvents(events: readonly MetricEventInput[]): {
  events: MetricEventInput[];
  duplicates: number;
} {
  const seenIds = new Set<string>();
  const seenExternal = new Set<string>();
  const unique: MetricEventInput[] = [];
  for (const event of events) {
    const externalKey = event.externalRecordId
      ? `${event.metricDefinitionId}|${event.source}|${event.externalRecordId}`
      : null;
    if (
      seenIds.has(event.id) ||
      (externalKey !== null && seenExternal.has(externalKey))
    ) {
      continue;
    }
    seenIds.add(event.id);
    if (externalKey !== null) seenExternal.add(externalKey);
    unique.push(event);
  }
  return { events: unique, duplicates: events.length - unique.length };
}

/** Aggregates event values. `null` when there is nothing to aggregate. */
export function aggregate(
  events: readonly MetricEventInput[],
  aggregation: MetricAggregation,
): number | null {
  if (aggregation === "count") return events.length;
  const valued = events.filter(
    (event): event is MetricEventInput & { value: number } =>
      event.value !== null && Number.isFinite(event.value),
  );
  if (valued.length === 0) return null;

  const values = valued.map((event) => event.value);
  switch (aggregation) {
    case "sum":
      return values.reduce((total, value) => total + value, 0);
    case "avg":
      return values.reduce((total, value) => total + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "latest": {
      // Most recent occurrence wins; on a tie, the later input row.
      let latest = valued[0];
      for (const event of valued) {
        if (event.occurredAt.getTime() >= latest.occurredAt.getTime()) {
          latest = event;
        }
      }
      return latest.value;
    }
  }
}

/**
 * What an empty window means when the user didn't say. For totals, an
 * empty window after earlier activity is a real zero ("no runs this
 * week"); for averages or balances it is simply unknown.
 */
export function defaultEmptyWindow(
  aggregation: MetricAggregation,
): "zero" | "missing" {
  return aggregation === "sum" || aggregation === "count" ? "zero" : "missing";
}

export function freshnessOf(
  lastEventAt: Date | null,
  period: MetricDefinitionInput["period"],
  context: ScoreContext,
): Freshness {
  if (!lastEventAt) return "missing";
  const age = daysBetween(
    localDate(lastEventAt, context.timeZone),
    localDate(context.asOf, context.timeZone),
  );
  const periodDays = PERIOD_WINDOW_DAYS[period];
  const [fresh, delayed] =
    periodDays === null
      ? [ALL_TIME_FRESH_DAYS, ALL_TIME_DELAYED_DAYS]
      : [periodDays, periodDays * 2];
  if (age < fresh) return "fresh";
  if (age < delayed) return "delayed";
  return "stale";
}

type EventSelection = {
  inWindow: MetricEventInput[];
  /** Any usable event at or before asOf, inside the window or not. */
  hasHistory: boolean;
  lastEventAt: Date | null;
  issues: ScoreIssue[];
};

/** Deduplicates, drops future/valueless events, keeps the window. */
function selectEvents(
  events: readonly MetricEventInput[],
  window: DateWindow,
  aggregation: MetricAggregation,
  context: ScoreContext,
): EventSelection {
  const issues: ScoreIssue[] = [];
  const { events: unique, duplicates } = dedupeEvents(events);
  if (duplicates > 0) {
    issues.push({ code: "duplicate_events_ignored", count: duplicates });
  }

  const asOf = context.asOf.getTime();
  const past = unique.filter((event) => event.occurredAt.getTime() <= asOf);
  if (past.length < unique.length) {
    issues.push({
      code: "future_events_ignored",
      count: unique.length - past.length,
    });
  }

  let usable = past;
  if (aggregation !== "count") {
    usable = past.filter(
      (event) => event.value !== null && Number.isFinite(event.value),
    );
    if (usable.length < past.length) {
      issues.push({
        code: "events_without_value_ignored",
        count: past.length - usable.length,
      });
    }
  }

  const inWindow = usable.filter((event) =>
    isWithinWindow(localDate(event.occurredAt, context.timeZone), window),
  );
  const lastEventAt = usable.reduce<Date | null>(
    (latest, event) =>
      !latest || event.occurredAt.getTime() > latest.getTime()
        ? event.occurredAt
        : latest,
    null,
  );
  return { inWindow, hasHistory: usable.length > 0, lastEventAt, issues };
}

function averageConfidence(events: readonly MetricEventInput[]): number {
  if (events.length === 0) return 1;
  const total = events.reduce(
    (sum, event) => sum + Math.min(1, Math.max(0, event.confidence ?? 1)),
    0,
  );
  return total / events.length;
}

function latestOf(dates: readonly (Date | null)[]): Date | null {
  return dates.reduce<Date | null>(
    (latest, date) =>
      date && (!latest || date.getTime() > latest.getTime()) ? date : latest,
    null,
  );
}

export type MetricScoringInputs = {
  /** Events per metric definition id. */
  eventsByMetricId: ReadonlyMap<string, readonly MetricEventInput[]>;
  /** All definitions by key, for ratio numerator/denominator lookups. */
  definitionsByKey: ReadonlyMap<string, MetricDefinitionInput>;
  context: ScoreContext;
};

/** The value to score, or why there isn't one. */
type Measurement =
  | {
      kind: "value";
      value: number;
      zeroFilled: boolean;
      /** Mean confidence of the events behind the value (0–1). */
      sourceConfidence: number;
      ratio: { numerator: number; denominator: number } | null;
      eventCount: number;
      lastEventAt: Date | null;
      issues: ScoreIssue[];
    }
  | {
      kind: "none";
      status: "missing" | "error";
      ratio: { numerator: number; denominator: number } | null;
      eventCount: number;
      lastEventAt: Date | null;
      issues: ScoreIssue[];
    };

/**
 * Scores one metric over its evaluation window.
 *
 * Missing data yields `score: null` with a reason — never zero (spec §34).
 */
export function scoreMetric(
  definition: MetricDefinitionInput,
  inputs: MetricScoringInputs,
): MetricScore {
  const { context } = inputs;
  const window = evaluationWindow(
    definition.period,
    context.asOf,
    context.timeZone,
  );
  const base = {
    metricId: definition.id,
    key: definition.key,
    name: definition.name,
    categoryId: definition.categoryId,
    direction: definition.direction,
    period: definition.period,
    aggregation: definition.aggregation,
    unit: definition.unit ?? null,
    window,
  };
  const unscored = {
    value: null,
    score: null,
    normalized: null,
    confidence: 0,
  };

  const parsed = parseMetricConfig(definition.direction, definition.config);
  if (!parsed.ok) {
    return {
      ...base,
      ...unscored,
      status: "error",
      ratio: null,
      eventCount: 0,
      lastEventAt: null,
      freshness: "error",
      issues: [{ code: "invalid_config", errors: parsed.errors }],
    };
  }

  const measurement = measure(definition, parsed.value, window, inputs);

  if (context.unavailableSources?.includes(definition.sourcePreference)) {
    return {
      ...base,
      ...unscored,
      status: "missing",
      ratio: null,
      eventCount: measurement.eventCount,
      lastEventAt: measurement.lastEventAt,
      freshness: "error",
      issues: [
        ...measurement.issues,
        { code: "source_unavailable", source: definition.sourcePreference },
      ],
    };
  }

  if (measurement.kind === "none") {
    return {
      ...base,
      ...unscored,
      status: measurement.status,
      ratio: measurement.ratio,
      eventCount: measurement.eventCount,
      lastEventAt: measurement.lastEventAt,
      freshness:
        measurement.status === "error"
          ? "error"
          : freshnessOf(measurement.lastEventAt, definition.period, context),
      issues: measurement.issues,
    };
  }

  const normalized = normalize(measurement.value, parsed.value);
  const issues = [...measurement.issues];
  if (normalized.capped === "above_max") {
    issues.push({
      code: "overperformance_capped",
      rawScore: normalized.rawScore,
    });
  } else if (normalized.capped === "below_min") {
    issues.push({
      code: "underperformance_floored",
      rawScore: normalized.rawScore,
    });
  }

  const freshness = freshnessOf(
    measurement.lastEventAt,
    definition.period,
    context,
  );
  return {
    ...base,
    status: "scored",
    value: measurement.value,
    score: normalized.score,
    normalized,
    ratio: measurement.ratio,
    eventCount: measurement.eventCount,
    lastEventAt: measurement.lastEventAt,
    freshness,
    confidence: measurement.sourceConfidence * FRESHNESS_CONFIDENCE[freshness],
    issues,
  };
}

function measure(
  definition: MetricDefinitionInput,
  parsed: ParsedMetricConfig,
  window: DateWindow,
  inputs: MetricScoringInputs,
): Measurement {
  if (
    parsed.direction === "ratio" &&
    parsed.config.numerator !== undefined &&
    parsed.config.denominator !== undefined
  ) {
    return measureRatioOfMetrics(
      parsed.config.numerator,
      parsed.config.denominator,
      parsed.config.minDenominator,
      window,
      inputs,
    );
  }

  const selection = selectEvents(
    inputs.eventsByMetricId.get(definition.id) ?? [],
    window,
    definition.aggregation,
    inputs.context,
  );
  const observed = {
    eventCount: selection.inWindow.length,
    lastEventAt: selection.lastEventAt,
  };

  if (selection.inWindow.length > 0) {
    const value = aggregate(selection.inWindow, definition.aggregation);
    if (value !== null) {
      return {
        kind: "value",
        value,
        zeroFilled: false,
        sourceConfidence: averageConfidence(selection.inWindow),
        ratio: null,
        ...observed,
        issues: selection.issues,
      };
    }
  }

  if (!selection.hasHistory) {
    return {
      kind: "none",
      status: "missing",
      ratio: null,
      ...observed,
      issues: [...selection.issues, { code: "never_recorded" }],
    };
  }

  const emptyWindow =
    parsed.config.emptyWindow ?? defaultEmptyWindow(definition.aggregation);
  if (emptyWindow === "zero") {
    return {
      kind: "value",
      value: 0,
      zeroFilled: true,
      sourceConfidence: 1,
      ratio: null,
      ...observed,
      issues: [...selection.issues, { code: "empty_window_counted_as_zero" }],
    };
  }
  return {
    kind: "none",
    status: "missing",
    ratio: null,
    ...observed,
    issues: [...selection.issues, { code: "no_data_in_window" }],
  };
}

/**
 * Ratio computed from two other metrics' aggregated values over this
 * metric's window, e.g. positive replies / prospects contacted.
 */
function measureRatioOfMetrics(
  numeratorKey: string,
  denominatorKey: string,
  minDenominator: number,
  window: DateWindow,
  { eventsByMetricId, definitionsByKey, context }: MetricScoringInputs,
): Measurement {
  const unknownKeys = [numeratorKey, denominatorKey].filter(
    (key) => !definitionsByKey.has(key),
  );
  if (unknownKeys.length > 0) {
    return {
      kind: "none",
      status: "error",
      ratio: null,
      eventCount: 0,
      lastEventAt: null,
      issues: unknownKeys.map((key) => ({
        code: "unknown_ratio_metric" as const,
        key,
      })),
    };
  }

  const [numerator, denominator] = [numeratorKey, denominatorKey].map((key) => {
    const referenced = definitionsByKey.get(key)!;
    const selection = selectEvents(
      eventsByMetricId.get(referenced.id) ?? [],
      window,
      referenced.aggregation,
      context,
    );
    return {
      selection,
      value:
        selection.inWindow.length > 0
          ? (aggregate(selection.inWindow, referenced.aggregation) ?? 0)
          : 0,
    };
  });

  const ratio = { numerator: numerator.value, denominator: denominator.value };
  const windowEvents = [
    ...numerator.selection.inWindow,
    ...denominator.selection.inWindow,
  ];
  const observed = {
    eventCount: windowEvents.length,
    lastEventAt: latestOf([
      numerator.selection.lastEventAt,
      denominator.selection.lastEventAt,
    ]),
  };
  const issues = [
    ...numerator.selection.issues,
    ...denominator.selection.issues,
  ];

  if (denominator.value < minDenominator) {
    return {
      kind: "none",
      status: "missing",
      ratio,
      ...observed,
      issues: [
        ...issues,
        {
          code: "insufficient_sample",
          denominator: denominator.value,
          minDenominator,
        },
      ],
    };
  }

  return {
    kind: "value",
    value: numerator.value / denominator.value,
    zeroFilled: false,
    sourceConfidence: averageConfidence(windowEvents),
    ratio,
    ...observed,
    issues,
  };
}
