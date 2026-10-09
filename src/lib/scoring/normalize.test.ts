import { describe, expect, it } from "vitest";

import { parseMetricConfig, type ParsedMetricConfig } from "./metric-config";
import {
  clampScore,
  normalize,
  scoreBoolean,
  scoreCustom,
  scoreHigherIsBetter,
  scoreLowerIsBetter,
  scoreMilestone,
  scoreRatio,
  scoreTargetRange,
} from "./normalize";
import type { MetricDirection } from "./vocabulary";

/** Parses a config and fails the test if it's invalid. */
function cfg<D extends MetricDirection>(direction: D, config: unknown) {
  const parsed = parseMetricConfig(direction, config);
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return parsed.value.config as Extract<
    ParsedMetricConfig,
    { direction: D }
  >["config"];
}

describe("clampScore", () => {
  it.each([
    [50, 50, null],
    [0, 0, null],
    [100, 100, null],
    [100.0001, 100, "above_max"],
    [250, 100, "above_max"],
    [-0.0001, 0, "below_min"],
    [-40, 0, "below_min"],
  ] as const)("%d → %d (%s)", (raw, score, capped) => {
    expect(clampScore(raw)).toEqual({ score, capped });
  });
});

describe("higher_is_better", () => {
  const config = cfg("higher_is_better", { target: 15 });

  it("matches the spec example: 12 of 15 km scores 80", () => {
    expect(scoreHigherIsBetter(12, config).score).toBeCloseTo(80);
  });

  it("matches the spec savings example: 2500 of 5000 scores 50", () => {
    expect(
      scoreHigherIsBetter(2500, cfg("higher_is_better", { target: 5000 }))
        .score,
    ).toBe(50);
  });

  it.each([
    [0, 0],
    [15, 100],
    [7.5, 50],
  ])("value %d → %d at the boundaries", (value, expected) => {
    expect(scoreHigherIsBetter(value, config).score).toBeCloseTo(expected);
  });

  it("caps overperformance at 100 and records it", () => {
    const result = scoreHigherIsBetter(30, config);
    expect(result.score).toBe(100);
    expect(result.rawScore).toBeCloseTo(200);
    expect(result.capped).toBe("above_max");
  });

  it("floors negative values at 0", () => {
    const result = scoreHigherIsBetter(-5, config);
    expect(result.score).toBe(0);
    expect(result.capped).toBe("below_min");
  });

  it("supports a baseline that scores 0", () => {
    const withBaseline = cfg("higher_is_better", {
      target: 3000,
      baseline: 1000,
    });
    expect(scoreHigherIsBetter(1000, withBaseline).score).toBe(0);
    expect(scoreHigherIsBetter(2000, withBaseline).score).toBe(50);
    expect(scoreHigherIsBetter(500, withBaseline).score).toBe(0);
  });
});

describe("lower_is_better", () => {
  it("uses target / value without a worst value (spec §9.2)", () => {
    const config = cfg("lower_is_better", { target: 25 }); // 5K minutes
    expect(scoreLowerIsBetter(25, config).score).toBe(100);
    expect(scoreLowerIsBetter(50, config).score).toBe(50);
    expect(scoreLowerIsBetter(28, config).score).toBeCloseTo(89.2857, 3);
  });

  it("caps beating the target at 100", () => {
    const config = cfg("lower_is_better", { target: 25 });
    const result = scoreLowerIsBetter(20, config);
    expect(result.score).toBe(100);
    expect(result.capped).toBe("above_max");
  });

  it("handles values at or below zero without dividing by zero", () => {
    const config = cfg("lower_is_better", { target: 25 });
    expect(scoreLowerIsBetter(0, config).score).toBe(100);
    expect(scoreLowerIsBetter(-1, config).score).toBe(100);
    expect(Number.isFinite(scoreLowerIsBetter(0, config).rawScore)).toBe(true);
  });

  it("is linear between worst and target when worst is set", () => {
    const config = cfg("lower_is_better", { target: 0, worst: 10000 }); // debt
    expect(scoreLowerIsBetter(10000, config).score).toBe(0);
    expect(scoreLowerIsBetter(5000, config).score).toBe(50);
    expect(scoreLowerIsBetter(0, config).score).toBe(100);
    expect(scoreLowerIsBetter(12000, config).score).toBe(0);
  });
});

describe("target_range", () => {
  const sleep = cfg("target_range", { targetMin: 7, targetMax: 9 });

  it.each([7, 8, 9])("scores 100 inside the range (%d h)", (hours) => {
    expect(scoreTargetRange(hours, sleep).score).toBe(100);
  });

  it("loses points with distance, using the range width as tolerance", () => {
    expect(scoreTargetRange(6, sleep).score).toBe(50);
    expect(scoreTargetRange(5, sleep).score).toBe(0);
    expect(scoreTargetRange(10, sleep).score).toBe(50);
    expect(scoreTargetRange(11, sleep).score).toBe(0);
    expect(scoreTargetRange(3, sleep).score).toBe(0);
  });

  it("supports asymmetric tolerances", () => {
    const config = cfg("target_range", {
      targetMin: 7,
      targetMax: 9,
      toleranceBelow: 1,
      toleranceAbove: 4,
    });
    expect(scoreTargetRange(6.5, config).score).toBe(50);
    expect(scoreTargetRange(11, config).score).toBe(50);
  });

  it("supports a single-value range with an explicit tolerance", () => {
    const config = cfg("target_range", {
      targetMin: 5,
      targetMax: 5,
      tolerance: 5,
    });
    expect(scoreTargetRange(5, config).score).toBe(100);
    expect(scoreTargetRange(2.5, config).score).toBe(50);
  });

  it("explains where the value sits", () => {
    expect(scoreTargetRange(6, sleep).detail).toEqual({
      kind: "range",
      position: "below",
      distance: 1,
      tolerance: 2,
    });
  });
});

