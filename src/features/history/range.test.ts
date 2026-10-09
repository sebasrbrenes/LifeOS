import { describe, expect, it } from "vitest";

import { DEFAULT_RANGE, parseComparison, parseRange } from "./range";

describe("parseRange", () => {
  it("accepts the offered ranges only", () => {
    expect(parseRange("30")).toBe(30);
    expect(parseRange("365")).toBe(365);
    expect(parseRange("7")).toBe(DEFAULT_RANGE);
    expect(parseRange(undefined)).toBe(DEFAULT_RANGE);
    expect(parseRange(["30"])).toBe(DEFAULT_RANGE);
  });
});

describe("parseComparison", () => {
  const today = "2026-10-07";

  it("defaults to 90 days ago vs today", () => {
    expect(parseComparison(undefined, undefined, today)).toEqual({
      from: "2026-07-09",
      to: today,
    });
  });

  it("orders the dates and clamps the future to today", () => {
    expect(parseComparison("2026-10-01", "2026-09-01", today)).toEqual({
      from: "2026-09-01",
      to: "2026-10-01",
    });
    expect(parseComparison("2026-09-01", "2030-01-01", today)).toEqual({
      from: "2026-09-01",
      to: today,
    });
    expect(parseComparison("nope", "2026-13-01", today)).toEqual({
      from: "2026-07-09",
      to: today,
    });
  });
});
