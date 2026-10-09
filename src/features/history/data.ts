import "server-only";

import { cache } from "react";

import {
  addDays,
  compareLifeScores,
  instantForDate,
  lifeScoreAsOf,
  lifeScoreHistory,
  localDate,
  sampleDates,
  type HistoryInputs,
  type HistoryPoint,
  type LocalDate,
  type ScoreBasis,
  type ScoreComparison,
  type StoredScoreVersion,
} from "@/lib/scoring";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";

import { loadScoringInputs, type ScoringInputs } from "../scores/data";
import { toCategoryInput, toMetricInput } from "../scores/mappers";
import { MAX_CHART_POINTS, parseComparison, type HistoryRange } from "./range";

type VersionRow = {
  id: string;
  version: number;
  effective_from: string;
  effective_to: string | null;
  configuration: unknown;
};

/** Every score version of the user: the rules history is replayed with. */
const loadVersions = cache(async (): Promise<StoredScoreVersion[]> => {
  const supabase = await createClient();
  const rows = await fetchAllRows<VersionRow>((from, to) =>
    supabase
      .from("score_versions")
      .select("id, version, effective_from, effective_to, configuration")
      .order("version")
      .range(from, to),
  );
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    effectiveFrom: new Date(row.effective_from),
    effectiveTo: row.effective_to ? new Date(row.effective_to) : null,
    configuration: row.configuration,
  }));
});

async function historyInputs(inputs: ScoringInputs): Promise<HistoryInputs> {
  return {
    categories: inputs.categories.map(toCategoryInput),
    metrics: inputs.metrics.map(toMetricInput),
    events: inputs.events,
    versions: await loadVersions(),
    timeZone: inputs.profile.timezone,
  };
}

export type HistoryView = {
  range: HistoryRange;
  from: LocalDate;
  today: LocalDate;
  points: HistoryPoint[];
  categories: { id: string; key: string; name: string }[];
  weekScores: { weekStart: LocalDate; weekScore: number | null }[];
  /** Score versions whose period overlaps the range. */
  versionsInRange: { version: number; effectiveFrom: Date }[];
  /** Some points used today's rules (stored ones couldn't be replayed). */
  approximate: boolean;
  /** Local date of the first recorded value, if any. */
  firstDataDate: LocalDate | null;
};

export const loadHistory = cache(
  async (range: HistoryRange): Promise<HistoryView> => {
    const inputs = await loadScoringInputs();
    const history = await historyInputs(inputs);
    const { today, now } = inputs;
    const from = addDays(today, -(range - 1));
    const points = lifeScoreHistory(
      history,
      sampleDates(from, today, MAX_CHART_POINTS),
      now,
      today,
    );

    const supabase = await createClient();
    const reviews = await supabase
      .from("weekly_reviews")
      .select("week_start, week_score")
      .gte("week_start", addDays(from, -6))
      .order("week_start");
    if (reviews.error)
      throw new Error(`Failed to load reviews: ${reviews.error.message}`);

    const rangeStart = instantForDate(
      addDays(from, -1),
      history.timeZone,
      now,
      today,
    );
    const firstEvent = inputs.events.reduce<Date | null>(
      (first, event) =>
        first === null || event.occurredAt < first ? event.occurredAt : first,
      null,
    );

    return {
      range,
      from,
      today,
      points,
      categories: inputs.categories.map(({ id, key, name }) => ({
        id,
        key,
        name,
      })),
      weekScores: reviews.data.map((review) => ({
        weekStart: review.week_start,
        weekScore: review.week_score,
      })),
      versionsInRange: history.versions
        .filter((v) => v.effectiveTo === null || v.effectiveTo > rangeStart)
        .map((v) => ({ version: v.version, effectiveFrom: v.effectiveFrom })),
      approximate: points.some((point) => point.basis === "current"),
      firstDataDate: firstEvent
        ? localDate(firstEvent, history.timeZone)
        : null,
    };
  },
);

export type ComparisonView = {
  from: LocalDate;
  to: LocalDate;
  comparison: ScoreComparison;
  bases: [ScoreBasis, ScoreBasis];
};

/** "You vs You" (spec §28), each side scored with its own date's rules. */
export const loadComparison = cache(
  async (rawFrom: unknown, rawTo: unknown): Promise<ComparisonView> => {
    const inputs = await loadScoringInputs();
    const history = await historyInputs(inputs);
    const { from, to } = parseComparison(rawFrom, rawTo, inputs.today);
    const scoreOn = (date: LocalDate) =>
      lifeScoreAsOf(
        history,
        instantForDate(date, history.timeZone, inputs.now, inputs.today),
      );
    const before = scoreOn(from);
    const after = scoreOn(to);
    return {
      from,
      to,
      comparison: compareLifeScores(before.life, after.life),
      bases: [before.basis, after.basis],
    };
  },
);
