import { ScoringInputError } from "./errors";
import { scoreMetric } from "./metric-score";
import { MAX_SCORE, MIN_SCORE } from "./normalize";
import { rankFor } from "./rank";
import { isValidTimeZone } from "./time";
import type {
  CategoryInput,
  CategoryScore,
  LifeScore,
  MetricDefinitionInput,
  MetricEventInput,
  MetricScore,
  ScoreContext,
  ScoreIssue,
  WeightedMetric,
} from "./types";

/**
 * A metric holding more than this share of its category's weight is
 * flagged (spec §9.5: don't let one metric dominate a category by
 * accident). Not an error — just surfaced in the explanation.
 */
export const DOMINANT_METRIC_SHARE = 0.5;

function assertUnique<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  what: string,
) {
  const seen = new Set<string>();
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) throw new ScoringInputError(`duplicate ${what}: ${key}`);
    seen.add(key);
  }
}

function assertWeight(weight: number, what: string) {
  if (!Number.isFinite(weight) || weight < 0) {
    throw new ScoringInputError(`invalid weight for ${what}: ${weight}`);
  }
}

function clamp(score: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, score));
}

/**
 * Weighted mean over the items that have a score. Items without one are
 * re-weighted out (spec §34) and reported through `completeness`.
 */
function weightedScore<
  T extends { weight: number; score: number | null; confidence: number },
>(items: readonly T[]) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const scoredWeight = items.reduce(
    (sum, item) => sum + (item.score === null ? 0 : item.weight),
    0,
  );
  const shares = items.map((item) => {
    const weightShare = totalWeight > 0 ? item.weight / totalWeight : 0;
    const effectiveWeight =
      item.score !== null && scoredWeight > 0 ? item.weight / scoredWeight : 0;
    return {
      weightShare,
      effectiveWeight,
      contribution: item.score === null ? 0 : item.score * effectiveWeight,
    };
  });
  return {
    score:
      scoredWeight > 0
        ? clamp(shares.reduce((sum, share) => sum + share.contribution, 0))
        : null,
    completeness: totalWeight > 0 ? scoredWeight / totalWeight : 0,
    confidence:
      totalWeight > 0
        ? items.reduce(
            (sum, item, index) =>
              sum + item.confidence * shares[index].weightShare,
            0,
          )
        : 0,
    hasWeight: totalWeight > 0,
    shares,
  };
}

function scoreCategory(
  category: CategoryInput,
  metricScores: readonly (MetricScore & { weight: number })[],
): Omit<CategoryScore, "effectiveWeight" | "weightShare" | "lifeContribution"> {
  const aggregate = weightedScore(metricScores);
  const issues: ScoreIssue[] = [];
  // An empty category simply has nothing to score; only flag weights that
  // exist but are all zero.
  if (metricScores.length > 0 && !aggregate.hasWeight) {
    issues.push({ code: "no_weighted_items" });
  }

  const metrics: WeightedMetric[] = metricScores.map((metric, index) => {
    const { weightShare, effectiveWeight, contribution } =
      aggregate.shares[index];
    if (metricScores.length > 1 && weightShare > DOMINANT_METRIC_SHARE) {
      issues.push({
        code: "dominant_metric",
        metricKey: metric.key,
        share: weightShare,
      });
    }
    return {
      ...metric,
      weightShare,
      effectiveWeight,
      categoryContribution: contribution,
      lifeContribution: 0, // filled in once category weights are known
    };
  });

  return {
    categoryId: category.id,
    key: category.key,
    name: category.name,
    weight: category.weight,
    score: aggregate.score,
    rank: rankFor(aggregate.score),
    completeness: aggregate.completeness,
    confidence: aggregate.confidence,
    metrics,
    issues,
  };
}

export type LifeScoreInputs = {
  categories: readonly CategoryInput[];
  metrics: readonly MetricDefinitionInput[];
  events: readonly MetricEventInput[];
  context: ScoreContext;
};

