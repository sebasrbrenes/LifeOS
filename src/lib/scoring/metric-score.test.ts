import { describe, expect, it } from "vitest";

import { aggregate, dedupeEvents, scoreMetric } from "./metric-score";
import {
  AS_OF,
  CONTEXT,
  daysAgo,
  event,
  eventsMap,
  metric,
} from "./test-utils";
import type {
  MetricDefinitionInput,
  MetricEventInput,
  ScoreContext,
} from "./types";

function score(
  definition: MetricDefinitionInput,
  events: MetricEventInput[] = [],
  context: ScoreContext = CONTEXT,
  others: MetricDefinitionInput[] = [],
) {
  const all = [definition, ...others];
  return scoreMetric(definition, {
    eventsByMetricId: eventsMap(events),
    definitionsByKey: new Map(all.map((item) => [item.key, item])),
    context,
  });
}

describe("aggregate", () => {
  const events = [
    event("x", 3, daysAgo(2)),
    event("x", 1, daysAgo(1)),
    event("x", 8, daysAgo(3)),
  ];

  it.each([
    ["sum", 12],
    ["avg", 4],
    ["min", 1],
    ["max", 8],
    ["latest", 1],
    ["count", 3],
  ] as const)("%s", (aggregation, expected) => {
    expect(aggregate(events, aggregation)).toBe(expected);
  });

  it("returns null for value aggregations over no values", () => {
    expect(aggregate([], "sum")).toBeNull();
    expect(aggregate([event("x", null)], "avg")).toBeNull();
    expect(aggregate([], "count")).toBe(0);
  });

  it("counts events even without values", () => {
    expect(aggregate([event("x", null), event("x", null)], "count")).toBe(2);
  });
});

describe("dedupeEvents", () => {
  it("drops repeated ids and repeated external records", () => {
    const a = event("runs", 5, daysAgo(1), {
      source: "strava",
      externalRecordId: "act-1",
    });
    const sameRecord = event("runs", 5, daysAgo(1), {
      source: "strava",
      externalRecordId: "act-1",
    });
    const otherRecord = event("runs", 7, daysAgo(1), {
      source: "strava",
      externalRecordId: "act-2",
    });
    const manual = event("runs", 2, daysAgo(1));
    const result = dedupeEvents([a, a, sameRecord, otherRecord, manual]);
    expect(result.events).toEqual([a, otherRecord, manual]);
    expect(result.duplicates).toBe(2);
  });

  it("treats the same external id from different sources as different", () => {
    const strava = event("runs", 5, AS_OF, {
      source: "strava",
      externalRecordId: "1",
    });
    const github = event("runs", 5, AS_OF, {
      source: "github",
      externalRecordId: "1",
    });
    expect(dedupeEvents([strava, github]).duplicates).toBe(0);
  });
});

