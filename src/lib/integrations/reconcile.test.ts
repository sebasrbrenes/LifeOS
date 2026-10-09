import { describe, expect, it } from "vitest";

import {
  matchesFilter,
  parseSourceFilter,
  planReconciliation,
  type LinkedMetric,
  type StoredEvent,
} from "./reconcile";
import type { NormalizedRecord } from "./types";

const WINDOW = new Date("2026-09-01T00:00:00Z");
const at = (iso: string) => new Date(iso);

function record(
  id: string,
  value: number,
  overrides: Partial<NormalizedRecord> = {},
): NormalizedRecord {
  return {
    sourceMetric: "strava.run_distance_km",
    occurredAt: at("2026-09-10T07:00:00Z"),
    value,
    externalRecordId: id,
    attributes: { sportType: "Run" },
    ...overrides,
  };
}

const km: LinkedMetric = {
  id: "m-km",
  sourceMetric: "strava.run_distance_km",
  sourceFilter: {},
};

function stored(
  id: string,
  externalRecordId: string,
  value: number,
  overrides: Partial<StoredEvent> = {},
): StoredEvent {
  return {
    id,
    metricDefinitionId: "m-km",
    externalRecordId,
    value,
    occurredAt: at("2026-09-10T07:00:00Z"),
    ...overrides,
  };
}

describe("planReconciliation", () => {
  it("inserts new records", () => {
    const plan = planReconciliation({
      records: [record("a", 10)],
      metrics: [km],
      stored: [],
      windowStart: WINDOW,
    });
    expect(plan.inserts).toEqual([
      {
        metricDefinitionId: "m-km",
        externalRecordId: "a",
        value: 10,
        occurredAt: at("2026-09-10T07:00:00Z"),
      },
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it("is idempotent: a second sync changes nothing", () => {
    const plan = planReconciliation({
      records: [record("a", 10)],
      metrics: [km],
      stored: [stored("e1", "a", 10)],
      windowStart: WINDOW,
    });
    expect(plan).toEqual({
      inserts: [],
      updates: [],
      deletes: [],
      invalidFilters: [],
    });
  });

  it("updates edited activities and deletes ones removed from the provider", () => {
    const plan = planReconciliation({
      records: [record("a", 12)],
      metrics: [km],
      stored: [stored("e1", "a", 10), stored("e2", "gone", 5)],
      windowStart: WINDOW,
    });
    expect(plan.updates).toEqual([
      expect.objectContaining({ id: "e1", value: 12 }),
    ]);
    expect(plan.deletes).toEqual(["e2"]);
  });

  it("never touches events outside the window or of unlinked metrics", () => {
    const plan = planReconciliation({
      records: [],
      metrics: [km],
      stored: [
        stored("old", "x", 5, { occurredAt: at("2026-08-01T00:00:00Z") }),
        stored("other", "y", 5, { metricDefinitionId: "m-unlinked" }),
      ],
      windowStart: WINDOW,
    });
    expect(plan.deletes).toEqual([]);
  });

  it("feeds every linked metric, applying each one's filter", () => {
    const trail: LinkedMetric = {
      id: "m-trail",
      sourceMetric: "strava.run_distance_km",
      sourceFilter: { sportTypes: ["TrailRun"] },
    };
    const plan = planReconciliation({
      records: [
        record("road", 10),
        record("trail", 15, { attributes: { sportType: "TrailRun" } }),
      ],
      metrics: [km, trail],
      stored: [],
      windowStart: WINDOW,
    });
    expect(
      plan.inserts.map((w) => `${w.metricDefinitionId}:${w.externalRecordId}`),
    ).toEqual(["m-km:road", "m-km:trail", "m-trail:trail"]);
  });

  it("skips metrics with an invalid filter and says so", () => {
    const plan = planReconciliation({
      records: [record("a", 10)],
      metrics: [{ ...km, sourceFilter: { unknown: true } }],
      stored: [stored("e1", "a", 10)],
      windowStart: WINDOW,
    });
    expect(plan.invalidFilters).toEqual(["m-km"]);
    expect(plan.inserts).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });
});

describe("source filters", () => {
  it("match titles case-insensitively and calendars exactly", () => {
    const event = record("e", 60, {
      sourceMetric: "google_calendar.planned_minutes",
      attributes: { calendarId: "primary", title: "Estudio QA: Playwright" },
    });
    expect(matchesFilter(event, { titleContains: "qa" })).toBe(true);
    expect(matchesFilter(event, { titleContains: "gym" })).toBe(false);
    expect(matchesFilter(event, { calendarIds: ["work"] })).toBe(false);
  });

  it("validates the stored shape", () => {
    expect(parseSourceFilter(null)).toEqual({});
    expect(parseSourceFilter({ sportTypes: ["Run"] })).toEqual({
      sportTypes: ["Run"],
    });
    expect(parseSourceFilter({ sportTypes: "Run" })).toBeNull();
  });
});
