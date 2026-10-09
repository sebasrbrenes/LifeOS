import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  endOfLocalDay,
  endOfWeek,
  evaluationWindow,
  isValidTimeZone,
  isWithinWindow,
  localDate,
  localDateToInstant,
  startOfLocalDay,
  startOfWeek,
} from "./time";

describe("localDate", () => {
  it("uses the user's timezone, not UTC", () => {
    // 02:30 UTC on Oct 7 is still Oct 6 in Bogotá (UTC-5).
    const instant = new Date("2026-10-07T02:30:00Z");
    expect(localDate(instant, "UTC")).toBe("2026-10-07");
    expect(localDate(instant, "America/Bogota")).toBe("2026-10-06");
    expect(localDate(instant, "Asia/Tokyo")).toBe("2026-10-07");
  });

  it("handles the exact local midnight boundary", () => {
    // Madrid is UTC+2 in summer time: local midnight Oct 7 = 22:00Z Oct 6.
    expect(
      localDate(new Date("2026-10-06T21:59:59.999Z"), "Europe/Madrid"),
    ).toBe("2026-10-06");
    expect(localDate(new Date("2026-10-06T22:00:00Z"), "Europe/Madrid")).toBe(
      "2026-10-07",
    );
  });

  it("handles DST transitions", () => {
    // Madrid leaves summer time on 2026-10-25 (03:00 → 02:00).
    expect(localDate(new Date("2026-10-24T22:30:00Z"), "Europe/Madrid")).toBe(
      "2026-10-25",
    );
    expect(localDate(new Date("2026-10-25T23:30:00Z"), "Europe/Madrid")).toBe(
      "2026-10-26",
    );
  });
});

