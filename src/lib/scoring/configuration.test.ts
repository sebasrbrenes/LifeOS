import { describe, expect, it } from "vitest";

import {
  SCORE_ENGINE_VERSION,
  buildScoreConfiguration,
  requiresNewScoreVersion,
  scoreConfigurationSchema,
  serializeScoreConfiguration,
} from "./configuration";
import { ScoringInputError } from "./errors";
import { category, metric } from "./test-utils";

const categories = [
  category({ key: "career", weight: 25 }),
  category({ key: "body", weight: 20 }),
];
const metrics = [
  metric({
    key: "running_km",
    categoryId: "cat-body",
    config: { target: 15, baseline: 0 },
  }),
  metric({
    key: "career_level",
    categoryId: "cat-career",
    config: { target: 7 },
  }),
];
const base = buildScoreConfiguration(categories, metrics);

describe("buildScoreConfiguration", () => {
  it("captures what determines the score, sorted by key", () => {
    expect(base).toEqual({
      engineVersion: SCORE_ENGINE_VERSION,
      categories: [
        { key: "body", weight: 20, enabled: true },
        { key: "career", weight: 25, enabled: true },
      ],
      metrics: [
        {
          key: "career_level",
          categoryKey: "career",
          direction: "higher_is_better",
          period: "weekly",
          aggregation: "sum",
          weight: 1,
          enabled: true,
          config: { target: 7 },
        },
        {
          key: "running_km",
          categoryKey: "body",
          direction: "higher_is_better",
          period: "weekly",
          aggregation: "sum",
          weight: 1,
          enabled: true,
          config: { baseline: 0, target: 15 },
        },
      ],
    });
  });

  it("round-trips through the stored schema", () => {
    const stored = JSON.parse(serializeScoreConfiguration(base));
    expect(scoreConfigurationSchema.parse(stored)).toEqual(base);
  });

  it("rejects metrics whose category is unknown", () => {
    expect(() =>
      buildScoreConfiguration(categories, [
        metric({ key: "x", categoryId: "cat-nope" }),
      ]),
    ).toThrow(ScoringInputError);
  });
});

describe("requiresNewScoreVersion", () => {
  it("needs a first version", () => {
    expect(requiresNewScoreVersion(null, base)).toBe(true);
  });

  it("ignores cosmetic changes: names, input order, config key order", () => {
    const cosmetic = buildScoreConfiguration(
      [...categories]
        .reverse()
        .map((c) => ({ ...c, name: `${c.name} renamed` })),
      [...metrics].reverse().map((m) => ({
        ...m,
        name: "Renamed",
        config: m.key === "running_km" ? { target: 15, baseline: 0 } : m.config,
      })),
    );
    expect(requiresNewScoreVersion(base, cosmetic)).toBe(false);
  });

  it.each([
    [
      "a category weight",
      () =>
        buildScoreConfiguration(
          categories.map((c) => (c.key === "body" ? { ...c, weight: 30 } : c)),
          metrics,
        ),
    ],
    [
      "a category being disabled",
      () =>
        buildScoreConfiguration(
          categories.map((c) =>
            c.key === "body" ? { ...c, enabled: false } : c,
          ),
          metrics,
        ),
    ],
    [
      "a metric target",
      () =>
        buildScoreConfiguration(
          categories,
          metrics.map((m) =>
            m.key === "running_km" ? { ...m, config: { target: 20 } } : m,
          ),
        ),
    ],
    [
      "a metric direction",
      () =>
        buildScoreConfiguration(
          categories,
          metrics.map((m) =>
            m.key === "running_km"
              ? { ...m, direction: "lower_is_better" as const }
              : m,
          ),
        ),
    ],
    [
      "a metric moving category",
      () =>
        buildScoreConfiguration(
          categories,
          metrics.map((m) =>
            m.key === "running_km" ? { ...m, categoryId: "cat-career" } : m,
          ),
        ),
    ],
    [
      "a new metric",
      () =>
        buildScoreConfiguration(categories, [
          ...metrics,
          metric({ key: "sleep", categoryId: "cat-body" }),
        ]),
    ],
  ])("detects %s", (_name, build) => {
    expect(requiresNewScoreVersion(base, build())).toBe(true);
  });
});