/**
 * Metric scores → category scores → Life Score (spec FR-008):
 *
 *   Category Score = Σ(metric_score × metric_weight)
 *   Life Score     = Σ(category_score × category_weight)
 *
 * with weights normalised among the items that have data. Every level
 * reports completeness and confidence separately from the score, and every
 * metric carries its exact contribution to its category and to the Life
 * Score, so the numbers always add up.
 */
export function computeLifeScore({
  categories,
  metrics,
  events,
  context,
}: LifeScoreInputs): LifeScore {
  if (!isValidTimeZone(context.timeZone)) {
    throw new ScoringInputError(`invalid timezone: ${context.timeZone}`);
  }
  assertUnique(categories, (c) => c.id, "category id");
  assertUnique(categories, (c) => c.key, "category key");
  assertUnique(metrics, (m) => m.id, "metric id");
  assertUnique(metrics, (m) => m.key, "metric key");
  categories.forEach((c) => assertWeight(c.weight, `category ${c.key}`));
  metrics.forEach((m) => assertWeight(m.weight, `metric ${m.key}`));

  const issues: ScoreIssue[] = [];
  const eventsByMetricId = new Map<string, MetricEventInput[]>();
  for (const item of events) {
    const list = eventsByMetricId.get(item.metricDefinitionId);
    if (list) list.push(item);
    else eventsByMetricId.set(item.metricDefinitionId, [item]);
  }
  // Disabled metrics stay resolvable as ratio inputs.
  const definitionsByKey = new Map(metrics.map((m) => [m.key, m]));

  const categoryIds = new Set(categories.map((c) => c.id));
  const orphans = metrics.filter(
    (m) => m.enabled && !categoryIds.has(m.categoryId),
  );
  if (orphans.length > 0) {
    issues.push({
      code: "metrics_without_category",
      metricKeys: orphans.map((m) => m.key),
    });
  }

  const enabledCategories = categories.filter((c) => c.enabled);
  const categoryScores = enabledCategories.map((category) => {
    const metricScores = metrics
      .filter((m) => m.enabled && m.categoryId === category.id)
      .map((definition) => ({
        ...scoreMetric(definition, {
          eventsByMetricId,
          definitionsByKey,
          context,
        }),
        weight: definition.weight,
      }));
    return scoreCategory(category, metricScores);
  });

  const life = weightedScore(categoryScores);
  if (categoryScores.length > 0 && !life.hasWeight) {
    issues.push({ code: "no_weighted_items" });
  }

  const scoredCategories: CategoryScore[] = categoryScores.map(
    (category, index) => {
      const { weightShare, effectiveWeight, contribution } = life.shares[index];
      return {
        ...category,
        weightShare,
        effectiveWeight,
        lifeContribution: contribution,
        metrics: category.metrics.map((metric) => ({
          ...metric,
          lifeContribution: metric.categoryContribution * effectiveWeight,
        })),
      };
    },
  );

  return {
    score: life.score,
    rank: rankFor(life.score),
    completeness: scoredCategories.reduce(
      (sum, category) => sum + category.completeness * category.weightShare,
      0,
    ),
    confidence: life.confidence,
    categories: scoredCategories,
    issues,
    asOf: context.asOf,
    timeZone: context.timeZone,
  };
}

/**
 * Strongest and weakest categories among those with a score. Ties go to
 * the category with more weight (more impact on the Life Score).
 */
export function categoryExtremes(life: LifeScore): {
  strongest: CategoryScore | null;
  weakest: CategoryScore | null;
} {
  const scored = life.categories.filter(
    (category): category is CategoryScore & { score: number } =>
      category.score !== null,
  );
  if (scored.length === 0) return { strongest: null, weakest: null };
  const byImpact = (a: CategoryScore, b: CategoryScore) =>
    b.weightShare - a.weightShare;
  const strongest = [...scored].sort(
    (a, b) => b.score - a.score || byImpact(a, b),
  )[0];
  const weakest = [...scored].sort(
    (a, b) => a.score - b.score || byImpact(a, b),
  )[0];
  return { strongest, weakest };
}