describe("scoreMetric", () => {
  const running = metric({
    key: "running_km",
    config: { target: 15 },
    unit: "km",
  });

  it("scores the spec example: 12 of 15 weekly km → 80", () => {
    const result = score(running, [
      event("running_km", 5, daysAgo(1)),
      event("running_km", 7, daysAgo(3)),
    ]);
    expect(result).toMatchObject({
      status: "scored",
      value: 12,
      eventCount: 2,
      freshness: "fresh",
      confidence: 1,
      window: { from: "2026-10-01", to: "2026-10-07" },
    });
    expect(result.score).toBeCloseTo(80);
  });

  it("only counts events inside the trailing window", () => {
    const result = score(running, [
      event("running_km", 10, daysAgo(6)), // 2026-10-01: inside
      event("running_km", 99, daysAgo(7)), // 2026-09-30: outside
    ]);
    expect(result.value).toBe(10);
  });

  it("does not count the same imported activity twice", () => {
    const activity = { source: "strava" as const, externalRecordId: "act-9" };
    const result = score(running, [
      event("running_km", 6, daysAgo(1), activity),
      event("running_km", 6, daysAgo(1), activity),
    ]);
    expect(result.value).toBe(6);
    expect(result.issues).toContainEqual({
      code: "duplicate_events_ignored",
      count: 1,
    });
  });

  it("ignores events after asOf (future-dated entries)", () => {
    const result = score(running, [
      event("running_km", 5, daysAgo(1)),
      event("running_km", 50, new Date(AS_OF.getTime() + 60_000)),
    ]);
    expect(result.value).toBe(5);
    expect(result.issues).toContainEqual({
      code: "future_events_ignored",
      count: 1,
    });
  });

  it("caps overperformance and reports it", () => {
    const result = score(running, [event("running_km", 30, daysAgo(1))]);
    expect(result.score).toBe(100);
    expect(result.issues).toContainEqual({
      code: "overperformance_capped",
      rawScore: 200,
    });
  });

  describe("missing data is not zero", () => {
    it("never-recorded metric is missing, not 0", () => {
      const result = score(running, []);
      expect(result).toMatchObject({
        status: "missing",
        score: null,
        value: null,
        freshness: "missing",
        confidence: 0,
      });
      expect(result.issues).toContainEqual({ code: "never_recorded" });
    });

    it("an empty window after earlier activity counts as 0 for totals", () => {
      const result = score(running, [event("running_km", 10, daysAgo(10))]);
      expect(result).toMatchObject({ status: "scored", value: 0, score: 0 });
      expect(result.issues).toContainEqual({
        code: "empty_window_counted_as_zero",
      });
      expect(result.freshness).toBe("delayed");
      expect(result.confidence).toBe(0.75);
    });

    it("an empty window is missing for averages and balances", () => {
      const sleep = metric({
        key: "sleep",
        direction: "target_range",
        aggregation: "avg",
        config: { targetMin: 7, targetMax: 9 },
      });
      const result = score(sleep, [event("sleep", 8, daysAgo(10))]);
      expect(result).toMatchObject({ status: "missing", score: null });
      expect(result.issues).toContainEqual({ code: "no_data_in_window" });
    });

    it("emptyWindow: missing overrides the totals default", () => {
      const strict = metric({
        key: "running_km",
        config: { target: 15, emptyWindow: "missing" },
      });
      expect(score(strict, [event("running_km", 10, daysAgo(10))]).status).toBe(
        "missing",
      );
    });

    it("emptyWindow: zero can be opted into for other aggregations", () => {
      const lenient = metric({
        key: "satisfaction",
        aggregation: "avg",
        config: { target: 10, emptyWindow: "zero" },
      });
      expect(
        score(lenient, [event("satisfaction", 8, daysAgo(30))]).score,
      ).toBe(0);
    });

    it("a broken integration makes its metrics missing, never 0", () => {
      const strava = metric({
        key: "running_km",
        sourcePreference: "strava",
        config: { target: 15 },
      });
      const result = score(strava, [event("running_km", 10, daysAgo(10))], {
        ...CONTEXT,
        unavailableSources: ["strava"],
      });
      expect(result).toMatchObject({
        status: "missing",
        score: null,
        freshness: "error",
      });
      expect(result.issues).toContainEqual({
        code: "source_unavailable",
        source: "strava",
      });
    });

    it("events without a numeric value are ignored, not read as 0", () => {
      const result = score(running, [event("running_km", null, daysAgo(1))]);
      expect(result.status).toBe("missing");
      expect(result.issues).toContainEqual({
        code: "events_without_value_ignored",
        count: 1,
      });
    });
  });

  it("marks an invalid config as an error without throwing", () => {
    const broken = metric({ key: "broken", config: { target: -1 } });
    const result = score(broken, [event("broken", 5)]);
    expect(result).toMatchObject({
      status: "error",
      score: null,
      freshness: "error",
    });
    expect(result.issues[0]).toMatchObject({ code: "invalid_config" });
  });

  describe("all-time balances", () => {
    const savings = metric({
      key: "savings",
      period: "all_time",
      aggregation: "latest",
      config: { target: 5000 },
    });

    it("uses the latest value regardless of age", () => {
      const result = score(savings, [
        event("savings", 1000, daysAgo(200)),
        event("savings", 2500, daysAgo(40)),
      ]);
      expect(result.value).toBe(2500);
      expect(result.score).toBe(50);
    });

    it.each([
      [5, "fresh", 1],
      [45, "delayed", 0.75],
      [120, "stale", 0.5],
    ] as const)("a value %d days old is %s", (age, freshness, confidence) => {
      const result = score(savings, [event("savings", 2500, daysAgo(age))]);
      expect(result.freshness).toBe(freshness);
      expect(result.confidence).toBe(confidence);
      // Freshness never changes the score itself (spec §35).
      expect(result.score).toBe(50);
    });
  });

  it("averages event confidence into metric confidence", () => {
    const result = score(running, [
      event("running_km", 5, daysAgo(1), { confidence: 1 }),
      event("running_km", 5, daysAgo(2), { confidence: 0.5 }),
    ]);
    expect(result.confidence).toBe(0.75);
  });

  it("evaluates windows in the user's timezone", () => {
    // 03:00Z on Oct 1 is still Sep 30 in Bogotá → outside the weekly window.
    const edge = event("running_km", 10, new Date("2026-10-01T03:00:00Z"));
    expect(score(running, [edge], { asOf: AS_OF, timeZone: "UTC" }).value).toBe(
      10,
    );
    expect(
      score(running, [edge], { asOf: AS_OF, timeZone: "America/Bogota" }).value,
    ).toBe(0);
  });

  describe("ratio of two metrics", () => {
    const contacted = metric({ key: "contacted", categoryId: "cat-business" });
    const positive = metric({
      key: "positive_replies",
      categoryId: "cat-business",
    });
    const replyRate = metric({
      key: "reply_rate",
      categoryId: "cat-business",
      direction: "ratio",
      aggregation: "latest",
      config: {
        target: 0.1,
        numerator: "positive_replies",
        denominator: "contacted",
        minDenominator: 20,
      },
    });

    it("divides the referenced metrics over the same window", () => {
      const result = score(
        replyRate,
        [
          event("contacted", 30, daysAgo(1)),
          event("contacted", 10, daysAgo(2)),
          event("positive_replies", 3, daysAgo(1)),
          event("contacted", 500, daysAgo(20)), // outside the window
        ],
        CONTEXT,
        [contacted, positive],
      );
      expect(result).toMatchObject({
        status: "scored",
        value: 0.075,
        ratio: { numerator: 3, denominator: 40 },
        freshness: "fresh",
      });
      expect(result.score).toBeCloseTo(75);
    });

    it("refuses to score a sample that is too small", () => {
      const result = score(
        replyRate,
        [
          event("contacted", 5, daysAgo(1)),
          event("positive_replies", 5, daysAgo(1)),
        ],
        CONTEXT,
        [contacted, positive],
      );
      expect(result).toMatchObject({
        status: "missing",
        score: null,
        ratio: { numerator: 5, denominator: 5 },
      });
      expect(result.issues).toContainEqual({
        code: "insufficient_sample",
        denominator: 5,
        minDenominator: 20,
      });
    });

    it("errors on unknown referenced metrics", () => {
      const result = score(replyRate, [], CONTEXT, [contacted]);
      expect(result.status).toBe("error");
      expect(result.issues).toEqual([
        { code: "unknown_ratio_metric", key: "positive_replies" },
      ]);
    });

    it("can score a ratio entered directly", () => {
      const savingsRate = metric({
        key: "savings_rate",
        direction: "ratio",
        aggregation: "latest",
        period: "monthly",
        config: { target: 0.2 },
      });
      expect(
        score(savingsRate, [event("savings_rate", 0.15, daysAgo(3))]).score,
      ).toBeCloseTo(75);
    });
  });
});
