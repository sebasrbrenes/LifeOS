import { describe, expect, it } from "vitest";

import { buildScoreConfiguration } from "./configuration";
import {
  applyConfiguration,
  compareLifeScores,
  instantForDate,
  lifeScoreAsOf,
  lifeScoreHistory,
  sampleDates,
  versionAt,
  type HistoryInputs,
  type StoredScoreVersion,
} from "./history";
import { computeLifeScore } from "./life-score";
import { category, event, metric } from "./test-utils";

const at = (iso: string) => new Date(iso);
const categories = [
  category({ key: "body", weight: 50 }),
  category({ key: "money", weight: 50 }),
];
const runs = metric({
  key: "runs",
  categoryId: "cat-body",
  config: { target: 10 },
  unit: "km",
});
const savings = metric({
  key: "savings",
  categoryId: "cat-money",
  period: "all_time",
  aggregation: "latest",
  config: { target: 1000 },
});

// v1 (until 1 Sep): runs target 10, body/money 50/50.
// v2 (from 1 Sep): runs target 20, body 80 / money 20.
const v1Config = buildScoreConfiguration(categories, [runs, savings]);
const v2Config = buildScoreConfiguration(
  [
    { ...categories[0], weight: 80 },
    { ...categories[1], weight: 20 },
  ],
  [{ ...runs, config: { target: 20 } }, savings],
);
const versions: StoredScoreVersion[] = [
  {
    id: "v2",
    version: 2,
    effectiveFrom: at("2026-09-01T00:00:00Z"),
    effectiveTo: null,
    configuration: v2Config,
  },
  {
    id: "v1",
    version: 1,
    effectiveFrom: at("2026-08-01T00:00:00Z"),
    effectiveTo: at("2026-09-01T00:00:00Z"),
    configuration: v1Config,
  },
];

// Today's definitions are v2's.
const inputs: HistoryInputs = {
  categories: [
    { ...categories[0], weight: 80 },
    { ...categories[1], weight: 20 },
  ],
  metrics: [{ ...runs, config: { target: 20 } }, savings],
  events: [
    event("runs", 10, at("2026-08-20T12:00:00Z")),
    event("runs", 10, at("2026-09-20T12:00:00Z")),
    event("savings", 500, at("2026-08-10T12:00:00Z")),
  ],
  versions,
  timeZone: "UTC",
};

describe("versionAt", () => {
  it("picks the version in force", () => {
    expect(versionAt(versions, at("2026-08-15T00:00:00Z"))?.id).toBe("v1");
    expect(versionAt(versions, at("2026-09-01T00:00:00Z"))?.id).toBe("v2");
    expect(versionAt(versions, at("2027-01-01T00:00:00Z"))?.id).toBe("v2");
  });

  it("uses the first version for backdated history", () => {
    expect(versionAt(versions, at("2025-01-01T00:00:00Z"))?.id).toBe("v1");
    expect(versionAt([], at("2025-01-01T00:00:00Z"))).toBeNull();
  });
});