describe("date arithmetic", () => {
  it.each([
    ["2026-10-06", -6, "2026-09-30"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2024-03-01", -1, "2024-02-29"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-10-25", 1, "2026-10-26"],
  ])("addDays(%s, %d) = %s", (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-10-01", "2026-10-07")).toBe(6);
    expect(daysBetween("2026-10-07", "2026-10-01")).toBe(-6);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("evaluationWindow", () => {
  const asOf = new Date("2026-10-07T12:00:00Z");

  it.each([
    ["daily", "2026-10-07", "2026-10-07"],
    ["weekly", "2026-10-01", "2026-10-07"],
    ["monthly", "2026-09-08", "2026-10-07"],
    ["quarterly", "2026-07-09", "2026-10-07"],
    ["yearly", "2025-10-08", "2026-10-07"],
  ] as const)("%s covers %s → %s inclusive", (period, from, to) => {
    expect(evaluationWindow(period, asOf, "UTC")).toEqual({ from, to });
  });

  it("all_time has no start", () => {
    expect(evaluationWindow("all_time", asOf, "UTC")).toEqual({
      from: null,
      to: "2026-10-07",
    });
  });

  it("ends on the local date of asOf", () => {
    const lateNightBogota = new Date("2026-10-07T03:00:00Z");
    expect(
      evaluationWindow("weekly", lateNightBogota, "America/Bogota"),
    ).toEqual({
      from: "2026-09-30",
      to: "2026-10-06",
    });
  });

  it("checks membership inclusively", () => {
    const window = { from: "2026-10-01", to: "2026-10-07" };
    expect(isWithinWindow("2026-10-01", window)).toBe(true);
    expect(isWithinWindow("2026-10-07", window)).toBe(true);
    expect(isWithinWindow("2026-09-30", window)).toBe(false);
    expect(isWithinWindow("2026-10-08", window)).toBe(false);
    expect(isWithinWindow("1999-01-01", { from: null, to: "2026-10-07" })).toBe(
      true,
    );
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects garbage", () => {
    expect(isValidTimeZone("America/Bogota")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});

describe("startOfWeek", () => {
  // 2026-10-07 is a Wednesday.
  it.each([
    [1, "2026-10-05"], // Monday start
    [0, "2026-10-04"], // Sunday start
    [3, "2026-10-07"], // Wednesday start: same day
    [4, "2026-10-01"], // Thursday start: previous Thursday
  ])("week starting on day %d → %s", (weekStartsOn, expected) => {
    expect(startOfWeek("2026-10-07", weekStartsOn)).toBe(expected);
  });

  it("crosses month and year boundaries", () => {
    expect(startOfWeek("2027-01-01", 1)).toBe("2026-12-28");
  });
});

describe("localDateToInstant", () => {
  const now = new Date("2026-10-07T14:30:00Z");

  it("uses now for today so morning entries aren't in the future", () => {
    expect(localDateToInstant("2026-10-07", "UTC", now)).toBe(now);
    const earlyBogota = new Date("2026-10-07T12:00:00Z"); // 07:00 in Bogotá
    expect(
      localDateToInstant("2026-10-07", "America/Bogota", earlyBogota),
    ).toBe(earlyBogota);
  });

  it("uses local noon for past dates", () => {
    expect(localDateToInstant("2026-10-03", "UTC", now).toISOString()).toBe(
      "2026-10-03T12:00:00.000Z",
    );
    expect(
      localDateToInstant("2026-10-03", "America/Bogota", now).toISOString(),
    ).toBe("2026-10-03T17:00:00.000Z");
    expect(
      localDateToInstant("2026-07-01", "Europe/Madrid", now).toISOString(),
    ).toBe("2026-07-01T10:00:00.000Z");
    expect(
      localDateToInstant("2026-01-15", "Europe/Madrid", now).toISOString(),
    ).toBe("2026-01-15T11:00:00.000Z");
  });

  it("always round-trips to the same local date", () => {
    for (const zone of [
      "Pacific/Kiritimati",
      "Pacific/Pago_Pago",
      "Asia/Kolkata",
      "Europe/Madrid",
    ]) {
      for (const date of [
        "2026-03-29",
        "2026-10-25",
        "2026-06-15",
        "2026-12-31",
      ]) {
        expect(localDate(localDateToInstant(date, zone, now), zone)).toBe(date);
      }
    }
  });
});

describe("local day boundaries", () => {
  it("finds local midnight", () => {
    expect(startOfLocalDay("2026-10-05", "UTC").toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
    expect(startOfLocalDay("2026-10-05", "America/Bogota").toISOString()).toBe(
      "2026-10-05T05:00:00.000Z",
    );
    expect(startOfLocalDay("2026-10-05", "Asia/Kolkata").toISOString()).toBe(
      "2026-10-04T18:30:00.000Z",
    );
    expect(endOfLocalDay("2026-10-11", "UTC").toISOString()).toBe(
      "2026-10-11T23:59:59.999Z",
    );
  });

  it("handles a day that starts at 01:00 because of DST", () => {
    // Chile skips 00:00–01:00 on 6 Sep 2026.
    const start = startOfLocalDay("2026-09-06", "America/Santiago");
    expect(localDate(start, "America/Santiago")).toBe("2026-09-06");
    expect(localDate(new Date(start.getTime() - 1), "America/Santiago")).toBe(
      "2026-09-05",
    );
  });

  it("is always the boundary between two local dates", () => {
    for (const zone of [
      "Pacific/Kiritimati",
      "Pacific/Pago_Pago",
      "Asia/Kolkata",
      "Europe/Madrid",
      "America/Santiago",
      "America/Havana",
    ]) {
      for (const date of [
        "2026-03-08",
        "2026-03-29",
        "2026-04-05",
        "2026-09-06",
        "2026-10-25",
        "2026-11-01",
        "2026-12-31",
      ]) {
        const start = startOfLocalDay(date, zone);
        expect(localDate(start, zone)).toBe(date);
        expect(localDate(new Date(start.getTime() - 1), zone)).toBe(
          addDays(date, -1),
        );
        expect(localDate(endOfLocalDay(date, zone), zone)).toBe(date);
      }
    }
  });

  it("gives the last day of a week", () => {
    expect(endOfWeek("2026-12-28")).toBe("2027-01-03");
  });
});
