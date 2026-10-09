import { describe, expect, it } from "vitest";

import { ScoringInputError } from "./errors";
import { categoryExtremes, computeLifeScore } from "./life-score";
import { CONTEXT, category, daysAgo, event, metric } from "./test-utils";
import type {
  CategoryInput,
  LifeScore,
  MetricDefinitionInput,
  MetricEventInput,
} from "./types";

const DEFAULT_CATEGORIES: CategoryInput[] = [
  category({ key: "career", weight: 25 }),
  category({ key: "business", weight: 20 }),
  category({ key: "body", weight: 20 }),
  category({ key: "money", weight: 15 }),
  category({ key: "discipline", weight: 10 }),
  category({ key: "life", weight: 10 }),
];

const CAREER_LADDER = {
  milestones: [
    { value: 0, score: 0, label: "No relevant path" },
    { value: 3, score: 55, label: "Demonstrable project" },
    { value: 7, score: 100, label: "Desired job obtained" },
  ],
};

const METRICS: MetricDefinitionInput[] = [
  metric({
    key: "career_level",
    categoryId: "cat-career",
    direction: "milestone",
    period: "all_time",
    aggregation: "latest",
    config: CAREER_LADDER,
  }),
  metric({
    key: "running_km",
    categoryId: "cat-body",
    weight: 2,
    config: { target: 15 },
  }),
  metric({
    key: "sleep_hours",
    categoryId: "cat-body",
    direction: "target_range",
    aggregation: "avg",
    config: { targetMin: 7, targetMax: 9 },
  }),
  metric({
    key: "savings",
    categoryId: "cat-money",
    period: "all_time",
    aggregation: "latest",
    config: { target: 5000 },
  }),
];

const EVENTS: MetricEventInput[] = [
  event("career_level", 3, daysAgo(10)),
  event("running_km", 5, daysAgo(1)),
  event("running_km", 7, daysAgo(4)),
  event("sleep_hours", 7.5, daysAgo(1)),
  event("sleep_hours", 8.5, daysAgo(2)),
  event("savings", 2500, daysAgo(5)),
];

function compute(
  overrides: Partial<{
    categories: CategoryInput[];
    metrics: MetricDefinitionInput[];
    events: MetricEventInput[];
  }> = {},
): LifeScore {
  return computeLifeScore({
    categories: overrides.categories ?? DEFAULT_CATEGORIES,
    metrics: overrides.metrics ?? METRICS,
    events: overrides.events ?? EVENTS,
    context: CONTEXT,
  });
}

const byKey = (life: LifeScore, key: string) => {
  const found = life.categories.find((c) => c.key === key);
  if (!found) throw new Error(`no category ${key}`);
  return found;
};

describe("computeLifeScore — worked example", () => {
  const life = compute();

  it("scores each category from its metrics", () => {
    expect(byKey(life, "career").score).toBe(55);
    // Body: running 12/15 = 80 (weight 2), sleep avg 8 in range = 100 (weight 1).
    expect(byKey(life, "body").score).toBeCloseTo((80 * 2 + 100) / 3, 10);
    expect(byKey(life, "money").score).toBe(50);
  });

  it("leaves categories without metrics unscored, not zero", () => {
    for (const key of ["business", "discipline", "life"]) {
      expect(byKey(life, key)).toMatchObject({
        score: null,
        rank: null,
        completeness: 0,
      });
    }
  });

  it("re-weights the Life Score among categories with data", () => {
    const body = (80 * 2 + 100) / 3;
    const expected = (55 * 25 + body * 20 + 50 * 15) / 60;
    expect(life.score).toBeCloseTo(expected, 10); // ≈ 64.31
    expect(life.rank?.key).toBe("A");
  });

  it("reports completeness as the weighted share with data", () => {
    // career 25 + body 20 + money 15 of 100.
    expect(life.completeness).toBeCloseTo(0.6, 10);
    expect(byKey(life, "body").completeness).toBe(1);
  });

  it("reports confidence separately from the score", () => {
    expect(life.confidence).toBeCloseTo(0.6, 10);
    expect(life.score).not.toBeCloseTo(life.confidence * 100);
  });

  it("explains every number: contributions add up exactly", () => {
    const categorySum = life.categories.reduce(
      (sum, c) => sum + c.lifeContribution,
      0,
    );
    expect(categorySum).toBeCloseTo(life.score!, 10);

    const metricSum = life.categories
      .flatMap((c) => c.metrics)
      .reduce((sum, m) => sum + m.lifeContribution, 0);
    expect(metricSum).toBeCloseTo(life.score!, 10);

    for (const c of life.categories.filter((c) => c.score !== null)) {
      const inCategory = c.metrics.reduce(
        (sum, m) => sum + m.categoryContribution,
        0,
      );
      expect(inCategory).toBeCloseTo(c.score!, 10);
    }
  });

  it("exposes normalised and effective weights", () => {
    const body = byKey(life, "body");
    expect(body.weightShare).toBe(0.2);
    expect(body.effectiveWeight).toBeCloseTo(20 / 60, 10);
    const running = body.metrics.find((m) => m.key === "running_km")!;
    expect(running.weightShare).toBeCloseTo(2 / 3, 10);
    expect(running.categoryContribution).toBeCloseTo(80 * (2 / 3), 10);
  });

  it("flags a metric that dominates its category", () => {
    expect(byKey(life, "body").issues).toContainEqual({
      code: "dominant_metric",
      metricKey: "running_km",
      share: 2 / 3,
    });
    // A category's only metric is not "dominating".
    expect(byKey(life, "money").issues).toEqual([]);
  });
});