describe("history replays the rules of each date", () => {
  it("scores August with v1 and September with v2", () => {
    const august = lifeScoreAsOf(inputs, at("2026-08-21T00:00:00Z"));
    // v1: runs 10/10 → 100, savings 50, weights 50/50 → 75.
    expect(august.versionId).toBe("v1");
    expect(august.basis).toBe("historical");
    expect(august.life.score).toBe(75);

    const september = lifeScoreAsOf(inputs, at("2026-09-21T00:00:00Z"));
    // v2: runs 10/20 → 50, savings 50, weights 80/20 → 50.
    expect(september.versionId).toBe("v2");
    expect(september.life.score).toBe(50);
  });

  it("is not rewritten by today's configuration", () => {
    const today = computeLifeScore({
      categories: inputs.categories,
      metrics: inputs.metrics,
      events: inputs.events,
      context: { asOf: at("2026-08-21T00:00:00Z"), timeZone: "UTC" },
    });
    expect(today.score).not.toBe(75); // what history would wrongly show
  });

  it("falls back to today's rules, flagged, when a version can't be replayed", () => {
    const broken = lifeScoreAsOf(
      {
        ...inputs,
        versions: [{ ...versions[1], configuration: { engineVersion: 999 } }],
      },
      at("2026-08-21T00:00:00Z"),
    );
    expect(broken.basis).toBe("current");
    expect(broken.life.score).not.toBeNull();
  });

  it("leaves out metrics created after the version", () => {
    const later = metric({ key: "later", categoryId: "cat-body" });
    const applied = applyConfiguration(v1Config, inputs.categories, [
      ...inputs.metrics,
      later,
    ]);
    expect(applied.metrics.map((m) => m.key).sort()).toEqual([
      "runs",
      "savings",
    ]);
    expect(applied.metrics.find((m) => m.key === "runs")?.config).toEqual({
      target: 10,
    });
    expect(applied.categories.map((c) => c.weight)).toEqual([50, 50]);
  });

  it("includes backdated values of metrics created later, with their first rules", () => {
    const study = metric({
      key: "study",
      categoryId: "cat-body",
      config: { target: 4 },
    });
    // Created 1 Oct (v3); values entered dated 20 Aug.
    const v3: StoredScoreVersion = {
      id: "v3",
      version: 3,
      effectiveFrom: at("2026-10-01T00:00:00Z"),
      effectiveTo: null,
      configuration: buildScoreConfiguration(inputs.categories, [
        ...inputs.metrics,
        study,
      ]),
    };
    const withStudy: HistoryInputs = {
      ...inputs,
      metrics: [...inputs.metrics, { ...study, config: { target: 8 } }],
      events: [...inputs.events, event("study", 2, at("2026-08-20T12:00:00Z"))],
      versions: [
        { ...versions[0], effectiveTo: at("2026-10-01T00:00:00Z") },
        versions[1],
        v3,
      ],
    };
    const august = lifeScoreAsOf(withStudy, at("2026-08-21T00:00:00Z"));
    expect(august.versionId).toBe("v1");
    const body = august.life.categories.find((c) => c.key === "body")!;
    const studyScore = body.metrics.find((m) => m.key === "study");
    // v3's target (4), not today's (8): 2/4 → 50. Runs stays on v1 (100).
    expect(studyScore?.score).toBe(50);
    expect(body.score).toBe(75);
  });

  it("treats categories unknown to the version as disabled", () => {
    const applied = applyConfiguration(
      v1Config,
      [...inputs.categories, category({ key: "life", weight: 10 })],
      inputs.metrics,
    );
    expect(applied.categories.find((c) => c.key === "life")).toMatchObject({
      enabled: false,
      weight: 0,
    });
  });
});

describe("lifeScoreHistory", () => {
  it("produces one point per date, with no fake zeros before data", () => {
    const points = lifeScoreHistory(
      inputs,
      ["2026-07-01", "2026-08-21", "2026-09-21"],
      at("2026-09-21T12:00:00Z"),
      "2026-09-21",
    );
    expect(points.map((p) => p.lifeScore)).toEqual([null, 75, 50]);
    expect(points[1].categories["cat-body"]).toBe(100);
  });

  it("scores today at now and past dates at their end", () => {
    const now = at("2026-09-21T08:00:00Z");
    expect(instantForDate("2026-09-21", "UTC", now, "2026-09-21")).toBe(now);
    expect(
      instantForDate("2026-09-20", "UTC", now, "2026-09-21").toISOString(),
    ).toBe("2026-09-20T23:59:59.999Z");
  });
});

describe("sampleDates", () => {
  it("keeps every day when it fits", () => {
    expect(sampleDates("2026-09-01", "2026-09-05", 30)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });

  it("thins long ranges and always ends on the last date", () => {
    const dates = sampleDates("2025-09-21", "2026-09-21", 100);
    expect(dates.length).toBeLessThanOrEqual(100);
    expect(dates.at(-1)).toBe("2026-09-21");
    expect(dates[0] >= "2025-09-21").toBe(true);
  });

  it("is empty for inverted ranges", () => {
    expect(sampleDates("2026-09-05", "2026-09-01", 10)).toEqual([]);
  });
});

describe("compareLifeScores", () => {
  it("compares scores and raw values between two dates", () => {
    const before = lifeScoreAsOf(inputs, at("2026-08-21T00:00:00Z")).life;
    const after = lifeScoreAsOf(inputs, at("2026-09-21T00:00:00Z")).life;
    const comparison = compareLifeScores(before, after);
    expect(comparison.life).toMatchObject({
      before: 75,
      after: 50,
      delta: -25,
    });
    expect(
      comparison.categories.find((c) => c.id === "cat-body"),
    ).toMatchObject({ before: 100, after: 50, delta: -50 });
    expect(comparison.metrics.find((m) => m.name === "runs")).toMatchObject({
      unit: "km",
      valueBefore: 10,
      valueAfter: 10,
      before: 100,
      after: 50,
    });
  });
});
