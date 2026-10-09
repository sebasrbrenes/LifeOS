import { z } from "zod";

import {
  WEEKLY_REVIEW_SUMMARY_VERSION,
  type WeeklyReviewSummary,
} from "@/lib/scoring";

/**
 * Stored review summaries are read back through this schema: rows are
 * user-writable JSON, so a malformed one is shown without its summary
 * instead of breaking the page.
 */
const score = z.number().min(0).max(100).nullable();
const delta = z.number().min(-100).max(100).nullable();

const categoryChange = z.object({
  categoryId: z.string(),
  key: z.string(),
  name: z.string(),
  start: score,
  end: score,
  delta,
});

const metricChange = z.object({
  metricId: z.string(),
  key: z.string(),
  name: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  start: score,
  end: score,
  delta,
});

const metricGap = z.object({
  metricId: z.string(),
  key: z.string(),
  name: z.string(),
  categoryName: z.string(),
  score: z.number().min(0).max(100),
  potentialGain: z.number().min(0).max(100),
});

const focus = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plan_commitments") }),
  z.object({ kind: z.literal("execution"), weekScore: z.number() }),
  z.object({ kind: z.literal("metric"), gap: metricGap }),
  z.object({ kind: z.literal("collect_data") }),
]);

const summarySchema = z.object({
  summaryVersion: z.literal(WEEKLY_REVIEW_SUMMARY_VERSION),
  lifeScore: z.object({ start: score, end: score, delta }),
  weekScore: score,
  execution: z.object({
    completed: z.number().int().min(0),
    total: z.number().int().min(0),
    rate: z.number().min(0).max(1).nullable(),
  }),
  categories: z.array(categoryChange),
  biggestGain: categoryChange.nullable(),
  biggestDecline: categoryChange.nullable(),
  strongest: categoryChange.nullable(),
  weakest: categoryChange.nullable(),
  offTarget: z.array(metricGap),
  improvingFastest: z.array(metricChange),
  stagnantDespiteExecution: z.array(metricChange),
  bottleneck: metricGap.nullable(),
  focus: focus.nullable(),
}) satisfies z.ZodType<WeeklyReviewSummary>;

export function parseReviewSummary(raw: unknown): WeeklyReviewSummary | null {
  const parsed = summarySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
