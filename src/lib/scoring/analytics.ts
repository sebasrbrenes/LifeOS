import type { LifeScore } from "./types";
import { commitmentCompletion } from "./week-score";
import type { CommitmentInput } from "./types";

/**
 * Analytics over the two scores (spec §11, §6.2): trends, and diagnostics
 * that relate execution to outcomes. Product analytics, never a medical
 * or psychological judgement. Every rule is an explicit, tested constant.
 */

/** Changes smaller than this (points) count as flat. */
export const TREND_FLAT_DELTA = 1;
/** Closed weeks needed before diagnosing a category (spec §11). */
export const DIAGNOSTIC_MIN_WEEKS = 4;
/** Category execution from which it counts as high. */
export const DIAGNOSTIC_HIGH_EXECUTION = 80;
/** Category execution below which execution is the bottleneck. */
export const DIAGNOSTIC_LOW_EXECUTION = 50;
/** Below this outcome change (points), high execution "isn't moving it". */
export const DIAGNOSTIC_OUTCOME_THRESHOLD = 2;

export type TrendDirection = "up" | "flat" | "down";

export type ScoreTrend = {
  /** now − then; null unless both have data. */
  delta: number | null;
  direction: TrendDirection | null;
};

export function trendOf(then: number | null, now: number | null): ScoreTrend {
  if (then === null || now === null) return { delta: null, direction: null };
  const delta = now - then;
  return {
    delta,
    direction:
      Math.abs(delta) < TREND_FLAT_DELTA ? "flat" : delta > 0 ? "up" : "down",
  };
}

export type TrendRow = {
  id: string;
  name: string;
  now: number | null;
  /** Trend per window length in days, e.g. { 7: …, 30: …, 90: … }. */
  trends: Record<number, ScoreTrend>;
};

/**
 * Life Score and category trends: today's scores against the scores
 * `days` ago (each already computed with its own date's rules).
 */
export function scoreTrends(
  now: LifeScore,
  past: Readonly<Record<number, LifeScore>>,
): { life: TrendRow; categories: TrendRow[] } {
  const windows = Object.keys(past).map(Number);
  const pastCategory = (days: number, id: string) =>
    past[days].categories.find((c) => c.categoryId === id)?.score ?? null;

  return {
    life: {
      id: "life",
      name: "Life Score",
      now: now.score,
      trends: Object.fromEntries(
        windows.map((days) => [days, trendOf(past[days].score, now.score)]),
      ),
    },
    categories: now.categories.map((category) => ({
      id: category.categoryId,
      name: category.name,
      now: category.score,
      trends: Object.fromEntries(
        windows.map((days) => [
          days,
          trendOf(pastCategory(days, category.categoryId), category.score),
        ]),
      ),
    })),
  };
}

export type ClosedWeek = {
  weekStart: string;
  commitments: readonly CommitmentInput[];
};

export type DiagnosticCode =
  "high_execution_low_outcome" | "execution_bottleneck";

export type CategoryDiagnostic = {
  code: DiagnosticCode;
  categoryId: string;
  categoryName: string;
  /** Weighted completion (0–100) of the category's commitments. */
  execution: number;
  /** Category score change over the window, in points. */
  outcomeChange: number;
  weeks: number;
};

/**
 * Weighted completion (0–100) of a category's commitments across weeks;
 * null when it had none. Cancelled commitments don't count.
 */
export function categoryExecution(
  weeks: readonly ClosedWeek[],
  categoryId: string,
): number | null {
  let weighted = 0;
  let total = 0;
  for (const week of weeks) {
    for (const commitment of week.commitments) {
      if (
        commitment.categoryId !== categoryId ||
        commitment.status === "cancelled" ||
        commitment.weight <= 0
      )
        continue;
      weighted += commitmentCompletion(commitment) * commitment.weight;
      total += commitment.weight;
    }
  }
  return total > 0 ? (weighted / total) * 100 : null;
}

/**
 * Spec §11 over the last `weeks` (closed, most recent last): per category
 * with commitments, compare its execution with how its score moved from
 * `windowStart` to `windowEnd`.
 *
 * - Execution ≥ 80 and change < 2 → "high execution, low outcome change":
 *   investigate strategy, targets or measurement.
 * - Execution < 50 and change ≤ 0 → "execution bottleneck".
 *
 * Needs at least 4 closed weeks; with fewer it says nothing.
 */
export function strategyDiagnostics({
  weeks,
  windowStart,
  windowEnd,
}: {
  weeks: readonly ClosedWeek[];
  windowStart: LifeScore;
  windowEnd: LifeScore;
}): CategoryDiagnostic[] {
  if (weeks.length < DIAGNOSTIC_MIN_WEEKS) return [];
  const diagnostics: CategoryDiagnostic[] = [];
  for (const category of windowEnd.categories) {
    const execution = categoryExecution(weeks, category.categoryId);
    const before =
      windowStart.categories.find((c) => c.categoryId === category.categoryId)
        ?.score ?? null;
    if (execution === null || before === null || category.score === null)
      continue;
    const outcomeChange = category.score - before;
    const base = {
      categoryId: category.categoryId,
      categoryName: category.name,
      execution,
      outcomeChange,
      weeks: weeks.length,
    };
    if (
      execution >= DIAGNOSTIC_HIGH_EXECUTION &&
      outcomeChange < DIAGNOSTIC_OUTCOME_THRESHOLD
    ) {
      diagnostics.push({ code: "high_execution_low_outcome", ...base });
    } else if (execution < DIAGNOSTIC_LOW_EXECUTION && outcomeChange <= 0) {
      diagnostics.push({ code: "execution_bottleneck", ...base });
    }
  }
  return diagnostics;
}