describe("boolean", () => {
  it.each([
    [1, 100],
    [0, 0],
    [5, 100],
    [-1, 0],
  ])("%d → %d", (value, expected) => {
    expect(scoreBoolean(value).score).toBe(expected);
  });
});

describe("milestone (spec §9.4 career ladder)", () => {
  const ladder = cfg("milestone", {
    milestones: [
      { value: 0, score: 0, label: "No relevant path" },
      { value: 1, score: 20, label: "Learning fundamentals" },
      { value: 2, score: 40, label: "Structured training" },
      { value: 3, score: 55, label: "Demonstrable project" },
      { value: 4, score: 65, label: "Strong portfolio" },
      { value: 5, score: 75, label: "Interviews" },
      { value: 6, score: 90, label: "Offer" },
      { value: 7, score: 100, label: "Desired job obtained" },
    ],
  });

  it("scores the highest milestone reached", () => {
    const result = scoreMilestone(3, ladder);
    expect(result.score).toBe(55);
    expect(result.detail).toMatchObject({
      kind: "milestone",
      reached: { label: "Demonstrable project" },
      next: { label: "Strong portfolio" },
    });
  });

  it("does not interpolate between milestones", () => {
    expect(scoreMilestone(3.9, ladder).score).toBe(55);
  });

  it("scores 100 at the final milestone with no next step", () => {
    const result = scoreMilestone(7, ladder);
    expect(result.score).toBe(100);
    expect(result.detail).toMatchObject({ next: null });
  });

  it("scores 0 below the first milestone", () => {
    const steps = cfg("milestone", {
      milestones: [{ value: 1, score: 40, label: "First client" }],
    });
    const result = scoreMilestone(0, steps);
    expect(result.score).toBe(0);
    expect(result.detail).toMatchObject({
      reached: null,
      next: { label: "First client" },
    });
  });
});

describe("ratio", () => {
  const replyRate = cfg("ratio", { target: 0.1 });

  it("scores the ratio against its target", () => {
    expect(scoreRatio(0.08, replyRate).score).toBeCloseTo(80);
    expect(scoreRatio(0.1, replyRate).score).toBeCloseTo(100);
    expect(scoreRatio(0, replyRate).score).toBe(0);
  });

  it("caps ratios above target", () => {
    expect(scoreRatio(0.2, replyRate)).toMatchObject({
      score: 100,
      capped: "above_max",
    });
  });
});

describe("custom (piecewise linear)", () => {
  const curve = cfg("custom", {
    points: [
      { value: 0, score: 0 },
      { value: 10, score: 60 },
      { value: 20, score: 100 },
    ],
  });

  it.each([
    [-5, 0],
    [0, 0],
    [5, 30],
    [10, 60],
    [15, 80],
    [20, 100],
    [99, 100],
  ])("%d → %d", (value, expected) => {
    expect(scoreCustom(value, curve).score).toBeCloseTo(expected);
  });

  it("supports decreasing curves", () => {
    const decreasing = cfg("custom", {
      points: [
        { value: 0, score: 100 },
        { value: 100, score: 0 },
      ],
    });
    expect(scoreCustom(25, decreasing).score).toBe(75);
  });
});

describe("normalize dispatch", () => {
  it.each([
    ["higher_is_better", { target: 10 }, 5, 50],
    ["lower_is_better", { target: 10 }, 20, 50],
    ["target_range", { targetMin: 1, targetMax: 2 }, 1.5, 100],
    ["boolean", {}, 1, 100],
    ["milestone", { milestones: [{ value: 1, score: 30, label: "x" }] }, 1, 30],
    ["ratio", { target: 0.5 }, 0.25, 50],
    [
      "custom",
      {
        points: [
          { value: 0, score: 0 },
          { value: 4, score: 100 },
        ],
      },
      1,
      25,
    ],
  ] as const)("%s", (direction, config, value, expected) => {
    const parsed = parseMetricConfig(direction, config);
    expect(parsed.ok).toBe(true);
    if (parsed.ok)
      expect(normalize(value, parsed.value).score).toBeCloseTo(expected);
  });

  it("always returns a score within 0–100 for any finite input", () => {
    const configs: [MetricDirection, unknown][] = [
      ["higher_is_better", { target: 7 }],
      ["lower_is_better", { target: 3 }],
      ["lower_is_better", { target: 1, worst: 9 }],
      ["target_range", { targetMin: -2, targetMax: 2 }],
      [
        "custom",
        {
          points: [
            { value: -1, score: 20 },
            { value: 1, score: 90 },
          ],
        },
      ],
    ];
    const values = [-1e9, -100, -1, -0.001, 0, 0.001, 1, 3.3, 100, 1e9];
    for (const [direction, config] of configs) {
      const parsed = parseMetricConfig(direction, config);
      if (!parsed.ok) throw new Error(parsed.errors.join());
      for (const value of values) {
        const { score } = normalize(value, parsed.value);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
        expect(Number.isFinite(score)).toBe(true);
      }
    }
  });
});
