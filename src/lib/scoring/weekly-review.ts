import { categoryExtremes } from "./life-score";
import type { CategoryScore, LifeScore, WeekScore } from "./types";

/**
 * Weekly review (spec §7.3): what changed in the user's state over the
 * week, how well they executed, and where to focus next. Every item is a
 * deterministic rule over the two Life Scores and the Week Score, so the
 * review can explain itself. The scores are reported side by side and
 * never merged into one number.
 */

export const WEEKLY_REVIEW_SUMMARY_VERSION = 1;
/** Week Score from which execution counts as high (spec §11). */
export const HIGH_EXECUTION_SCORE = 80;
/** Week Score below which execution is the bottleneck (spec §11). */
export const LOW_EXECUTION_SCORE = 50;
/** A metric moving less than this (points) in a week counts as stagnant. */
export const STAGNANT_DELTA = 1;
const LIST_LIMIT = 5;

export type CategoryChange = {
  categoryId: string;
  key: string;
  name: string;
  start: number | null;
  end: number | null;
  /** end − start; null unless both have data. */
  delta: number | null;
};

export type MetricChange = {
  metricId: string;
  key: string;
  name: string;
  categoryId: string;
  categoryName: string;
  start: number | null;
  end: number | null;
  delta: number | null;
};

export type MetricGap = {
  metricId: string;
  key: string;
  name: string;
  categoryName: string;
  score: number;
  /** Life Score points gained if this metric reached its target. */
  potentialGain: number;
};

export type WeeklyFocus =
  | { kind: "plan_commitments" }
  | { kind: "execution"; weekScore: number }
  | { kind: "metric"; gap: MetricGap }
  | { kind: "collect_data" };

export type WeeklyReviewSummary = {
  summaryVersion: typeof WEEKLY_REVIEW_SUMMARY_VERSION;
  lifeScore: { start: number | null; end: number | null; delta: number | null };
  weekScore: number | null;
  execution: { completed: number; total: number; rate: number | null };
  categories: CategoryChange[];
  biggestGain: CategoryChange | null;
  biggestDecline: CategoryChange | null;
  strongest: CategoryChange | null;
  weakest: CategoryChange | null;
  /** Scored metrics below target, largest potential gain first. */
  offTarget: MetricGap[];
  improvingFastest: MetricChange[];
  /** Only when execution was high: metrics in the categories worked on that barely moved. */
  stagnantDespiteExecution: MetricChange[];
  /** The off-target metric that holds the Life Score back the most. */
  bottleneck: MetricGap | null;
  focus: WeeklyFocus | null;
};

export type WeeklyReviewInputs = {
  /** Life Score as the week started (end of the previous day). */
  lifeStart: LifeScore;
  /** Life Score as the week ended (or now, if closing on its last day). */
  lifeEnd: LifeScore;
  week: WeekScore;
};

/** Two decimals: what the database stores and the UI can explain. */
function round(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : round(value);
}

function deltaOf(start: number | null, end: number | null): number | null {
  return start === null || end === null ? null : round(end - start);
}

function categoryChanges(start: LifeScore, end: LifeScore): CategoryChange[] {
  const before = new Map(start.categories.map((c) => [c.categoryId, c]));
  return end.categories.map((category) => {
    const startScore = before.get(category.categoryId)?.score ?? null;
    return {
      categoryId: category.categoryId,
      key: category.key,
      name: category.name,
      start: roundOrNull(startScore),
      end: roundOrNull(category.score),
      delta: deltaOf(startScore, category.score),
    };
  });
}

function metricChanges(start: LifeScore, end: LifeScore): MetricChange[] {
  const before = new Map(
    start.categories.flatMap((c) => c.metrics.map((m) => [m.metricId, m])),
  );
  return end.categories.flatMap((category) =>
    category.metrics.map((metric) => {
      const startScore = before.get(metric.metricId)?.score ?? null;
      return {
        metricId: metric.metricId,
        key: metric.key,
        name: metric.name,
        categoryId: category.categoryId,
        categoryName: category.name,
        start: roundOrNull(startScore),
        end: roundOrNull(metric.score),
        delta: deltaOf(startScore, metric.score),
      };
    }),
  );
}

