import { describe, expect, it } from "vitest";

import {
  formatDaysAgo,
  formatDelta,
  formatLocalDate,
  formatNumber,
  formatShare,
  formatWeekRange,
  parseDecimal,
} from "./format";

describe("formatting", () => {
  it("formats numbers in Spanish", () => {
    expect(formatNumber(1234.5)).toBe("1234,5");
    expect(formatNumber(12345.678)).toBe("12.345,68");
    expect(formatNumber(-0)).toBe("0");
    expect(formatShare(0.823)).toBe("82 %");
  });

  it("signs deltas with a true minus", () => {
    expect(formatDelta(4.24)).toBe("+4,2");
    expect(formatDelta(-1.3)).toBe("−1,3");
    expect(formatDelta(0)).toBe("0");
  });

  it("formats local dates without timezone drift", () => {
    expect(formatLocalDate("2026-10-06")).toBe("6 oct 2026");
  });

  it.each([
    [0, "hoy"],
    [1, "ayer"],
    [5, "hace 5 días"],
    [90, "hace 3 meses"],
    [800, "hace 2 años"],
  ])("%d days → %s", (days, text) => {
    expect(formatDaysAgo(days)).toBe(text);
  });
});

describe("parseDecimal", () => {
  it.each([
    ["7.5", 7.5],
    ["7,5", 7.5],
    [" 12 ", 12],
    ["-3", -3],
    [".5", 0.5],
    ["10 000", 10000],
  ])("%j → %d", (raw, expected) => {
    expect(parseDecimal(raw)).toBe(expected);
  });

  it("treats empty input as null", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
  });

  it.each(["abc", "1,2,3", "1e5", "12km", "Infinity", "--1"])(
    "rejects %j",
    (raw) => {
      expect(parseDecimal(raw)).toBeNaN();
    },
  );
});

describe("formatWeekRange", () => {
  it("shows the year once within a year and twice across years", () => {
    expect(formatWeekRange("2026-09-28", "2026-10-04")).toBe(
      "28 sept – 4 oct 2026",
    );
    expect(formatWeekRange("2026-12-28", "2027-01-03")).toBe(
      "28 dic 2026 – 3 ene 2027",
    );
  });
});