describe("computeLifeScore — configuration", () => {
  it("normalises weights: only proportions matter", () => {
    const halved = DEFAULT_CATEGORIES.map((c) => ({
      ...c,
      weight: c.weight / 2,
    }));
    expect(compute({ categories: halved }).score).toBeCloseTo(
      compute().score!,
      10,
    );
  });

  it("excludes disabled categories and their weight", () => {
    const withoutMoney = DEFAULT_CATEGORIES.map((c) =>
      c.key === "money" ? { ...c, enabled: false } : c,
    );
    const life = compute({ categories: withoutMoney });
    expect(life.categories.map((c) => c.key)).not.toContain("money");
    const body = (80 * 2 + 100) / 3;
    expect(life.score).toBeCloseTo((55 * 25 + body * 20) / 45, 10);
    expect(life.completeness).toBeCloseTo(45 / 85, 10);
  });

  it("excludes disabled metrics", () => {
    const noSleep = METRICS.map((m) =>
      m.key === "sleep_hours" ? { ...m, enabled: false } : m,
    );
    const life = compute({ metrics: noSleep });
    expect(byKey(life, "body").score).toBeCloseTo(80, 10);
    expect(byKey(life, "body").metrics.map((m) => m.key)).toEqual([
      "running_km",
    ]);
  });

  it("gives zero-weight metrics no influence", () => {
    const zeroSleep = METRICS.map((m) =>
      m.key === "sleep_hours" ? { ...m, weight: 0 } : m,
    );
    const body = byKey(compute({ metrics: zeroSleep }), "body");
    expect(body.score).toBeCloseTo(80, 10);
    const sleep = body.metrics.find((m) => m.key === "sleep_hours")!;
    expect(sleep).toMatchObject({
      score: 100,
      weightShare: 0,
      categoryContribution: 0,
    });
  });

  it("does not flag empty categories as a weight problem", () => {
    const life = compute();
    expect(byKey(life, "discipline").issues).toEqual([]);
    expect(life.issues).toEqual([]);
  });

  it("flags a category whose metrics all weigh zero", () => {
    const zero = METRICS.map((m) =>
      m.categoryId === "cat-money" ? { ...m, weight: 0 } : m,
    );
    expect(byKey(compute({ metrics: zero }), "money").issues).toContainEqual({
      code: "no_weighted_items",
    });
  });

  it("returns no score when every weight is zero", () => {
    const life = compute({
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, weight: 0 })),
    });
    expect(life.score).toBeNull();
    expect(life.issues).toContainEqual({ code: "no_weighted_items" });
  });

  it("re-weights within a category when a metric is missing", () => {
    const life = compute({
      events: EVENTS.filter(
        (e) => e.metricDefinitionId !== "metric-sleep_hours",
      ),
    });
    const body = byKey(life, "body");
    expect(body.score).toBeCloseTo(80, 10);
    expect(body.completeness).toBeCloseTo(2 / 3, 10);
    expect(body.metrics.find((m) => m.key === "sleep_hours")).toMatchObject({
      status: "missing",
      effectiveWeight: 0,
      lifeContribution: 0,
    });
  });

  it("returns no Life Score at all without any data", () => {
    const life = compute({ events: [] });
    expect(life).toMatchObject({
      score: null,
      rank: null,
      completeness: 0,
      confidence: 0,
    });
  });

  it("reports enabled metrics whose category doesn't exist", () => {
    const orphan = metric({ key: "orphan", categoryId: "cat-unknown" });
    expect(compute({ metrics: [...METRICS, orphan] }).issues).toContainEqual({
      code: "metrics_without_category",
      metricKeys: ["orphan"],
    });
  });

  it("lets ratio metrics use disabled input metrics", () => {
    const life = compute({
      categories: [category({ key: "business", weight: 1 })],
      metrics: [
        metric({
          key: "contacted",
          categoryId: "cat-business",
          enabled: false,
        }),
        metric({ key: "replies", categoryId: "cat-business", enabled: false }),
        metric({
          key: "reply_rate",
          categoryId: "cat-business",
          direction: "ratio",
          config: {
            target: 0.5,
            numerator: "replies",
            denominator: "contacted",
          },
        }),
      ],
      events: [
        event("contacted", 10, daysAgo(1)),
        event("replies", 5, daysAgo(1)),
      ],
    });
    expect(life.score).toBe(100);
  });
});