/**
 * Scored metrics below target, largest potential Life Score gain first:
 * `(100 − score) × metric effective share × category effective share`.
 */
export function metricGaps(life: LifeScore): MetricGap[] {
  return life.categories
    .flatMap((category) =>
      category.metrics.flatMap((metric) =>
        metric.score !== null && metric.score < 100
          ? [
              {
                metricId: metric.metricId,
                key: metric.key,
                name: metric.name,
                categoryName: category.name,
                score: round(metric.score),
                potentialGain: round(
                  (100 - metric.score) *
                    metric.effectiveWeight *
                    category.effectiveWeight,
                ),
              },
            ]
          : [],
      ),
    )
    .sort((a, b) => b.potentialGain - a.potentialGain || a.score - b.score);
}

function changeOf(
  changes: CategoryChange[],
  category: CategoryScore | null,
): CategoryChange | null {
  if (!category) return null;
  return changes.find((c) => c.categoryId === category.categoryId) ?? null;
}

export function buildWeeklyReview({
  lifeStart,
  lifeEnd,
  week,
}: WeeklyReviewInputs): WeeklyReviewSummary {
  const categories = categoryChanges(lifeStart, lifeEnd);
  const withDelta = categories.filter(
    (c): c is CategoryChange & { delta: number } => c.delta !== null,
  );
  const biggestGain =
    withDelta.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta)[0] ??
    null;
  const biggestDecline =
    withDelta.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta)[0] ??
    null;

  const { strongest, weakest } = categoryExtremes(lifeEnd);
  const metrics = metricChanges(lifeStart, lifeEnd);
  const improvingFastest = metrics
    .filter((m) => m.delta !== null && m.delta > 0)
    .sort((a, b) => b.delta! - a.delta!)
    .slice(0, LIST_LIMIT);

  const weekScore = roundOrNull(week.score);
  const workedOn = new Set(
    week.commitments
      .filter((c) => c.status !== "cancelled" && c.categoryId)
      .map((c) => c.categoryId),
  );
  const stagnantDespiteExecution =
    weekScore !== null && weekScore >= HIGH_EXECUTION_SCORE
      ? metrics.filter(
          (m) =>
            workedOn.has(m.categoryId) &&
            m.delta !== null &&
            Math.abs(m.delta) < STAGNANT_DELTA &&
            m.end !== null &&
            m.end < 100,
        )
      : [];

  const gaps = metricGaps(lifeEnd);
  const bottleneck = gaps[0] ?? null;

  let focus: WeeklyFocus | null = null;
  if (week.totalCount === 0) focus = { kind: "plan_commitments" };
  else if (weekScore !== null && weekScore < LOW_EXECUTION_SCORE)
    focus = { kind: "execution", weekScore };
  else if (bottleneck) focus = { kind: "metric", gap: bottleneck };
  else if (lifeEnd.score === null) focus = { kind: "collect_data" };

  return {
    summaryVersion: WEEKLY_REVIEW_SUMMARY_VERSION,
    lifeScore: {
      start: roundOrNull(lifeStart.score),
      end: roundOrNull(lifeEnd.score),
      delta: deltaOf(lifeStart.score, lifeEnd.score),
    },
    weekScore,
    execution: {
      completed: week.completedCount,
      total: week.totalCount,
      rate: week.executionRate,
    },
    categories,
    biggestGain,
    biggestDecline,
    strongest: changeOf(categories, strongest),
    weakest: changeOf(categories, weakest),
    offTarget: gaps.slice(0, LIST_LIMIT),
    improvingFastest,
    stagnantDespiteExecution: stagnantDespiteExecution.slice(0, LIST_LIMIT),
    bottleneck,
    focus,
  };
}
