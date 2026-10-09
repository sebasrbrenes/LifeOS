import "server-only";

import { cache } from "react";

import {
  addDays,
  buildWeeklyReview,
  computeWeekScore,
  endOfWeek,
  startOfWeek,
  type LocalDate,
  type WeekScore,
  type WeeklyReviewSummary,
} from "@/lib/scoring";
import type { Tables } from "@/lib/supabase/database.types";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";

import {
  COMMITMENT_COLUMNS,
  lifeScoreAt,
  loadScoringInputs,
  type ScoringInputs,
} from "../scores/data";
import { toCommitmentInput } from "../scores/mappers";
import {
  canPlanWeek,
  canTrackProgress,
  isClosable,
  parseLocalDate,
  reviewInstants,
  weekPhase,
  type WeekPhase,
} from "./period";
import { parseReviewSummary } from "./summary";

export type CommitmentRecord = Pick<
  Tables<"weekly_commitments">,
  | "id"
  | "title"
  | "category_id"
  | "target_value"
  | "actual_value"
  | "weight"
  | "completion_type"
  | "status"
  | "unit"
  | "position"
  | "week_start"
>;

export type ReviewRecord = Pick<
  Tables<"weekly_reviews">,
  | "week_start"
  | "week_end"
  | "life_score_start"
  | "life_score_end"
  | "week_score"
  | "user_notes"
  | "created_at"
> & {
  summary: WeeklyReviewSummary | null;
  scoreVersion: number | null;
};

const REVIEW_COLUMNS =
  "week_start, week_end, life_score_start, life_score_end, week_score, user_notes, created_at, summary, score_versions(version)";

type Client = Awaited<ReturnType<typeof createClient>>;

async function commitmentsOf(
  supabase: Client,
  weekStart: LocalDate,
): Promise<CommitmentRecord[]> {
  const { data, error } = await supabase
    .from("weekly_commitments")
    .select(COMMITMENT_COLUMNS)
    .eq("week_start", weekStart)
    .order("position")
    .order("created_at");
  if (error) throw new Error(`Failed to load commitments: ${error.message}`);
  return data;
}

function toReviewRecord(row: {
  week_start: string;
  week_end: string;
  life_score_start: number | null;
  life_score_end: number | null;
  week_score: number | null;
  user_notes: string | null;
  created_at: string;
  summary: unknown;
  score_versions: { version: number } | null;
}): ReviewRecord {
  const { summary, score_versions: version, ...rest } = row;
  return {
    ...rest,
    summary: parseReviewSummary(summary),
    scoreVersion: version?.version ?? null,
  };
}

async function reviewOf(
  supabase: Client,
  weekStart: LocalDate,
): Promise<ReviewRecord | null> {
  const { data, error } = await supabase
    .from("weekly_reviews")
    .select(REVIEW_COLUMNS)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw new Error(`Failed to load review: ${error.message}`);
  return data ? toReviewRecord(data) : null;
}

/**
 * Weeks that ended (or end today) with commitments and no review yet,
 * oldest first. Closing them is what keeps the history honest.
 */
