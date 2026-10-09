import { describe, expect, it } from "vitest";

import { parseMetricConfig } from "./metric-config";
import type { MetricDirection } from "./vocabulary";

function errorsFor(direction: MetricDirection, config: unknown): string[] {
  const result = parseMetricConfig(direction, config);
  return result.ok ? [] : result.errors;
}

describe("parseMetricConfig", () => {
  it("applies defaults", () => {
    const result = parseMetricConfig("higher_is_better", { target: 15 });
    expect(result).toEqual({
      ok: true,
      value: {
        direction: "higher_is_better",
        config: { target: 15, baseline: 0 },
      },
    });
  });

  it("treats a null config as empty", () => {
    expect(parseMetricConfig("boolean", null).ok).toBe(true);
  });

  it.each([
    ["higher_is_better", {}],
    ["higher_is_better", { target: 0 }],
    ["higher_is_better", { target: 5, baseline: 5 }],
    ["higher_is_better", { target: "15" }],
    ["higher_is_better", { target: Number.POSITIVE_INFINITY }],
    ["higher_is_better", { target: Number.NaN }],
    ["lower_is_better", { target: 0 }],
    ["lower_is_better", { target: -3 }],
    ["lower_is_better", { target: 10, worst: 5 }],
    ["target_range", { targetMin: 9, targetMax: 7 }],
    ["target_range", { targetMin: 5, targetMax: 5 }],
    ["target_range", { targetMin: 1, targetMax: 2, tolerance: 0 }],
    ["milestone", { milestones: [] }],
    [
      "milestone",
      {
        milestones: [
          { value: 2, score: 10, label: "a" },
          { value: 1, score: 20, label: "b" },
        ],
      },
    ],
    [
      "milestone",
      {
        milestones: [
          { value: 1, score: 10, label: "a" },
          { value: 1, score: 20, label: "b" },
        ],
      },
    ],
    ["milestone", { milestones: [{ value: 1, score: 101, label: "a" }] }],
    ["milestone", { milestones: [{ value: 1, score: 50, label: "  " }] }],
    ["ratio", { target: 0 }],
    ["ratio", { target: 0.1, numerator: "replies" }],
    ["ratio", { target: 0.1, numerator: "Bad Key", denominator: "x" }],
    ["custom", { points: [{ value: 0, score: 0 }] }],
    [
      "custom",
      {
        points: [
          { value: 1, score: 0 },
          { value: 0, score: 100 },
        ],
      },
    ],
    // Unknown keys are rejected so typos (e.g. "traget") can't silently
    // fall back to defaults.
    ["higher_is_better", { target: 15, traget: 20 }],
    ["boolean", { emptyWindow: "sometimes" }],
  ] as const)("rejects invalid %s config %j", (direction, config) => {
    expect(errorsFor(direction, config).length).toBeGreaterThan(0);
  });

  it("reports the offending field", () => {
    expect(errorsFor("target_range", { targetMin: 9, targetMax: 7 })).toEqual([
      "targetMax: targetMax must be at least targetMin",
    ]);
  });

  it.each([
    ["higher_is_better", { target: 15, emptyWindow: "missing" }],
    ["lower_is_better", { target: 0, worst: 100 }],
    [
      "target_range",
      { targetMin: 7, targetMax: 9, toleranceBelow: 1, toleranceAbove: 2 },
    ],
    [
      "target_range",
      { targetMin: 5, targetMax: 5, toleranceBelow: 1, toleranceAbove: 2 },
    ],
    [
      "ratio",
      {
        target: 0.1,
        numerator: "positive_replies",
        denominator: "prospects_contacted",
        minDenominator: 20,
      },
    ],
    [
      "custom",
      {
        points: [
          { value: 0, score: 100 },
          { value: 1, score: 0 },
        ],
      },
    ],
  ] as const)("accepts valid %s config %j", (direction, config) => {
    expect(errorsFor(direction, config)).toEqual([]);
  });
});
