import { describe, expect, it } from "vitest";

import {
  categoryExecution,
  scoreTrends,
  strategyDiagnostics,
  trendOf,
  type ClosedWeek,
} from "./analytics";
import { computeLifeScore } from "./life-score";
import { category, commitment, event, metric } from "./test-utils";

const categories = [
  category({ key: "body", weight: 50 }),
  category({ key: "money", weight: 50 }),
];
const metrics = [
  metric({
    key: "strength",
    categoryId: "cat-body",
    period: "all_time",
    aggregation: "latest",
    config: { target: 100 },
  }),
  metric({
    key: "savings",
    categoryId: "cat-money",
    period: "all_time",
    aggregation: "latest",
    config: { target: 100 },
  }),
];
const life = (strength: number | null, savings: number | null) =>
  computeLifeScore({
    categories,
    metrics,
    events: [
      ...(strength === null ? [] : [event("strength", strength)]),
      ...(savings === null ? [] : [event("savings", savings)]),
    ],
    context: { asOf: new Date("2026-10-07T12:00:00Z"), timeZone: "UTC" },
  });

describe("trendOf", () => {
  it("classifies changes, treating under 1 point as flat", () => {
    expect(trendOf(50, 54)).toEqual({ delta: 4, direction: "up" });
    expect(trendOf(50, 49.5)).toEqual({ delta: -0.5, direction: "flat" });
    expect(trendOf(50, 40)).toEqual({ delta: -10, direction: "down" });
    expect(trendOf(null, 40)).toEqual({ delta: null, direction: null });
  });
});

describe("scoreTrends", () => {
  it("compares now with each past window", () => {
    const trends = scoreTrends(life(80, 60), {
      7: life(70, 60),
      30: life(null, 40),
    });
    expect(trends.life.trends[7].delta).toBe(5);
    expect(trends.life.trends[30].delta).toBe(30); // 70 vs 40 (Money only)
    const body = trends.categories.find((c) => c.name === "body")!;
    expect(body.trends[7]).toEqual({ delta: 10, direction: "up" });
    expect(body.trends[30]).toEqual({ delta: null, direction: null });
  });
});

const week = (
  n: number,
  done: number,
  categoryId = "cat-body",
): ClosedWeek => ({
  weekStart: `2026-09-${String(n).padStart(2, "0")}`,
  commitments: [
    commitment({ id: `c${n}`, categoryId, targetValue: 4, actualValue: done }),
  ],
});

describe("categoryExecution", () => {
  it("is the weighted completion of the category's commitments", () => {
    const weeks: ClosedWeek[] = [
      week(1, 4),
      {
        weekStart: "2026-09-08",
        commitments: [
          commitment({
            id: "heavy",
            categoryId: "cat-body",
            targetValue: 2,
            actualValue: 1,
            weight: 3,
          }),
          commitment({
            id: "gone",
            categoryId: "cat-body",
            actualValue: 0,
            status: "cancelled",
          }),
        ],
      },
    ];
    // (1 × 1 + 0.5 × 3) / 4 = 62.5 %
    expect(categoryExecution(weeks, "cat-body")).toBe(62.5);
    expect(categoryExecution(weeks, "cat-money")).toBeNull();
  });
});

describe("strategyDiagnostics (spec §11)", () => {
  const strongWeeks = [week(1, 4), week(8, 4), week(15, 4), week(22, 3.6)];

  it("flags high execution with a flat outcome", () => {
    const diagnostics = strategyDiagnostics({
      weeks: strongWeeks,
      windowStart: life(50, 50),
      windowEnd: life(51, 60),
    });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "high_execution_low_outcome",
        categoryName: "body",
        execution: 97.5,
        outcomeChange: 1,
        weeks: 4,
      }),
    ]);
  });

  it("stays quiet when high execution moves the outcome", () => {
    expect(
      strategyDiagnostics({
        weeks: strongWeeks,
        windowStart: life(50, 50),
        windowEnd: life(58, 50),
      }),
    ).toEqual([]);
  });

  it("flags an execution bottleneck", () => {
    const weakWeeks = [week(1, 1), week(8, 0), week(15, 2), week(22, 1)];
    const diagnostics = strategyDiagnostics({
      weeks: weakWeeks,
      windowStart: life(50, 50),
      windowEnd: life(48, 50),
    });
    expect(diagnostics.map((d) => d.code)).toEqual(["execution_bottleneck"]);
  });

  it("needs four closed weeks and data at both ends", () => {
    expect(
      strategyDiagnostics({
        weeks: strongWeeks.slice(0, 3),
        windowStart: life(50, 50),
        windowEnd: life(50, 50),
      }),
    ).toEqual([]);
    expect(
      strategyDiagnostics({
        weeks: strongWeeks,
        windowStart: life(null, 50),
        windowEnd: life(50, 50),
      }),
    ).toEqual([]);
  });
});
