import { describe, expect, it } from "vitest";

import {
  buildWeeklyReview,
  computeLifeScore,
  computeWeekScore,
} from "@/lib/scoring";

import { parseReviewSummary } from "./summary";

const empty = computeLifeScore({
  categories: [],
  metrics: [],
  events: [],
  context: { asOf: new Date("2026-10-11T12:00:00Z"), timeZone: "UTC" },
});

describe("parseReviewSummary", () => {
  it("reads back what buildWeeklyReview stores", () => {
    const summary = buildWeeklyReview({
      lifeStart: empty,
      lifeEnd: empty,
      week: computeWeekScore([]),
    });
    const stored = JSON.parse(JSON.stringify(summary));
    expect(parseReviewSummary(stored)).toEqual(summary);
  });

  it("rejects malformed or foreign JSON", () => {
    expect(parseReviewSummary({})).toBeNull();
    expect(parseReviewSummary(null)).toBeNull();
    expect(parseReviewSummary({ summaryVersion: 99 })).toBeNull();
  });
});