export const loadPendingReviews = cache(async (): Promise<LocalDate[]> => {
  const { today } = await loadScoringInputs();
  const supabase = await createClient();
  const lastClosable = addDays(today, -6);
  const [commitments, reviews] = await Promise.all([
    fetchAllRows<{ week_start: string }>((from, to) =>
      supabase
        .from("weekly_commitments")
        .select("week_start")
        .lte("week_start", lastClosable)
        .neq("status", "closed")
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<{ week_start: string }>((from, to) =>
      supabase
        .from("weekly_reviews")
        .select("week_start")
        .order("week_start")
        .range(from, to),
    ),
  ]);
  const reviewed = new Set(reviews.map((r) => r.week_start));
  return [...new Set(commitments.map((c) => c.week_start))]
    .filter((week) => !reviewed.has(week))
    .sort();
});

export type WeekView = {
  weekStart: LocalDate;
  weekEnd: LocalDate;
  today: LocalDate;
  currentWeekStart: LocalDate;
  phase: WeekPhase;
  review: ReviewRecord | null;
  closed: boolean;
  closable: boolean;
  canPlan: boolean;
  canTrack: boolean;
  commitments: CommitmentRecord[];
  week: WeekScore;
  categories: { id: string; name: string }[];
  previousWeekStart: LocalDate;
  previousCommitmentCount: number;
};

/**
 * The week containing `raw` (a `?w=` date), or the current week. A week
 * planned under a different week-start day is still found by its exact
 * start date.
 */
export const loadWeek = cache(async (raw?: string): Promise<WeekView> => {
  const inputs = await loadScoringInputs();
  const { profile, today } = inputs;
  const supabase = await createClient();
  const currentWeekStart = startOfWeek(today, profile.week_starts_on);

  const exact = parseLocalDate(raw);
  let weekStart = startOfWeek(exact ?? today, profile.week_starts_on);
  let commitments = await commitmentsOf(supabase, exact ?? weekStart);
  if (exact && exact !== weekStart) {
    if (commitments.length > 0) weekStart = exact;
    else commitments = await commitmentsOf(supabase, weekStart);
  }

  const previousWeekStart = addDays(weekStart, -7);
  const [review, previous] = await Promise.all([
    reviewOf(supabase, weekStart),
    supabase
      .from("weekly_commitments")
      .select("id", { count: "exact", head: true })
      .eq("week_start", previousWeekStart)
      .neq("status", "cancelled"),
  ]);
  if (previous.error) throw new Error(previous.error.message);

  const closed = review !== null;
  return {
    weekStart,
    weekEnd: endOfWeek(weekStart),
    today,
    currentWeekStart,
    phase: weekPhase(weekStart, today),
    review,
    closed,
    closable: !closed && isClosable(weekStart, today),
    canPlan: !closed && canPlanWeek(weekStart, currentWeekStart),
    canTrack: !closed && canTrackProgress(weekStart, today),
    commitments,
    week: computeWeekScore(commitments.map(toCommitmentInput)),
    categories: inputs.categories.map(({ id, name }) => ({ id, name })),
    previousWeekStart,
    previousCommitmentCount: previous.count ?? 0,
  };
});

/**
 * The review of a week as it would be saved now. Used for the preview and,
 * recomputed on the server, when closing — never taken from the client.
 */
export function computeReview(
  inputs: ScoringInputs,
  weekStart: LocalDate,
  commitments: CommitmentRecord[],
): {
  summary: WeeklyReviewSummary;
  lifeScoreStart: number | null;
  lifeScoreEnd: number | null;
  weekScore: number | null;
} {
  const instants = reviewInstants(
    weekStart,
    inputs.profile.timezone,
    inputs.now,
  );
  const summary = buildWeeklyReview({
    lifeStart: lifeScoreAt(inputs, instants.start),
    lifeEnd: lifeScoreAt(inputs, instants.end),
    week: computeWeekScore(commitments.map(toCommitmentInput)),
  });
  return {
    summary,
    lifeScoreStart: summary.lifeScore.start,
    lifeScoreEnd: summary.lifeScore.end,
    weekScore: summary.weekScore,
  };
}

export type ReviewPage =
  | {
      kind: "closed";
      week: WeekView;
      review: ReviewRecord;
    }
  | {
      kind: "preview";
      week: WeekView;
      preview: ReturnType<typeof computeReview>;
      scoreVersion: number | null;
    }
  | { kind: "not_ready"; week: WeekView };

export const loadReviewPage = cache(
  async (raw: string): Promise<ReviewPage | null> => {
    if (!parseLocalDate(raw)) return null;
    const week = await loadWeek(raw);
    if (week.review) return { kind: "closed", week, review: week.review };
    if (!week.closable) return { kind: "not_ready", week };
    const inputs = await loadScoringInputs();
    return {
      kind: "preview",
      week,
      preview: computeReview(inputs, week.weekStart, week.commitments),
      scoreVersion: inputs.scoreVersion?.version ?? null,
    };
  },
);

/** All closed weeks, newest first. */
export const loadReviews = cache(async (): Promise<ReviewRecord[]> => {
  await loadScoringInputs();
  const supabase = await createClient();
  const rows = await fetchAllRows<Parameters<typeof toReviewRecord>[0]>(
    (from, to) =>
      supabase
        .from("weekly_reviews")
        .select(REVIEW_COLUMNS)
        .order("week_start", { ascending: false })
        .range(from, to),
  );
  return rows.map(toReviewRecord);
});