describe("computeLifeScore — bounds", () => {
  it("never exceeds 100, even when everything overperforms", () => {
    const life = compute({
      events: [
        event("career_level", 99, daysAgo(1)),
        event("running_km", 500, daysAgo(1)),
        event("sleep_hours", 8, daysAgo(1)),
        event("savings", 1e9, daysAgo(1)),
      ],
    });
    expect(life.score).toBe(100);
    expect(life.rank?.key).toBe("complete");
  });

  it("never goes below 0", () => {
    const life = compute({
      events: [
        event("career_level", -5, daysAgo(1)),
        event("running_km", -50, daysAgo(1)),
        event("sleep_hours", 0, daysAgo(1)),
        event("savings", -9000, daysAgo(1)),
      ],
    });
    expect(life.score).toBe(0);
    expect(life.rank?.key).toBe("D");
  });
});

describe("computeLifeScore — invalid input", () => {
  it.each([
    [
      "duplicate metric key",
      { metrics: [...METRICS, { ...METRICS[0], id: "other-id" }] },
    ],
    [
      "duplicate metric id",
      { metrics: [...METRICS, { ...METRICS[0], key: "other_key" }] },
    ],
    [
      "duplicate category key",
      {
        categories: [...DEFAULT_CATEGORIES, category({ key: "body", id: "x" })],
      },
    ],
    [
      "negative weight",
      { categories: [category({ key: "body", weight: -1 })] },
    ],
    ["NaN weight", { metrics: [metric({ key: "m", weight: Number.NaN })] }],
  ])("throws on %s", (_name, overrides) => {
    expect(() => compute(overrides)).toThrow(ScoringInputError);
  });

  it("throws on an invalid timezone", () => {
    expect(() =>
      computeLifeScore({
        categories: DEFAULT_CATEGORIES,
        metrics: METRICS,
        events: EVENTS,
        context: { asOf: CONTEXT.asOf, timeZone: "Mars/Olympus_Mons" },
      }),
    ).toThrow("invalid timezone");
  });
});

describe("categoryExtremes", () => {
  it("finds the strongest and weakest scored categories", () => {
    const { strongest, weakest } = categoryExtremes(compute());
    expect(strongest?.key).toBe("body");
    expect(weakest?.key).toBe("money");
  });

  it("breaks ties by weight (bigger impact first)", () => {
    const life = compute({
      metrics: [
        metric({ key: "a", categoryId: "cat-career", config: { target: 10 } }),
        metric({ key: "b", categoryId: "cat-life", config: { target: 10 } }),
      ],
      events: [event("a", 5, daysAgo(1)), event("b", 5, daysAgo(1))],
    });
    const { strongest, weakest } = categoryExtremes(life);
    expect(strongest?.key).toBe("career");
    expect(weakest?.key).toBe("career");
  });

  it("returns nulls when nothing is scored", () => {
    expect(categoryExtremes(compute({ events: [] }))).toEqual({
      strongest: null,
      weakest: null,
    });
  });
});
