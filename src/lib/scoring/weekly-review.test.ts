import { describe, expect, it } from "vitest";

import { computeLifeScore } from "./life-score";
import { category, commitment, event, metric } from "./test-utils";
import { endOfLocalDay, startOfLocalDay } from "./time";
import type { CommitmentInput, MetricEventInput } from "./types";
import { computeWeekScore } from "./week-score";
import {
  HIGH_EXECUTION_SCORE,
  LOW_EXECUTION_SCORE,
  buildWeeklyReview,
} from "./weekly-review";

// Week of Monday 28 Sep – Sunday 4 Oct 2026, UTC.
const WEEK_START = "2026-09-28";
const START_AS_OF = new Date(startOfLocalDay(WEEK_START, "UTC").getTime() - 1);
const END_AS_OF = endOfLocalDay("2026-10-04", "UTC");
const at = (date: string) => new Date(`${date}T12:00:00Z`);

const categories = [
  category({ key: "body", weight: 50 }),
  category({ key: "money", weight: 50 }),
];
const metrics = [
  metric({ key: "runs", categoryId: "cat-body", config: { target: 10 } }),
  metric({
    key: "sleep",
    categoryId: "cat-body",
    aggregation: "avg",
    config: { target: 8 },
  }),
  metric({
    key: "savings",
    categoryId: "cat-money",
    period: "all_time",
    aggregation: "latest",
    config: { target: 1000 },
  }),
];
const baseEvents = [
  event("runs", 5, at("2026-09-22")),
  event("runs", 3, at("2026-10-01")),
  event("sleep", 7, at("2026-09-25")),
  event("sleep", 7, at("2026-10-02")),
  event("savings", 400, at("2026-09-20")),
  event("savings", 600, at("2026-10-02")),
];

function life(asOf: Date, events: MetricEventInput[] = baseEvents) {
  return computeLifeScore({
    categories,
    metrics,
    events,
    context: { asOf, timeZone: "UTC" },
  });
}

function review(
  commitments: CommitmentInput[],
  events: MetricEventInput[] = baseEvents,
) {
  return buildWeeklyReview({
    lifeStart: life(START_AS_OF, events),
    lifeEnd: life(END_AS_OF, events),
    week: computeWeekScore(commitments),
  });
}

const bodyDone = commitment({
  id: "c-runs",
  categoryId: "cat-body",
  targetValue: 3,
  actualValue: 3,
});

describe("buildWeeklyReview", () => {
  it("reports the Life Score at both ends of the week and its change", () => {
    const summary = review([bodyDone]);
    const start = life(START_AS_OF).score!;
    const end = life(END_AS_OF).score!;
    expect(summary.lifeScore.start).toBeCloseTo(start, 1);
    expect(summary.lifeScore.end).toBeCloseTo(end, 1);
    expect(summary.lifeScore.delta).toBeCloseTo(end - start, 1);
  });

  it("keeps the Week Score separate from the Life Score", () => {
    const summary = review([
      bodyDone,
      commitment({ id: "c-other", targetValue: 4, actualValue: 1 }),
    ]);
    expect(summary.weekScore).toBe(62.5);
    expect(summary.execution).toEqual({ completed: 1, total: 2, rate: 0.5 });
    // Same state, different execution: the Life Score doesn't move.
    expect(summary.lifeScore).toEqual(review([bodyDone]).lifeScore);
  });

  it("finds the biggest gain and decline among categories", () => {
    const summary = review([bodyDone]);
    const money = summary.categories.find((c) => c.key === "money")!;
    const body = summary.categories.find((c) => c.key === "body")!;
    expect(money.delta).toBe(20); // savings 400 → 600 of 1000
    expect(body.delta).toBeLessThan(0); // runs 5 → 3 of 10
    expect(summary.biggestGain?.key).toBe("money");
    expect(summary.biggestDecline?.key).toBe("body");
    expect(summary.strongest?.key).toBe("money");
    expect(summary.weakest?.key).toBe("body");
  });

  it("doesn't invent a change for categories without data at one end", () => {
    const summary = review(
      [bodyDone],
      baseEvents.filter((e) => e.occurredAt > START_AS_OF),
    );
    const body = summary.categories.find((c) => c.key === "body")!;
    expect(body.start).toBeNull();
    expect(body.delta).toBeNull();
    expect(summary.lifeScore.start).toBeNull();
    expect(summary.lifeScore.delta).toBeNull();
    expect(summary.biggestGain).toBeNull();
    expect(summary.biggestDecline).toBeNull();
  });

  it("ranks off-target metrics by the Life Score points they hold back", () => {
    const summary = review([bodyDone]);
    // savings 60/100 in a 50 % category alone: (100 − 60) × 1 × 0.5 = 20
    // runs 30/100, half of Body: (100 − 30) × 0.5 × 0.5 = 17.5
    expect(summary.offTarget.map((m) => [m.key, m.potentialGain])).toEqual([
      ["savings", 20],
      ["runs", 17.5],
      ["sleep", 3.13],
    ]);
    expect(summary.bottleneck?.key).toBe("savings");
    const gains = summary.offTarget.map((m) => m.potentialGain);
    expect([...gains].sort((a, b) => b - a)).toEqual(gains);
  });

  it("potential gain is exactly what reaching the target adds", () => {
    const summary = review([bodyDone]);
    const savings = summary.offTarget.find((m) => m.key === "savings")!;
    const before = life(END_AS_OF).score!;
    const after = life(END_AS_OF, [
      ...baseEvents,
      event("savings", 1000, at("2026-10-03")),
    ]).score!;
    expect(savings.potentialGain).toBeCloseTo(after - before, 1);
  });

  it("lists metrics improving fastest", () => {
    const summary = review([bodyDone]);
    expect(summary.improvingFastest.map((m) => m.key)).toEqual(["savings"]);
    expect(summary.improvingFastest[0].delta).toBe(20);
  });

  it("flags stagnant metrics only after high execution in their category", () => {
    const high = review([bodyDone]);
    expect(high.weekScore).toBeGreaterThanOrEqual(HIGH_EXECUTION_SCORE);
    // sleep: 7 → 7 in Body, the category worked on; savings moved; runs fell.
    expect(high.stagnantDespiteExecution.map((m) => m.key)).toEqual(["sleep"]);

    const otherCategory = review([{ ...bodyDone, categoryId: "cat-money" }]);
    expect(otherCategory.stagnantDespiteExecution).toEqual([]);

    const low = review([{ ...bodyDone, actualValue: 2 }]);
    expect(low.weekScore).toBeLessThan(HIGH_EXECUTION_SCORE);
    expect(low.stagnantDespiteExecution).toEqual([]);
  });

  it("suggests a focus by explicit rules", () => {
    expect(review([]).focus).toEqual({ kind: "plan_commitments" });

    const lowExecution = review([{ ...bodyDone, actualValue: 1 }]);
    expect(lowExecution.weekScore).toBeLessThan(LOW_EXECUTION_SCORE);
    expect(lowExecution.focus).toEqual({
      kind: "execution",
      weekScore: lowExecution.weekScore,
    });

    const good = review([bodyDone]);
    expect(good.focus).toEqual({ kind: "metric", gap: good.bottleneck });

    expect(review([bodyDone], []).focus).toEqual({ kind: "collect_data" });
  });

  it("produces plain JSON for storage", () => {
    const summary = review([bodyDone]);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });
});
