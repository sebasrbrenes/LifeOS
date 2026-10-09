import "server-only";

import { cache } from "react";

import { requireUser } from "@/lib/auth/session";
import {
  computeLifeScore,
  computeWeekScore,
  localDate,
  startOfWeek,
  type LifeScore,
  type MetricEventInput,
  type WeekScore,
} from "@/lib/scoring";
import type { Tables } from "@/lib/supabase/database.types";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";

import { reviewInstants } from "../week/period";

import {
  toCategoryInput,
  toCommitmentInput,
  toEventInput,
  toMetricInput,
  type CategoryRow,
  type EventRow,
  type MetricRow,
} from "./mappers";

const CATEGORY_COLUMNS = "id, key, name, weight, enabled, position";
const METRIC_COLUMNS =
  "id, key, name, description, category_id, direction, period, aggregation, weight, enabled, source_preference, source_metric, source_filter, config, unit, position";
export const COMMITMENT_COLUMNS =
  "id, title, category_id, target_value, actual_value, weight, completion_type, status, unit, position, week_start";
const EVENT_COLUMNS =
  "id, metric_definition_id, occurred_at, value_numeric, source, external_record_id, confidence";

export type Profile = Pick<
  Tables<"profiles">,
  | "display_name"
  | "timezone"
  | "week_starts_on"
  | "currency"
  | "primary_goal_id"
>;
export type Goal = Pick<
  Tables<"goals">,
  "id" | "title" | "category_id" | "target_date" | "status"
>;
export type ScoreVersion = Pick<
  Tables<"score_versions">,
  "id" | "version" | "name" | "effective_from"
>;

export type ScoringInputs = {
  userId: string;
  profile: Profile;
  categories: CategoryRow[];
  metrics: MetricRow[];
  events: MetricEventInput[];
  scoreVersion: ScoreVersion | null;
  /** The instant the request scores; captured once per request. */
  now: Date;
  today: string;
};

/**
 * The raw scoring inputs, read as the signed-in user (RLS applies).
 * Deduplicated per request; pages derive scores at any instant from it.
 */
export const loadScoringInputs = cache(async (): Promise<ScoringInputs> => {
  const user = await requireUser();
  const supabase = await createClient();

  const [profileResult, categoriesResult, metricsResult, versionResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "display_name, timezone, week_starts_on, currency, primary_goal_id",
        )
        .single(),
      supabase
        .from("score_categories")
        .select(CATEGORY_COLUMNS)
        .order("position"),
      supabase
        .from("metric_definitions")
        .select(METRIC_COLUMNS)
        .order("position")
        .order("created_at"),
      supabase
        .from("score_versions")
        .select("id, version, name, effective_from")
        .is("effective_to", null)
        .maybeSingle(),
    ]);
  for (const result of [
    profileResult,
    categoriesResult,
    metricsResult,
    versionResult,
  ]) {
    if (result.error)
      throw new Error(`Failed to load scoring data: ${result.error.message}`);
  }
  const profile = profileResult.data!;

  const events = await fetchAllRows<EventRow>((from, to) =>
    supabase
      .from("metric_events")
      .select(EVENT_COLUMNS)
      .order("id")
      .range(from, to),
  );

  const now = new Date();
  return {
    userId: user.id,
    profile,
    categories: categoriesResult.data ?? [],
    metrics: metricsResult.data ?? [],
    events: events.map(toEventInput),
    scoreVersion: versionResult.data,
    now,
    today: localDate(now, profile.timezone),
  };
});

/** The Life Score as of `asOf`, with the configuration in force now. */
export function lifeScoreAt(inputs: ScoringInputs, asOf: Date): LifeScore {
  return computeLifeScore({
    categories: inputs.categories.map(toCategoryInput),
    metrics: inputs.metrics.map(toMetricInput),
    events: inputs.events,
    context: { asOf, timeZone: inputs.profile.timezone },
  });
}

export type ScoringOverview = {
  userId: string;
  profile: Profile;
  categories: CategoryRow[];
  metrics: MetricRow[];
  life: LifeScore;
  /** Life Score as the current week started (same configuration). */
  lifeAtWeekStart: number | null;
  week: WeekScore;
  weekStart: string;
  today: string;
  primaryGoal: Goal | null;
  scoreVersion: ScoreVersion | null;
};

/**
 * Everything the dashboard, score and metrics pages need, scored by the
 * engine. Deduplicated per request.
 */
export const loadScoringOverview = cache(async (): Promise<ScoringOverview> => {
  const inputs = await loadScoringInputs();
  const { profile, today } = inputs;
  const supabase = await createClient();
  const weekStart = startOfWeek(today, profile.week_starts_on);

  const [commitmentsResult, goalResult] = await Promise.all([
    supabase
      .from("weekly_commitments")
      .select(COMMITMENT_COLUMNS)
      .eq("week_start", weekStart)
      .order("position")
      .order("created_at"),
    profile.primary_goal_id
      ? supabase
          .from("goals")
          .select("id, title, category_id, target_date, status")
          .eq("id", profile.primary_goal_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (commitmentsResult.error) throw new Error(commitmentsResult.error.message);
  if (goalResult.error) throw new Error(goalResult.error.message);

  const life = lifeScoreAt(inputs, inputs.now);
  const lifeAtWeekStart = lifeScoreAt(
    inputs,
    reviewInstants(weekStart, profile.timezone, inputs.now).start,
  ).score;
  const week = computeWeekScore(
    (commitmentsResult.data ?? []).map(toCommitmentInput),
  );

  return {
    userId: inputs.userId,
    profile,
    categories: inputs.categories,
    metrics: inputs.metrics,
    life,
    lifeAtWeekStart,
    week,
    weekStart,
    today,
    primaryGoal: goalResult.data,
    scoreVersion: inputs.scoreVersion,
  };
});
