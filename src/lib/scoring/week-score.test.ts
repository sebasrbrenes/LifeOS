import { describe, expect, it } from "vitest";

import { ScoringInputError } from "./errors";
import { commitment } from "./test-utils";
import { commitmentCompletion, computeWeekScore } from "./week-score";

describe("commitmentCompletion (spec §10 examples)", () => {
  it.each([
    [3, 3, 1],
    [2, 3, 2 / 3],
    [5, 3, 1], // doing more is not extra score
    [0, 3, 0],
    [-1, 3, 0],
  ])("%d of %d runs → %d", (actual, target, expected) => {
    expect(
      commitmentCompletion(
        commitment({ id: "runs", actualValue: actual, targetValue: target }),
      ),
    ).toBeCloseTo(expected, 10);
  });

  it("is all-or-nothing for boolean commitments", () => {
    const review = {
      id: "review",
      completionType: "boolean" as const,
      targetValue: 1,
    };
    expect(
      commitmentCompletion(commitment({ ...review, actualValue: 1 })),
    ).toBe(1);
    expect(
      commitmentCompletion(commitment({ ...review, actualValue: 0 })),
    ).toBe(0);
    expect(
      commitmentCompletion(commitment({ ...review, actualValue: 0.9 })),
    ).toBe(0);
  });
});

describe("computeWeekScore", () => {
  const week = [
    commitment({ id: "runs", targetValue: 3, actualValue: 2 }), // 2/3
    commitment({ id: "gym", targetValue: 4, actualValue: 4 }), // 1
    commitment({ id: "study", targetValue: 5, actualValue: 6 }), // 1 (capped)
    commitment({
      id: "review",
      completionType: "boolean",
      targetValue: 1,
      actualValue: 0,
    }), // 0
  ];

  it("averages completion with normalised weights", () => {
    const result = computeWeekScore(week);
    expect(result.score).toBeCloseTo(((2 / 3 + 1 + 1 + 0) / 4) * 100, 10);
    expect(result).toMatchObject({
      completedCount: 2,
      totalCount: 4,
      executionRate: 0.5,
    });
  });

  it("applies commitment weights", () => {
    const weighted = week.map((c) =>
      c.id === "review" ? { ...c, weight: 5 } : c,
    );
    // Total weight 8: (2/3 + 1 + 1 + 0×5) / 8.
    expect(computeWeekScore(weighted).score).toBeCloseTo(
      ((2 / 3 + 2) / 8) * 100,
      10,
    );
  });

  it("explains every point: contributions sum to the score", () => {
    const result = computeWeekScore(week);
    const sum = result.commitments.reduce(
      (total, c) => total + c.contribution,
      0,
    );
    expect(sum).toBeCloseTo(result.score!, 10);
  });

  it("scores 100 when everything is done and never more", () => {
    const allDone = week.map((c) => ({
      ...c,
      actualValue: c.targetValue * 10,
    }));
    expect(computeWeekScore(allDone).score).toBe(100);
  });

  it("scores 0 when nothing is done", () => {
    const nothing = week.map((c) => ({ ...c, actualValue: 0 }));
    expect(computeWeekScore(nothing)).toMatchObject({
      score: 0,
      completedCount: 0,
    });
  });

  it("excludes cancelled commitments", () => {
    const withCancelled = [
      ...week,
      commitment({
        id: "skipped",
        status: "cancelled",
        targetValue: 10,
        actualValue: 0,
      }),
    ];
    const result = computeWeekScore(withCancelled);
    expect(result.score).toBeCloseTo(computeWeekScore(week).score!, 10);
    expect(result.totalCount).toBe(4);
    expect(result.commitments.find((c) => c.id === "skipped")).toMatchObject({
      completion: null,
      contribution: 0,
    });
  });

  it("counts closed commitments (finalised weeks)", () => {
    const closed = week.map((c) => ({ ...c, status: "closed" as const }));
    expect(computeWeekScore(closed).score).toBeCloseTo(
      computeWeekScore(week).score!,
      10,
    );
  });

  it("has no score without commitments (missing is not zero)", () => {
    expect(computeWeekScore([])).toMatchObject({
      score: null,
      executionRate: null,
      totalCount: 0,
    });
  });

  it("has no score when every weight is zero", () => {
    const result = computeWeekScore(week.map((c) => ({ ...c, weight: 0 })));
    expect(result.score).toBeNull();
    expect(result.issues).toContainEqual({ code: "no_weighted_items" });
  });

  it.each([
    ["duplicate ids", [commitment({ id: "a" }), commitment({ id: "a" })]],
    ["zero target", [commitment({ id: "a", targetValue: 0 })]],
    ["negative weight", [commitment({ id: "a", weight: -1 })]],
    ["non-finite actual", [commitment({ id: "a", actualValue: Number.NaN })]],
  ])("rejects %s", (_name, input) => {
    expect(() => computeWeekScore(input)).toThrow(ScoringInputError);
  });
});
