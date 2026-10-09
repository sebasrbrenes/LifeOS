import { describe, expect, it } from "vitest";

import {
  canPlanWeek,
  canTrackProgress,
  isClosable,
  parseLocalDate,
  resolveWeekStart,
  reviewInstants,
  weekPhase,
} from "./period";

// Monday 5 Oct – Sunday 11 Oct 2026.
const WEEK = "2026-10-05";

describe("week period rules", () => {
  it("classifies weeks relative to today", () => {
    expect(weekPhase(WEEK, "2026-10-04")).toBe("future");
    expect(weekPhase(WEEK, "2026-10-05")).toBe("current");
    expect(weekPhase(WEEK, "2026-10-11")).toBe("current");
    expect(weekPhase(WEEK, "2026-10-12")).toBe("past");
  });

  it("allows closing from the week's last day on", () => {
    expect(isClosable(WEEK, "2026-10-10")).toBe(false);
    expect(isClosable(WEEK, "2026-10-11")).toBe(true);
    expect(isClosable(WEEK, "2026-11-30")).toBe(true);
  });

  it("plans the current week and up to four ahead, never the past", () => {
    expect(canPlanWeek("2026-09-28", WEEK)).toBe(false);
    expect(canPlanWeek(WEEK, WEEK)).toBe(true);
    expect(canPlanWeek("2026-11-02", WEEK)).toBe(true);
    expect(canPlanWeek("2026-11-09", WEEK)).toBe(false);
  });

  it("tracks progress only once the week has started", () => {
    expect(canTrackProgress(WEEK, "2026-10-04")).toBe(false);
    expect(canTrackProgress(WEEK, "2026-10-05")).toBe(true);
    expect(canTrackProgress(WEEK, "2026-12-01")).toBe(true);
  });

  it("resolves ?w= to the week containing that date", () => {
    expect(resolveWeekStart("2026-10-08", 1, "2026-10-20")).toBe(WEEK);
    expect(resolveWeekStart("2026-10-08", 0, "2026-10-20")).toBe("2026-10-04");
    expect(resolveWeekStart(undefined, 1, "2026-10-08")).toBe(WEEK);
    expect(resolveWeekStart("garbage", 1, "2026-10-08")).toBe(WEEK);
    expect(resolveWeekStart("2026-02-30", 1, "2026-10-08")).toBe(WEEK);
  });

  it("parses only real dates", () => {
    expect(parseLocalDate("2026-10-05")).toBe("2026-10-05");
    expect(parseLocalDate("2026-13-01")).toBeNull();
    expect(parseLocalDate(["2026-10-05"])).toBeNull();
    expect(parseLocalDate("1999-12-31")).toBeNull();
  });

  it("compares the state before the week with its end, or now", () => {
    const after = reviewInstants(WEEK, "UTC", new Date("2026-10-20T00:00Z"));
    expect(after.start.toISOString()).toBe("2026-10-04T23:59:59.999Z");
    expect(after.end.toISOString()).toBe("2026-10-11T23:59:59.999Z");

    const lastDay = new Date("2026-10-11T18:00Z");
    expect(reviewInstants(WEEK, "UTC", lastDay).end).toBe(lastDay);

    const bogota = reviewInstants(WEEK, "America/Bogota", lastDay);
    expect(bogota.start.toISOString()).toBe("2026-10-05T04:59:59.999Z");
  });
});
