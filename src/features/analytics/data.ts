import "server-only";

import { cache } from "react";

import {
  addDays,
  endOfLocalDay,
  endOfWeek,
  metricGaps,
  scoreTrends,
  startOfLocalDay,
  strategyDiagnostics,
  DIAGNOSTIC_MIN_WEEKS,
  type CategoryDiagnostic,
  type MetricGap,
  type TrendRow,
} from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";

import {
  COMMITMENT_COLUMNS,
  lifeScoreAt,
  loadScoringInputs,
  loadScoringOverview,
} from "../scores/data";
import { toCommitmentInput } from "../scores/mappers";

/**
 * Trends and diagnostics compare two moments with today's configuration
 * at both ends (like weekly reviews, ADR-025/ADR-031): a weight change
 * must not look like progress. The history chart, by contrast, shows each
 * date under its own rules.
 */

export const TREND_WINDOWS = [7, 30, 90] as const;

export type Trends = { life: TrendRow; categories: TrendRow[] };

export const loadTrends = cache(async (): Promise<Trends> => {
  const inputs = await loadScoringInputs();
  const { life } = await loadScoringOverview();
  const past = Object.fromEntries(
    TREND_WINDOWS.map((days) => [
      days,
      lifeScoreAt(
        inputs,
        endOfLocalDay(addDays(inputs.today, -days), inputs.profile.timezone),
      ),
    ]),
  );
  return scoreTrends(life, past);
});

/** The off-target metric that holds the Life Score back the most. */
export const loadBottleneck = cache(async (): Promise<MetricGap | null> => {
  const { life } = await loadScoringOverview();
  return metricGaps(life)[0] ?? null;
});

export type Diagnostics = {
  diagnostics: CategoryDiagnostic[];
  closedWeeks: number;
};

/** Spec §11 over the last four closed weeks. */
export const loadDiagnostics = cache(async (): Promise<Diagnostics> => {
  const inputs = await loadScoringInputs();
  const supabase = await createClient();
  const reviews = await supabase
    .from("weekly_reviews")
    .select("week_start")
    .order("week_start", { ascending: false })
    .limit(DIAGNOSTIC_MIN_WEEKS);
  if (reviews.error)
    throw new Error(`Failed to load reviews: ${reviews.error.message}`);
  const weekStarts = reviews.data.map((r) => r.week_start).sort();
  if (weekStarts.length < DIAGNOSTIC_MIN_WEEKS)
    return { diagnostics: [], closedWeeks: weekStarts.length };

  const commitments = await supabase
    .from("weekly_commitments")
    .select(COMMITMENT_COLUMNS)
    .in("week_start", weekStarts);
  if (commitments.error)
    throw new Error(`Failed to load commitments: ${commitments.error.message}`);

  const zone = inputs.profile.timezone;
  const first = weekStarts[0];
  const last = weekStarts.at(-1)!;
  const windowEndInstant = endOfLocalDay(endOfWeek(last), zone);
  return {
    closedWeeks: weekStarts.length,
    diagnostics: strategyDiagnostics({
      weeks: weekStarts.map((weekStart) => ({
        weekStart,
        commitments: commitments.data
          .filter((c) => c.week_start === weekStart)
          .map(toCommitmentInput),
      })),
      windowStart: lifeScoreAt(
        inputs,
        new Date(startOfLocalDay(first, zone).getTime() - 1),
      ),
      windowEnd: lifeScoreAt(
        inputs,
        windowEndInstant < inputs.now ? windowEndInstant : inputs.now,
      ),
    }),
  };
});
