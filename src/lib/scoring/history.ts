import {
  SCORE_ENGINE_VERSION,
  scoreConfigurationSchema,
  type ScoreConfiguration,
} from "./configuration";
import { computeLifeScore } from "./life-score";
import { addDays, daysBetween, endOfLocalDay, type LocalDate } from "./time";
import type {
  CategoryInput,
  LifeScore,
  MetricDefinitionInput,
  MetricEventInput,
} from "./types";

/**
 * Score history by replaying the event log (spec §28). The events are
 * never destroyed, and each score version stores the configuration in
 * force for its period, so the score of any past date is recomputed with
 * the rules of that date — never silently with today's (spec §21.10).
 */

export type StoredScoreVersion = {
  id: string;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  /** Raw `score_versions.configuration`; validated here. */
  configuration: unknown;
};

/**
 * The version in force at `instant`. Before the first version (values
 * backdated to before the user configured scoring) the first one applies:
 * those are the earliest rules the user defined.
 */
export function versionAt(
  versions: readonly StoredScoreVersion[],
  instant: Date,
): StoredScoreVersion | null {
  if (versions.length === 0) return null;
  const sorted = [...versions].sort(
    (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime(),
  );
  const covering = sorted.find(
    (v) =>
      v.effectiveFrom <= instant &&
      (v.effectiveTo === null || instant < v.effectiveTo),
  );
  return covering ?? (instant < sorted[0].effectiveFrom ? sorted[0] : null);
}

export type ConfiguredInputs = {
  categories: CategoryInput[];
  metrics: MetricDefinitionInput[];
};

type StoredMetric = ScoreConfiguration["metrics"][number];

/**
 * Today's categories and metrics with a stored configuration applied:
 * weights, enabled flags, directions and targets come from the version;
 * ids, names and units (cosmetic) from today. Categories the version
 * didn't have count as disabled.
 *
 * A metric the version didn't have yet (created later, with values dated
 * earlier) uses `laterMetrics` — its first recorded configuration — so
 * backdated values show up in history. Without one it is left out.
 */
export function applyConfiguration(
  configuration: ScoreConfiguration,
  categories: readonly CategoryInput[],
  metrics: readonly MetricDefinitionInput[],
  laterMetrics: ReadonlyMap<string, StoredMetric> = new Map(),
): ConfiguredInputs {
  const categoryConfig = new Map(
    configuration.categories.map((c) => [c.key, c]),
  );
  const categoryIdByKey = new Map(categories.map((c) => [c.key, c.id]));
  const metricByKey = new Map(metrics.map((m) => [m.key, m]));

  return {
    categories: categories.map((category) => {
      const stored = categoryConfig.get(category.key);
      return stored
        ? { ...category, weight: stored.weight, enabled: stored.enabled }
        : { ...category, weight: 0, enabled: false };
    }),
    metrics: [
      ...configuration.metrics,
      ...[...laterMetrics.values()].filter(
        (later) => !configuration.metrics.some((m) => m.key === later.key),
      ),
    ].flatMap((stored) => {
      const current = metricByKey.get(stored.key);
      const categoryId = categoryIdByKey.get(stored.categoryKey);
      if (!current || !categoryId) return [];
      return [
        {
          ...current,
          categoryId,
          direction: stored.direction,
          period: stored.period,
          aggregation: stored.aggregation,
          weight: stored.weight,
          enabled: stored.enabled,
          config: stored.config,
        },
      ];
    }),
  };
}

export type ScoreBasis = "historical" | "current";

export type HistoricalLifeScore = {
  life: LifeScore;
  /** Version whose rules produced this score (null: none recorded). */
  versionId: string | null;
  /**
   * "current" when the stored rules couldn't be replayed (unreadable or
   * from an older engine) and today's rules were used instead — the UI
   * must say so.
   */
  basis: ScoreBasis;
};

export type HistoryInputs = {
  categories: readonly CategoryInput[];
  metrics: readonly MetricDefinitionInput[];
  events: readonly MetricEventInput[];
  versions: readonly StoredScoreVersion[];
  timeZone: string;
};

const parsedConfigurations = new WeakMap<
  StoredScoreVersion,
  ScoreConfiguration | null
>();

/** A version's configuration, if this engine can replay it. Memoised. */
function replayableConfiguration(
  version: StoredScoreVersion,
): ScoreConfiguration | null {
  if (!parsedConfigurations.has(version)) {
    const parsed = scoreConfigurationSchema.safeParse(version.configuration);
    parsedConfigurations.set(
      version,
      parsed.success && parsed.data.engineVersion === SCORE_ENGINE_VERSION
        ? parsed.data
        : null,
    );
  }
  return parsedConfigurations.get(version) ?? null;
}

/**
 * For each metric key, its configuration in the first version after
 * `instant` that has it. Today's definition stands in for metrics no
 * version recorded.
 */
function laterMetricConfigurations(
  inputs: HistoryInputs,
  instant: Date,
): Map<string, StoredMetric> {
  const categoryKeyById = new Map(inputs.categories.map((c) => [c.id, c.key]));
  const later = new Map<string, StoredMetric>();
  const sorted = [...inputs.versions]
    .filter((v) => v.effectiveFrom > instant)
    .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  for (const version of sorted) {
    for (const metric of replayableConfiguration(version)?.metrics ?? []) {
      if (!later.has(metric.key)) later.set(metric.key, metric);
    }
  }
  for (const metric of inputs.metrics) {
    const categoryKey = categoryKeyById.get(metric.categoryId);
    if (later.has(metric.key) || !categoryKey) continue;
    later.set(metric.key, {
      key: metric.key,
      categoryKey,
      direction: metric.direction,
      period: metric.period,
      aggregation: metric.aggregation,
      weight: metric.weight,
      enabled: metric.enabled,
      config:
        metric.config !== null &&
        typeof metric.config === "object" &&
        !Array.isArray(metric.config)
          ? (metric.config as Record<string, unknown>)
          : {},
    });
  }
  return later;
}

/** The Life Score at `instant`, under the rules in force at that instant. */
export function lifeScoreAsOf(
  inputs: HistoryInputs,
  instant: Date,
): HistoricalLifeScore {
  const version = versionAt(inputs.versions, instant);
  const configuration = version ? replayableConfiguration(version) : null;
  const replayable = configuration !== null;
  const configured = configuration
    ? applyConfiguration(
        configuration,
        inputs.categories,
        inputs.metrics,
        laterMetricConfigurations(inputs, instant),
      )
    : { categories: [...inputs.categories], metrics: [...inputs.metrics] };

  return {
    life: computeLifeScore({
      categories: configured.categories,
      metrics: configured.metrics,
      events: inputs.events,
      context: { asOf: instant, timeZone: inputs.timeZone },
    }),
    versionId: version?.id ?? null,
    basis: replayable ? "historical" : "current",
  };
}

/** The instant a local date is scored at: its end, or now for today. */
export function instantForDate(
  date: LocalDate,
  timeZone: string,
  now: Date,
  today: LocalDate,
): Date {
  return date >= today ? now : endOfLocalDay(date, timeZone);
}

/**
 * Up to `maxPoints` dates from `from` to `to` (inclusive), evenly spaced
 * and always ending on `to`.
 */
export function sampleDates(
  from: LocalDate,
  to: LocalDate,
  maxPoints: number,
): LocalDate[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  const step = Math.max(1, Math.ceil(span / Math.max(1, maxPoints - 1)));
  const dates: LocalDate[] = [];
  for (let offset = span; offset >= 0; offset -= step)
    dates.unshift(addDays(from, offset));
  return dates;
}

export type HistoryPoint = {
  date: LocalDate;
  lifeScore: number | null;
  /** Category id → score (null = no data). */
  categories: Record<string, number | null>;
  versionId: string | null;
  basis: ScoreBasis;
};

export function lifeScoreHistory(
  inputs: HistoryInputs,
  dates: readonly LocalDate[],
  now: Date,
  today: LocalDate,
): HistoryPoint[] {
  return dates.map((date) => {
    const { life, versionId, basis } = lifeScoreAsOf(
      inputs,
      instantForDate(date, inputs.timeZone, now, today),
    );
    return {
      date,
      lifeScore: life.score,
      categories: Object.fromEntries(
        life.categories.map((c) => [c.categoryId, c.score]),
      ),
      versionId,
      basis,
    };
  });
}

export type ScoreComparisonRow = {
  id: string;
  name: string;
  before: number | null;
  after: number | null;
  delta: number | null;
};

export type MetricComparisonRow = ScoreComparisonRow & {
  categoryName: string;
  unit: string | null;
  valueBefore: number | null;
  valueAfter: number | null;
};

export type ScoreComparison = {
  life: ScoreComparisonRow;
  categories: ScoreComparisonRow[];
  metrics: MetricComparisonRow[];
};

const deltaOf = (before: number | null, after: number | null) =>
  before === null || after === null ? null : after - before;

/** "You vs You" (spec §28): two dates side by side, scores and raw values. */
export function compareLifeScores(
  before: LifeScore,
  after: LifeScore,
): ScoreComparison {
  const beforeCategories = new Map(
    before.categories.map((c) => [c.categoryId, c]),
  );
  const beforeMetrics = new Map(
    before.categories.flatMap((c) => c.metrics.map((m) => [m.metricId, m])),
  );
  const categoryIds = new Set([
    ...after.categories.map((c) => c.categoryId),
    ...before.categories.map((c) => c.categoryId),
  ]);
  const allCategories = [...categoryIds].map(
    (id) =>
      after.categories.find((c) => c.categoryId === id) ??
      beforeCategories.get(id)!,
  );

  const metricRows = new Map<string, MetricComparisonRow>();
  for (const category of allCategories) {
    const afterCategory = after.categories.find(
      (c) => c.categoryId === category.categoryId,
    );
    const beforeCategory = beforeCategories.get(category.categoryId);
    const metrics = new Map(
      [
        ...(beforeCategory?.metrics ?? []),
        ...(afterCategory?.metrics ?? []),
      ].map((m) => [m.metricId, m]),
    );
    for (const metric of metrics.values()) {
      const old = beforeMetrics.get(metric.metricId) ?? null;
      const now =
        afterCategory?.metrics.find((m) => m.metricId === metric.metricId) ??
        null;
      metricRows.set(metric.metricId, {
        id: metric.metricId,
        name: metric.name,
        categoryName: category.name,
        unit: metric.unit,
        before: old?.score ?? null,
        after: now?.score ?? null,
        delta: deltaOf(old?.score ?? null, now?.score ?? null),
        valueBefore: old?.value ?? null,
        valueAfter: now?.value ?? null,
      });
    }
  }

  return {
    life: {
      id: "life",
      name: "Life Score",
      before: before.score,
      after: after.score,
      delta: deltaOf(before.score, after.score),
    },
    categories: allCategories.map((category) => {
      const old = beforeCategories.get(category.categoryId)?.score ?? null;
      const now =
        after.categories.find((c) => c.categoryId === category.categoryId)
          ?.score ?? null;
      return {
        id: category.categoryId,
        name: category.name,
        before: old,
        after: now,
        delta: deltaOf(old, now),
      };
    }),
    metrics: [...metricRows.values()],
  };
}
