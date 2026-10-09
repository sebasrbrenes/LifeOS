import { z } from "zod";

import type { MetricDirection } from "./vocabulary";

/**
 * Schemas for `metric_definitions.config`, one per direction. Configs are
 * validated by the engine at scoring time: a bad config marks that metric
 * as an error instead of breaking the whole score.
 */

const finite = z.number().refine(Number.isFinite, "must be a finite number");
const score = finite.min(0).max(100);

/**
 * What an empty evaluation window means. `zero`: nothing happened (e.g. no
 * runs this week). `missing`: no information. Defaults by aggregation, see
 * defaultEmptyWindow().
 */
const emptyWindow = z.enum(["zero", "missing"]).optional();

const common = { emptyWindow };

export const higherIsBetterConfig = z
  .strictObject({
    ...common,
    target: finite,
    /** Value that scores 0. Default 0 (spec §9.1: score = value / target). */
    baseline: finite.default(0),
  })
  .refine((c) => c.target > c.baseline, {
    error: "target must be greater than baseline",
    path: ["target"],
  });

export const lowerIsBetterConfig = z
  .strictObject({
    ...common,
    target: finite,
    /**
     * Value that scores 0. When set, scoring is linear between `worst` and
     * `target`. Without it, spec §9.2 applies (target / value), which needs
     * a positive target.
     */
    worst: finite.optional(),
  })
  .refine((c) => (c.worst === undefined ? c.target > 0 : c.worst > c.target), {
    error: "target must be positive, or worst must be greater than target",
    path: ["target"],
  });

export const targetRangeConfig = z
  .strictObject({
    ...common,
    targetMin: finite,
    targetMax: finite,
    /**
     * Distance outside the range at which the score reaches 0. Defaults to
     * the range width; required when the range is a single value.
     */
    tolerance: finite.positive().optional(),
    toleranceBelow: finite.positive().optional(),
    toleranceAbove: finite.positive().optional(),
  })
  .refine((c) => c.targetMax >= c.targetMin, {
    error: "targetMax must be at least targetMin",
    path: ["targetMax"],
  })
  .refine(
    (c) =>
      c.targetMax !== c.targetMin ||
      c.tolerance !== undefined ||
      (c.toleranceBelow !== undefined && c.toleranceAbove !== undefined),
    {
      error: "a single-value range needs an explicit tolerance",
      path: ["tolerance"],
    },
  );

export const booleanConfig = z.strictObject({ ...common });

const strictlyIncreasing = (values: number[]) =>
  values.every((value, index) => index === 0 || value > values[index - 1]);

export const milestoneConfig = z
  .strictObject({
    ...common,
    /** Step function: the value reaches the highest milestone ≤ value. */
    milestones: z
      .array(
        z.strictObject({
          value: finite,
          score,
          label: z.string().trim().min(1).max(120),
        }),
      )
      .min(1),
  })
  .refine((c) => strictlyIncreasing(c.milestones.map((m) => m.value)), {
    error: "milestone values must be strictly increasing",
    path: ["milestones"],
  });

const metricKey = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/);

export const ratioConfig = z
  .strictObject({
    ...common,
    /** Target ratio (e.g. 0.1 for a 10 % positive reply rate). */
    target: finite.positive(),
    /**
     * Optional: compute the ratio from two other metrics' aggregated values
     * over the same window instead of this metric's own events.
     */
    numerator: metricKey.optional(),
    denominator: metricKey.optional(),
    /** Below this denominator the sample is too small to score. */
    minDenominator: finite.positive().default(1),
  })
  .refine(
    (c) => (c.numerator === undefined) === (c.denominator === undefined),
    {
      error: "numerator and denominator must be set together",
      path: ["numerator"],
    },
  );

export const customConfig = z
  .strictObject({
    ...common,
    /** Piecewise-linear curve; flat beyond the first and last points. */
    points: z.array(z.strictObject({ value: finite, score })).min(2),
  })
  .refine((c) => strictlyIncreasing(c.points.map((p) => p.value)), {
    error: "point values must be strictly increasing",
    path: ["points"],
  });

export const METRIC_CONFIG_SCHEMAS = {
  higher_is_better: higherIsBetterConfig,
  lower_is_better: lowerIsBetterConfig,
  target_range: targetRangeConfig,
  boolean: booleanConfig,
  milestone: milestoneConfig,
  ratio: ratioConfig,
  custom: customConfig,
} satisfies Record<MetricDirection, z.ZodType>;

export type MetricConfigByDirection = {
  [D in MetricDirection]: z.output<(typeof METRIC_CONFIG_SCHEMAS)[D]>;
};

export type ParsedMetricConfig = {
  [D in MetricDirection]: { direction: D; config: MetricConfigByDirection[D] };
}[MetricDirection];

export type ConfigParseResult =
  { ok: true; value: ParsedMetricConfig } | { ok: false; errors: string[] };

export function parseMetricConfig(
  direction: MetricDirection,
  config: unknown,
): ConfigParseResult {
  const result = METRIC_CONFIG_SCHEMAS[direction].safeParse(config ?? {});
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "config"}: ${issue.message}`,
      ),
    };
  }
  return {
    ok: true,
    value: { direction, config: result.data } as ParsedMetricConfig,
  };
}
