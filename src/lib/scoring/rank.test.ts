import { describe, expect, it } from "vitest";

import { DEFAULT_RANKS, displayScore, rankFor } from "./rank";

describe("rankFor", () => {
  it.each([
    [0, "D"],
    [29, "D"],
    [29.99, "D"],
    [30, "C"],
    [44, "C"],
    [45, "B"],
    [59, "B"],
    [60, "A"],
    [74, "A"],
    [75, "S"],
    [89, "S"],
    [90, "world_class"],
    [99, "world_class"],
    [99.99, "world_class"],
    [100, "complete"],
  ])("%d → %s", (score, key) => {
    expect(rankFor(score)?.key).toBe(key);
  });

  it("uses the spec labels", () => {
    expect(rankFor(95)?.label).toBe("World Class");
    expect(rankFor(100)?.label).toBe("Complete");
    expect(rankFor(54)?.label).toBe("B");
  });

  it("has no rank without a score", () => {
    expect(rankFor(null)).toBeNull();
    expect(rankFor(Number.NaN)).toBeNull();
  });

  it("absorbs float noise at boundaries", () => {
    expect(rankFor(59.99999999999999)?.key).toBe("A");
  });

  it("covers every whole score from 0 to 100 exactly once", () => {
    for (let score = 0; score <= 100; score += 1) {
      const matches = DEFAULT_RANKS.filter(
        (rank) => score >= rank.min && score <= rank.max,
      );
      expect(matches, `score ${score}`).toHaveLength(1);
    }
  });
});

describe("displayScore", () => {
  it.each([
    [54.8, 54],
    [99.6, 99],
    [100, 100],
    [0, 0],
    [0.4, 0],
    [-3, 0],
    [130, 100],
  ])("%d displays as %d", (score, shown) => {
    expect(displayScore(score)).toBe(shown);
  });
});
