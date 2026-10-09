import { describe, expect, it } from "vitest";

import { parseSourceForm } from "./source-form";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseSourceForm", () => {
  it("returns to manual entry", () => {
    expect(parseSourceForm(form({ sourceMetric: "manual" }))).toEqual({
      ok: true,
      values: { source: "manual", sourceMetric: null, sourceFilter: {} },
    });
  });

  it("links a Strava metric with optional sport types", () => {
    expect(
      parseSourceForm(
        form({
          sourceMetric: "strava.run_distance_km",
          sportTypes: "Run, TrailRun, Run",
        }),
      ),
    ).toEqual({
      ok: true,
      values: {
        source: "strava",
        sourceMetric: "strava.run_distance_km",
        sourceFilter: { sportTypes: ["Run", "TrailRun"] },
      },
    });
    expect(
      parseSourceForm(
        form({ sourceMetric: "strava.run_count", sportTypes: "" }),
      ),
    ).toMatchObject({ ok: true, values: { sourceFilter: {} } });
  });

  it("links a calendar metric with a title filter and calendars", () => {
    expect(
      parseSourceForm(
        form({
          sourceMetric: "google_calendar.planned_minutes",
          titleContains: "  QA ",
          calendarIds: "primary\nestudio@group.calendar.google.com",
        }),
      ),
    ).toEqual({
      ok: true,
      values: {
        source: "google_calendar",
        sourceMetric: "google_calendar.planned_minutes",
        sourceFilter: {
          calendarIds: ["primary", "estudio@group.calendar.google.com"],
          titleContains: "QA",
        },
      },
    });
  });

  it("rejects unknown sources and oversized filters", () => {
    expect(
      parseSourceForm(form({ sourceMetric: "fitbit.steps" })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { sourceMetric: expect.any(String) },
    });
    expect(
      parseSourceForm(
        form({
          sourceMetric: "google_calendar.planned_minutes",
          titleContains: "x".repeat(81),
        }),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { sourceFilter: expect.any(String) },
    });
  });
});
