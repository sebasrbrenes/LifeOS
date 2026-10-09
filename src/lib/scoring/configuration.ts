import { z } from "zod";

import { ScoringInputError } from "./errors";
import type { CategoryInput, MetricDefinitionInput } from "./types";
import {
  METRIC_AGGREGATIONS,
  METRIC_DIRECTIONS,
  METRIC_PERIODS,
} from "./vocabulary";

/**
 * Bump when the engine's formulas change in a way that alters scores for
 * the same configuration. Stored in every score version.
 */
export const SCORE_ENGINE_VERSION = 1;

const key = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/);
const weight = z.number().min(0).max(100);

/**
 * Everything that determines a score — and nothing cosmetic (names,
 * ordering). Stored as `score_versions.configuration` so historical
 * snapshots keep the rules they were computed with (spec §21.9).
 */
export const scoreConfigurationSchema = z.strictObject({
  engineVersion: z.number().int().positive(),
  categories: z.array(z.strictObject({ key, weight, enabled: z.boolean() })),
  metrics: z.array(
    z.strictObject({
      key,
      categoryKey: key,
      direction: z.enum(METRIC_DIRECTIONS),
      period: z.enum(METRIC_PERIODS),
      aggregation: z.enum(METRIC_AGGREGATIONS),
      weight,
      enabled: z.boolean(),
      config: z.record(z.string(), z.unknown()),
    }),
  ),
});

export type ScoreConfiguration = z.infer<typeof scoreConfigurationSchema>;

/** Recursively sorts object keys so equal configs serialise identically. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([entryKey, entry]) => [entryKey, canonical(entry)]),
    );
  }
  return value;
}

export function buildScoreConfiguration(
  categories: readonly CategoryInput[],
  metrics: readonly MetricDefinitionInput[],
): ScoreConfiguration {
  const categoryKeyById = new Map(categories.map((c) => [c.id, c.key]));
  const byKey = <T extends { key: string }>(a: T, b: T) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

  return scoreConfigurationSchema.parse({
    engineVersion: SCORE_ENGINE_VERSION,
    categories: categories
      .map((c) => ({ key: c.key, weight: c.weight, enabled: c.enabled }))
      .sort(byKey),
    metrics: metrics
      .map((m) => {
        const categoryKey = categoryKeyById.get(m.categoryId);
        if (!categoryKey) {
          throw new ScoringInputError(
            `metric ${m.key} has an unknown category`,
          );
        }
        const config =
          m.config !== null &&
          typeof m.config === "object" &&
          !Array.isArray(m.config)
            ? (canonical(m.config) as Record<string, unknown>)
            : {};
        return {
          key: m.key,
          categoryKey,
          direction: m.direction,
          period: m.period,
          aggregation: m.aggregation,
          weight: m.weight,
          enabled: m.enabled,
          config,
        };
      })
      .sort(byKey),
  });
}

/** Stable serialisation, suitable for comparison and storage. */
export function serializeScoreConfiguration(
  config: ScoreConfiguration,
): string {
  return JSON.stringify(canonical(config));
}

/**
 * Whether moving from `current` to `next` changes how scores are computed,
 * which requires a new score version (spec §21.9). `current` is null when
 * no version exists yet.
 */
export function requiresNewScoreVersion(
  current: ScoreConfiguration | null,
  next: ScoreConfiguration,
): boolean {
  return (
    current === null ||
    serializeScoreConfiguration(current) !== serializeScoreConfiguration(next)
  );
}
